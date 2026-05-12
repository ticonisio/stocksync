import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/encrypt';
import { registerWebhooks } from '@/services/shopify/webhooks';
import { z } from 'zod';

const schema = z.object({
  shopifyDomain: z
    .string()
    .min(1)
    .transform((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, ''))
    .refine((d) => /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(d), {
      message: 'Invalid Shopify domain',
    }),
  accessToken: z.string().min(1),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const { shopifyDomain, accessToken } = parsed.data;

  // Validate token against Shopify Admin API
  let shopifyRes: Response;
  try {
    shopifyRes = await fetch(
      `https://${shopifyDomain}/admin/api/2026-01/shop.json`,
      {
        headers: { 'X-Shopify-Access-Token': accessToken },
        signal: AbortSignal.timeout(10000),
      }
    );
  } catch {
    return NextResponse.json(
      { error: 'Não foi possível conectar à loja. Verifique o domínio informado.' },
      { status: 400 }
    );
  }

  if (!shopifyRes.ok) {
    return NextResponse.json(
      { error: 'Token ou domínio inválido. Verifique as credenciais da Custom App.' },
      { status: 400 }
    );
  }

  const store = await prisma.store.upsert({
    where: {
      userId_shopifyDomain: { userId: session.user.id, shopifyDomain },
    },
    update: {
      accessTokenEncrypted: encrypt(accessToken),
      syncStatus: 'PENDING',
    },
    create: {
      userId: session.user.id,
      shopifyDomain,
      accessTokenEncrypted: encrypt(accessToken),
      syncStatus: 'PENDING',
      webhooksRegistered: false,
    },
  });

  // Register webhooks asynchronously — failure must not block onboarding
  void registerWebhooks(store.id);

  return NextResponse.json({
    store: {
      id: store.id,
      shopifyDomain: store.shopifyDomain,
      syncStatus: store.syncStatus,
    },
  });
}
