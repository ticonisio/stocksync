import { NextRequest, NextResponse } from 'next/server';
import { getStripe, getPlanFromPriceId } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import type { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import type Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Stripe webhook signature verification failed:', message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    await handleEvent(event, stripe);
  } catch (err) {
    console.error('Stripe webhook handler error:', err);
    // A non-2xx response asks Stripe to retry transient processing failures.
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(event: Stripe.Event, stripe: Stripe) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === 'subscription' && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id
        );
        await upsertSubscription(subscription);
      }
      break;
    }

    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const invoice = event.data.object as unknown as Record<string, unknown>;
      const subId = invoice.subscription;
      if (typeof subId === 'string') {
        const subscription = await stripe.subscriptions.retrieve(subId);
        await upsertSubscription(subscription);
      }
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await upsertSubscription(subscription);
      break;
    }
  }
}

function mapStripeStatus(status: string): SubscriptionStatus {
  const map: Record<string, SubscriptionStatus> = {
    trialing: 'TRIALING',
    active: 'ACTIVE',
    past_due: 'PAST_DUE',
    canceled: 'CANCELED',
    unpaid: 'UNPAID',
  };
  return map[status] ?? 'CANCELED';
}

async function upsertSubscription(subscription: Stripe.Subscription) {
  const storeId = subscription.metadata.storeId;
  if (!storeId) {
    console.error('Stripe subscription missing storeId metadata:', subscription.id);
    return;
  }

  const item = subscription.items.data[0];
  if (!item) return;

  const priceId = item.price.id;
  const plan = getPlanFromPriceId(priceId);
  if (!plan) {
    console.error('Unknown Stripe price ID:', priceId);
    return;
  }

  // Stripe SDK v22: current_period_end is on items, not subscription root
  // For trials, fall back to trial_end. cancel_at_period_end is on subscription root.
  const itemRaw = item as unknown as Record<string, unknown>;
  const subRaw = subscription as unknown as Record<string, unknown>;
  const periodEnd = (itemRaw.current_period_end as number)
    || (subRaw.trial_end as number)
    || Math.floor(Date.now() / 1000) + 30 * 86400;
  const cancelAtEnd = (subRaw.cancel_at_period_end as boolean) ?? false;

  await prisma.subscription.upsert({
    // A store can receive a new Stripe subscription ID after cancelling and
    // subscribing again. Store is the durable identity in our data model.
    where: { storeId },
    create: {
      storeId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      plan: plan as SubscriptionPlan,
      status: mapStripeStatus(subscription.status),
      currentPeriodEnd: new Date(periodEnd * 1000),
      cancelAtPeriodEnd: cancelAtEnd,
    },
    update: {
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      plan: plan as SubscriptionPlan,
      status: mapStripeStatus(subscription.status),
      currentPeriodEnd: new Date(periodEnd * 1000),
      cancelAtPeriodEnd: cancelAtEnd,
    },
  });
}
