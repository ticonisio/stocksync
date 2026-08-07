import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encrypt';
import { calculateAndSaveVelocity } from '@/services/velocity/calculateVelocity';
import { checkAndCreateNotifications } from '@/services/notifications/notification-service';
import type { Prisma } from '@prisma/client';

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

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

// ── Order processors ────────────────────────────────────────────────────────

/** orders/create — FR8: pedido pendente → reservedStock incrementado */
async function processOrderCreate(
  db: Prisma.TransactionClient,
  storeId: string,
  payload: ShopifyOrderPayload
): Promise<void> {
  const shopifyOrderId = String(payload.id);

  // Different webhook deliveries can describe the same order. Never reserve it twice.
  const existingOrder = await db.order.findUnique({
    where: { storeId_shopifyOrderId: { storeId, shopifyOrderId } },
  });
  if (existingOrder) return;

  // The surrounding transaction ensures a later failure cannot leave a
  // partially reserved order behind. A concurrent create may fail on the
  // unique key; Shopify will retry and the lookup above will then short-circuit.
  const order = await db.order.create({
    data: { storeId, shopifyOrderId, status: 'PENDING' },
    select: { id: true },
  });

  for (const item of payload.line_items) {
    const variant = await db.variant.findUnique({
      where: {
        storeId_shopifyVariantId: { storeId, shopifyVariantId: String(item.variant_id) },
      },
    });
    if (!variant) continue;

    const existingItem = await db.orderItem.findFirst({
      where: { orderId: order.id, variantId: variant.id },
    });
    if (!existingItem) {
      await db.orderItem.create({
        data: { orderId: order.id, variantId: variant.id, quantity: item.quantity },
      });
    }

    // FR8: Mark as reserved — does NOT decrement available yet
    await db.$executeRaw`
      UPDATE "Variant"
      SET "reservedStock" = "reservedStock" + ${item.quantity}
      WHERE "id" = ${variant.id}
    `;
  }
}

/** orders/paid — FR7: decrementa available. Se PENDING→PAID, também libera reserved (Story 2.4 AC2) */
async function processOrderPaid(
  db: Prisma.TransactionClient,
  storeId: string,
  payload: ShopifyOrderPayload
): Promise<void> {
  const shopifyOrderId = String(payload.id);

  // Check if order already exists as PENDING (came through orders/create first)
  const existingOrder = await db.order.findUnique({
    where: { storeId_shopifyOrderId: { storeId, shopifyOrderId } },
  });
  // Ignore repeated or out-of-order terminal transitions. This prevents stock
  // from being decremented twice when Shopify sends more than one delivery.
  if (
    existingOrder?.status === 'PAID' ||
    existingOrder?.status === 'CANCELLED' ||
    existingOrder?.status === 'REFUNDED'
  ) {
    return;
  }
  const wasPending = existingOrder?.status === 'PENDING';
  let order: { id: string };

  if (existingOrder) {
    // Only one concurrent delivery may perform the PENDING -> PAID transition.
    // The conditional update becomes false after the first transaction commits.
    const transition = await db.order.updateMany({
      where: { id: existingOrder.id, status: 'PENDING' },
      data: { status: 'PAID' },
    });
    if (transition.count === 0) return;
    order = existingOrder;
  } else {
    order = await db.order.create({
      data: { storeId, shopifyOrderId, status: 'PAID' },
      select: { id: true },
    });
  }

  for (const item of payload.line_items) {
    const variant = await db.variant.findUnique({
      where: {
        storeId_shopifyVariantId: { storeId, shopifyVariantId: String(item.variant_id) },
      },
    });
    if (!variant) continue;

    const existingItem = await db.orderItem.findFirst({
      where: { orderId: order.id, variantId: variant.id },
    });
    if (!existingItem) {
      await db.orderItem.create({
        data: { orderId: order.id, variantId: variant.id, quantity: item.quantity },
      });
    }

    if (wasPending) {
      // PENDING→PAID: move from reserved to committed, decrement available
      await db.$executeRaw`
        UPDATE "Variant"
        SET "availableStock" = GREATEST(0, "availableStock" - ${item.quantity}),
            "reservedStock" = GREATEST(0, "reservedStock" - ${item.quantity})
        WHERE "id" = ${variant.id}
      `;
    } else {
      // Direct PAID (no prior orders/create): just decrement available
      await db.$executeRaw`
        UPDATE "Variant"
        SET "availableStock" = GREATEST(0, "availableStock" - ${item.quantity})
        WHERE "id" = ${variant.id}
      `;
    }
  }
}

async function processOrderCancelled(
  db: Prisma.TransactionClient,
  storeId: string,
  payload: ShopifyOrderPayload,
  newStatus: 'CANCELLED' | 'REFUNDED'
): Promise<void> {
  const shopifyOrderId = String(payload.id);

  const order = await db.order.findUnique({
    where: { storeId_shopifyOrderId: { storeId, shopifyOrderId } },
    include: { items: true },
  });
  if (!order) return;

  const wasPending = order.status === 'PENDING';
  const wasPaid = order.status === 'PAID';
  if (!wasPending && !wasPaid) return;

  // Prevent two different deliveries (for example cancelled and refunded)
  // from restoring the same stock concurrently.
  const transition = await db.order.updateMany({
    where: { id: order.id, status: order.status },
    data: { status: newStatus },
  });
  if (transition.count === 0) return;

  for (const item of order.items) {
    if (wasPending) {
      // FR9: PENDING cancelled → release reserved (not available)
      await db.$executeRaw`
        UPDATE "Variant"
        SET "reservedStock" = GREATEST(0, "reservedStock" - ${item.quantity})
        WHERE "id" = ${item.variantId}
      `;
    } else if (wasPaid) {
      // FR9/FR10: PAID cancelled/refunded → restore available
      await db.variant.update({
        where: { id: item.variantId },
        data: { availableStock: { increment: item.quantity } },
      });
    }
  }
}

// ── Product update processor ────────────────────────────────────────────────

interface ShopifyProductPayload {
  id: number;
  title: string;
  handle: string;
  variants: Array<{
    id: number;
    title: string;
    sku: string | null;
    price: string;
    inventory_quantity: number;
    inventory_item_id: number;
  }>;
}

const SHOPIFY_API_VERSION = '2026-01';

async function fetchInventoryItemCosts(
  domain: string,
  token: string,
  inventoryItemIds: number[]
): Promise<Map<number, number | null>> {
  const costMap = new Map<number, number | null>();
  if (inventoryItemIds.length === 0) return costMap;

  const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/inventory_items.json?ids=${inventoryItemIds.join(',')}`;
  const res = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': token },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return costMap;

  const data = (await res.json()) as { inventory_items: Array<{ id: number; cost: string | null }> };
  for (const item of data.inventory_items) {
    const cost = item.cost != null ? parseFloat(item.cost) : null;
    costMap.set(item.id, cost !== null && !isNaN(cost) ? cost : null);
  }
  return costMap;
}

async function processProductUpdate(storeId: string, payload: ShopifyProductPayload): Promise<void> {
  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
  const token = decrypt(store.accessTokenEncrypted);

  // Upsert product
  await prisma.product.upsert({
    where: { storeId_shopifyProductId: { storeId, shopifyProductId: String(payload.id) } },
    update: { title: payload.title, handle: payload.handle },
    create: { storeId, shopifyProductId: String(payload.id), title: payload.title, handle: payload.handle },
  });

  const productRecord = await prisma.product.findUnique({
    where: { storeId_shopifyProductId: { storeId, shopifyProductId: String(payload.id) } },
    select: { id: true },
  });
  if (!productRecord) return;

  // Fetch costs from inventory items API
  const inventoryItemIds = payload.variants
    .map((v) => v.inventory_item_id)
    .filter((id): id is number => id != null);
  const costMap = await fetchInventoryItemCosts(store.shopifyDomain, token, inventoryItemIds);

  // Upsert variants with price and cost
  for (const v of payload.variants) {
    const cost = costMap.get(v.inventory_item_id) ?? null;
    const price = v.price ? parseFloat(v.price) : null;
    await prisma.variant.upsert({
      where: { storeId_shopifyVariantId: { storeId, shopifyVariantId: String(v.id) } },
      update: {
        title: v.title,
        sku: v.sku ?? null,
        availableStock: v.inventory_quantity,
        averageCost: cost,
        price: price !== null && !isNaN(price) ? price : null,
      },
      create: {
        storeId,
        productId: productRecord.id,
        shopifyVariantId: String(v.id),
        title: v.title,
        sku: v.sku ?? null,
        availableStock: v.inventory_quantity,
        averageCost: cost,
        price: price !== null && !isNaN(price) ? price : null,
      },
    });
  }

  console.log(`[webhook] product updated: ${payload.title} (${payload.variants.length} variants)`);
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

  const store = await prisma.store.findFirst({ where: { shopifyDomain: shopDomain } });
  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  // Parse only after HMAC verification, but return a client error for signed invalid JSON.
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(rawBuffer.toString('utf-8')) as unknown;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const isProductTopic = topic === 'products/update' || topic === 'products/create';

  // Shopify guarantees a unique delivery ID and recommends using it to ignore retries.
  // The existing DB column is kept for migration compatibility, but stores this delivery ID.
  const idempotencyKey = req.headers.get('X-Shopify-Webhook-Id') ?? '';
  if (!idempotencyKey) {
    return NextResponse.json({ error: 'Missing webhook ID' }, { status: 400 });
  }

  const existing = await prisma.webhookEvent.findUnique({
    where: {
      storeId_shopifyOrderId_eventType: {
        storeId: store.id,
        shopifyOrderId: idempotencyKey,
        eventType: topic,
      },
    },
  });
  if (existing) {
    return NextResponse.json({ ok: true }); // duplicate delivery — ignore silently
  }

  // Create a processing lock before mutating inventory. If processing fails, the
  // record is removed so Shopify's retry can safely try again.
  let webhookEvent: { id: string };
  try {
    webhookEvent = await prisma.webhookEvent.create({
      data: {
        storeId: store.id,
        shopifyOrderId: idempotencyKey,
        eventType: topic,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rawPayload: rawPayload as any,
      },
      select: { id: true },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ ok: true });
    }
    throw error;
  }

  try {
    // Process by topic
    if (topic === 'orders/create') {
      await prisma.$transaction((tx) =>
        processOrderCreate(tx, store.id, rawPayload as ShopifyOrderPayload)
      );
    } else if (topic === 'orders/paid') {
      const payload = rawPayload as ShopifyOrderPayload;
      await prisma.$transaction((tx) => processOrderPaid(tx, store.id, payload));

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
          await checkAndCreateNotifications(store.id);
        }
      } catch (err) {
        console.error('[webhook] velocity recalculation failed:', err);
      }
    } else if (topic === 'orders/cancelled') {
      await prisma.$transaction((tx) =>
        processOrderCancelled(tx, store.id, rawPayload as ShopifyOrderPayload, 'CANCELLED')
      );

    // Recalcular velocity — cancel remove a venda do dataset (FR16)
    try {
      const payload = rawPayload as ShopifyOrderPayload;
      const shopifyVariantIds = payload.line_items.map((i) => String(i.variant_id));
      const affectedVariants = await prisma.variant.findMany({
        where: { storeId: store.id, shopifyVariantId: { in: shopifyVariantIds } },
        select: { id: true },
      });
      const internalIds = affectedVariants.map((v) => v.id);
      if (internalIds.length > 0) {
        await calculateAndSaveVelocity(store.id, internalIds);
        await checkAndCreateNotifications(store.id);
      }
    } catch (err) {
      console.error('[webhook] velocity recalculation after cancel failed:', err);
    }
    } else if (topic === 'orders/refunded') {
      await prisma.$transaction((tx) =>
        processOrderCancelled(tx, store.id, rawPayload as ShopifyOrderPayload, 'REFUNDED')
      );

    // Recalcular velocity — refund remove a venda do dataset (FR16)
    try {
      const payload = rawPayload as ShopifyOrderPayload;
      const shopifyVariantIds = payload.line_items.map((i) => String(i.variant_id));
      const affectedVariants = await prisma.variant.findMany({
        where: { storeId: store.id, shopifyVariantId: { in: shopifyVariantIds } },
        select: { id: true },
      });
      const internalIds = affectedVariants.map((v) => v.id);
      if (internalIds.length > 0) {
        await calculateAndSaveVelocity(store.id, internalIds);
        await checkAndCreateNotifications(store.id);
      }
    } catch (err) {
      console.error('[webhook] velocity recalculation after refund failed:', err);
    }
    } else if (isProductTopic) {
      await processProductUpdate(store.id, rawPayload as ShopifyProductPayload);
    }

    console.log(`[webhook] processed ${topic} for store ${store.id}`);
  } catch (error) {
    await prisma.webhookEvent
      .delete({ where: { id: webhookEvent.id } })
      .catch((cleanupError) => console.error('[webhook] failed to release processing lock:', cleanupError));
    console.error(`[webhook] failed ${topic} for store ${store.id}:`, error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
