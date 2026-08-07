import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getStripe, PLANS } from '@/lib/stripe';
import { z } from 'zod';

const checkoutSchema = z.object({
  plan: z.enum(['STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE']),
  interval: z.enum(['monthly', 'yearly']),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = checkoutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid plan or interval' }, { status: 400 });
  }
  const { plan, interval } = parsed.data;

  const planConfig = PLANS[plan];

  const store = await prisma.store.findFirst({
    where: { userId: session.user.id },
    select: { id: true, stripeCustomerId: true, shopifyDomain: true },
  });

  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const stripe = getStripe();

  // Reuse or create Stripe customer
  let customerId = store.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.user.email!,
      metadata: {
        storeId: store.id,
        shopifyDomain: store.shopifyDomain,
      },
    });
    customerId = customer.id;
    await prisma.store.update({
      where: { id: store.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const priceId = interval === 'yearly' ? planConfig.yearlyPriceId : planConfig.monthlyPriceId;

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 14,
      metadata: { storeId: store.id, plan },
    },
    success_url: `${process.env.NEXTAUTH_URL}/dashboard?checkout=success`,
    cancel_url: `${process.env.NEXTAUTH_URL}/settings?checkout=canceled`,
    metadata: { storeId: store.id, plan },
  });

  return NextResponse.json({ url: checkoutSession.url });
}
