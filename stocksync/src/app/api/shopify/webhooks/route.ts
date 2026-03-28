import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateAndSaveVelocity } from '@/services/velocity/calculateVelocity';

// ── HMAC verification ───────────────────────────────────────────────────────

function verifyHmac(rawBody: Buffer, hmacHeader: string): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) return false;

  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');

  const a = Buffer.from(computed);
  const b = Buffer.from(hmacHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ── Shopify payload types ───────────────────────────────────────────────────

interface ShopifyOrderPayload {
  id: number;
  line_items: Array<{
    variant_id: number;
    quantity: number;
  }>;
}

// ── Order processors ────────────────────────────────────────────────────────

async function processOrderPaid(storeId: string, payload: ShopifyOrderPayload): Promise<void> {
  const shopifyOrderId = String(payload.id);

  const order = await prisma.order.upsert({
    where: { storeId_shopifyOrderId: { storeId, shopifyOrderId } },
    update: { status: 'PAID' },
    create: { storeId, shopifyOrderId, status: 'PAID' },
  });

  for (const item of payload.line_items) {
    const variant = await prisma.variant.findUnique({
      where: {
        storeId_shopifyVariantId: { storeId, shopifyVariantId: String(item.variant_id) },
      },
    });
    if (!variant) continue; // AC 8: skip variants not in DB

    const existingItem = await prisma.orderItem.findFirst({
      where: { orderId: order.id, variantId: variant.id },
    });
    if (!existingItem) {
      await prisma.orderItem.create({
        data: { orderId: order.id, variantId: variant.id, quantity: item.quantity },
      });
    }

    // Atomic decrement to avoid race conditions between concurrent webhooks
    await prisma.$executeRaw`
      UPDATE "Variant"
      SET "availableStock" = GREATEST(0, "availableStock" - ${item.quantity})
      WHERE "id" = ${variant.id}
    `;
  }
}

async function processOrderCancelled(
  storeId: string,
  payload: ShopifyOrderPayload,
  status: 'CANCELLED' | 'REFUNDED'
): Promise<void> {
  const shopifyOrderId = String(payload.id);

  const order = await prisma.order.findUnique({
    where: { storeId_shopifyOrderId: { storeId, shopifyOrderId } },
    include: { items: true },
  });
  if (!order) return; // order not in DB — skip

  await prisma.order.update({ where: { id: order.id }, data: { status } });

  for (const item of order.items) {
    await prisma.variant.update({
      where: { id: item.variantId },
      data: { availableStock: { increment: item.quantity } },
    });
  }
}

// ── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  // Read raw body BEFORE any JSON parsing — required for HMAC to be valid
  const rawBuffer = Buffer.from(await req.arrayBuffer());
  const hmacHeader = req.headers.get('X-Shopify-Hmac-Sha256') ?? '';

  if (!verifyHmac(rawBuffer, hmacHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const topic = req.headers.get('X-Shopify-Topic') ?? '';
  const shopDomain = req.headers.get('X-Shopify-Shop-Domain') ?? '';
  const shopifyOrderId = req.headers.get('X-Shopify-Order-Id') ?? '';

  const store = await prisma.store.findFirst({ where: { shopifyDomain: shopDomain } });
  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  // Idempotency check — AC 7
  const existing = await prisma.webhookEvent.findUnique({
    where: {
      storeId_shopifyOrderId_eventType: {
        storeId: store.id,
        shopifyOrderId,
        eventType: topic,
      },
    },
  });
  if (existing) {
    return NextResponse.json({ ok: true }); // duplicate — ignore silently
  }

  // Parse payload — use unknown for Prisma Json compatibility
  const rawPayload = JSON.parse(rawBuffer.toString('utf-8')) as unknown;
  const payload = rawPayload as ShopifyOrderPayload;

  // Persist webhook event
  await prisma.webhookEvent.create({
    data: {
      storeId: store.id,
      shopifyOrderId,
      eventType: topic,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rawPayload: rawPayload as any,
    },
  });

  // Process by topic
  if (topic === 'orders/paid') {
    await processOrderPaid(store.id, payload);

    // Recalcular velocity das variantes afetadas — falha isolada, não afeta resposta do webhook
    try {
      const shopifyVariantIds = payload.line_items.map((i) => String(i.variant_id));
      const affectedVariants = await prisma.variant.findMany({
        where: { storeId: store.id, shopifyVariantId: { in: shopifyVariantIds } },
        select: { id: true },
      });
      const internalIds = affectedVariants.map((v) => v.id);
      if (internalIds.length > 0) {
        await calculateAndSaveVelocity(store.id, internalIds);
      }
    } catch (err) {
      console.error('[webhook] velocity recalculation failed:', err);
    }
  } else if (topic === 'orders/cancelled') {
    await processOrderCancelled(store.id, payload, 'CANCELLED');
  } else if (topic === 'orders/refunded') {
    await processOrderCancelled(store.id, payload, 'REFUNDED');
  }

  console.log(`[webhook] processed ${topic} for store ${store.id} order ${shopifyOrderId}`);

  return NextResponse.json({ ok: true });
}
