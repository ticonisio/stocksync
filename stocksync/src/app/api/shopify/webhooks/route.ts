import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encrypt';
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

/** orders/create — FR8: pedido pendente → reservedStock incrementado */
async function processOrderCreate(storeId: string, payload: ShopifyOrderPayload): Promise<void> {
  const shopifyOrderId = String(payload.id);

  const order = await prisma.order.upsert({
    where: { storeId_shopifyOrderId: { storeId, shopifyOrderId } },
    update: {},
    create: { storeId, shopifyOrderId, status: 'PENDING' },
  });

  // Only process if newly created as PENDING (not if already exists as PAID)
  if (order.status !== 'PENDING') return;

  for (const item of payload.line_items) {
    const variant = await prisma.variant.findUnique({
      where: {
        storeId_shopifyVariantId: { storeId, shopifyVariantId: String(item.variant_id) },
      },
    });
    if (!variant) continue;

    const existingItem = await prisma.orderItem.findFirst({
      where: { orderId: order.id, variantId: variant.id },
    });
    if (!existingItem) {
      await prisma.orderItem.create({
        data: { orderId: order.id, variantId: variant.id, quantity: item.quantity },
      });
    }

    // FR8: Mark as reserved — does NOT decrement available yet
    await prisma.$executeRaw`
      UPDATE "Variant"
      SET "reservedStock" = "reservedStock" + ${item.quantity}
      WHERE "id" = ${variant.id}
    `;
  }
}

/** orders/paid — FR7: decrementa available. Se PENDING→PAID, também libera reserved (Story 2.4 AC2) */
async function processOrderPaid(storeId: string, payload: ShopifyOrderPayload): Promise<void> {
  const shopifyOrderId = String(payload.id);

  // Check if order already exists as PENDING (came through orders/create first)
  const existingOrder = await prisma.order.findUnique({
    where: { storeId_shopifyOrderId: { storeId, shopifyOrderId } },
  });
  const wasPending = existingOrder?.status === 'PENDING';

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
    if (!variant) continue;

    const existingItem = await prisma.orderItem.findFirst({
      where: { orderId: order.id, variantId: variant.id },
    });
    if (!existingItem) {
      await prisma.orderItem.create({
        data: { orderId: order.id, variantId: variant.id, quantity: item.quantity },
      });
    }

    if (wasPending) {
      // PENDING→PAID: move from reserved to committed, decrement available
      await prisma.$executeRaw`
        UPDATE "Variant"
        SET "availableStock" = GREATEST(0, "availableStock" - ${item.quantity}),
            "reservedStock" = GREATEST(0, "reservedStock" - ${item.quantity})
        WHERE "id" = ${variant.id}
      `;
    } else {
      // Direct PAID (no prior orders/create): just decrement available
      await prisma.$executeRaw`
        UPDATE "Variant"
        SET "availableStock" = GREATEST(0, "availableStock" - ${item.quantity})
        WHERE "id" = ${variant.id}
      `;
    }
  }
}

async function processOrderCancelled(
  storeId: string,
  payload: ShopifyOrderPayload,
  newStatus: 'CANCELLED' | 'REFUNDED'
): Promise<void> {
  const shopifyOrderId = String(payload.id);

  const order = await prisma.order.findUnique({
    where: { storeId_shopifyOrderId: { storeId, shopifyOrderId } },
    include: { items: true },
  });
  if (!order) return;

  const wasPending = order.status === 'PENDING';

  await prisma.order.update({ where: { id: order.id }, data: { status: newStatus } });

  for (const item of order.items) {
    if (wasPending) {
      // FR9: PENDING cancelled → release reserved (not available)
      await prisma.$executeRaw`
        UPDATE "Variant"
        SET "reservedStock" = GREATEST(0, "reservedStock" - ${item.quantity})
        WHERE "id" = ${item.variantId}
      `;
    } else {
      // FR9/FR10: PAID cancelled/refunded → restore available
      await prisma.variant.update({
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

  // Parse payload
  const rawPayload = JSON.parse(rawBuffer.toString('utf-8')) as unknown;

  const isProductTopic = topic === 'products/update' || topic === 'products/create';

  // Idempotency: for order webhooks use shopifyOrderId; for product webhooks use product ID from payload
  const idempotencyKey = isProductTopic
    ? String((rawPayload as ShopifyProductPayload).id)
    : (req.headers.get('X-Shopify-Order-Id') ?? '');

  const existing = await prisma.webhookEvent.findUnique({
    where: {
      storeId_shopifyOrderId_eventType: {
        storeId: store.id,
        shopifyOrderId: idempotencyKey,
        eventType: topic,
      },
    },
  });
  if (existing && !isProductTopic) {
    return NextResponse.json({ ok: true }); // duplicate order — ignore silently
  }

  // Persist webhook event (upsert for product topics to allow re-processing)
  if (isProductTopic) {
    await prisma.webhookEvent.upsert({
      where: {
        storeId_shopifyOrderId_eventType: {
          storeId: store.id,
          shopifyOrderId: idempotencyKey,
          eventType: topic,
        },
      },
      update: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rawPayload: rawPayload as any,
      },
      create: {
        storeId: store.id,
        shopifyOrderId: idempotencyKey,
        eventType: topic,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rawPayload: rawPayload as any,
      },
    });
  } else {
    await prisma.webhookEvent.create({
      data: {
        storeId: store.id,
        shopifyOrderId: idempotencyKey,
        eventType: topic,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rawPayload: rawPayload as any,
      },
    });
  }

  // Process by topic
  if (topic === 'orders/create') {
    await processOrderCreate(store.id, rawPayload as ShopifyOrderPayload);
  } else if (topic === 'orders/paid') {
    const payload = rawPayload as ShopifyOrderPayload;
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
    await processOrderCancelled(store.id, rawPayload as ShopifyOrderPayload, 'CANCELLED');

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
      }
    } catch (err) {
      console.error('[webhook] velocity recalculation after cancel failed:', err);
    }
  } else if (topic === 'orders/refunded') {
    await processOrderCancelled(store.id, rawPayload as ShopifyOrderPayload, 'REFUNDED');

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
      }
    } catch (err) {
      console.error('[webhook] velocity recalculation after refund failed:', err);
    }
  } else if (isProductTopic) {
    await processProductUpdate(store.id, rawPayload as ShopifyProductPayload);
  }

  console.log(`[webhook] processed ${topic} for store ${store.id}`);

  return NextResponse.json({ ok: true });
}
