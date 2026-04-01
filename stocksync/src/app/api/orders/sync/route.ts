import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encrypt';
import { calculateAndSaveVelocity } from '@/services/velocity/calculateVelocity';

const SHOPIFY_API_VERSION = '2026-01';

interface ShopifyOrder {
  id: number;
  financial_status: string;
  created_at: string;
  line_items: Array<{
    variant_id: number | null;
    quantity: number;
  }>;
}

function mapFinancialStatus(status: string): 'PAID' | 'CANCELLED' | 'REFUNDED' | 'PENDING' {
  switch (status) {
    case 'paid':
    case 'partially_paid':
      return 'PAID';
    case 'refunded':
    case 'partially_refunded':
      return 'REFUNDED';
    case 'voided':
      return 'CANCELLED';
    default:
      return 'PENDING';
  }
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const token = decrypt(store.accessTokenEncrypted);
  let imported = 0;
  let skipped = 0;
  let pageInfo: string | null = null;
  const limit = 250;

  // Paginate through all orders from Shopify
  do {
    const url: string = pageInfo
      ? `https://${store.shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/orders.json?limit=${limit}&page_info=${pageInfo}`
      : `https://${store.shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/orders.json?limit=${limit}&status=any`;

    const res: Response = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': token },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Shopify API error: ${res.status}` },
        { status: 502 }
      );
    }

    const data = (await res.json()) as { orders: ShopifyOrder[] };

    for (const shopifyOrder of data.orders) {
      const shopifyOrderId = String(shopifyOrder.id);
      const status = mapFinancialStatus(shopifyOrder.financial_status);

      // Upsert order
      const order = await prisma.order.upsert({
        where: { storeId_shopifyOrderId: { storeId: store.id, shopifyOrderId } },
        update: { status },
        create: {
          storeId: store.id,
          shopifyOrderId,
          status,
          createdAt: new Date(shopifyOrder.created_at),
        },
      });

      // Upsert order items
      let hasItems = false;
      for (const item of shopifyOrder.line_items) {
        if (!item.variant_id) continue;

        const variant = await prisma.variant.findUnique({
          where: {
            storeId_shopifyVariantId: {
              storeId: store.id,
              shopifyVariantId: String(item.variant_id),
            },
          },
        });
        if (!variant) continue;

        const existing = await prisma.orderItem.findFirst({
          where: { orderId: order.id, variantId: variant.id },
        });
        if (!existing) {
          await prisma.orderItem.create({
            data: { orderId: order.id, variantId: variant.id, quantity: item.quantity },
          });
        }
        hasItems = true;
      }

      if (hasItems) imported++;
      else skipped++;
    }

    // Parse Link header for cursor-based pagination
    pageInfo = null;
    const linkHeader: string | null = res.headers.get('link');
    if (linkHeader) {
      const nextMatch: RegExpMatchArray | null = linkHeader.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
      if (nextMatch) {
        pageInfo = nextMatch[1];
      }
    }
  } while (pageInfo);

  // Recalculate velocity for all variants using historical order data
  try {
    await calculateAndSaveVelocity(store.id);
  } catch (err) {
    console.error('[orders/sync] velocity recalculation failed:', err);
  }

  return NextResponse.json({ imported, skipped });
}
