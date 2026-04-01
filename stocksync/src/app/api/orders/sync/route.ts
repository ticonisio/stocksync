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
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) {
    return new Response(JSON.stringify({ error: 'Store not found' }), { status: 404 });
  }

  const token = decrypt(store.accessTokenEncrypted);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      let imported = 0;
      let skipped = 0;
      let pageInfo: string | null = null;
      let pageNum = 0;
      const limit = 250;

      try {
        // Phase 1: Import orders
        send({ phase: 'orders', message: 'Buscando pedidos da Shopify...', imported: 0 });

        do {
          pageNum++;
          const url: string = pageInfo
            ? `https://${store.shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/orders.json?limit=${limit}&page_info=${pageInfo}`
            : `https://${store.shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/orders.json?limit=${limit}&status=any`;

          const res: Response = await fetch(url, {
            headers: { 'X-Shopify-Access-Token': token },
            signal: AbortSignal.timeout(30000),
          });

          if (!res.ok) {
            send({ phase: 'error', message: `Erro na API Shopify: ${res.status}` });
            controller.close();
            return;
          }

          const data = (await res.json()) as { orders: ShopifyOrder[] };

          for (const shopifyOrder of data.orders) {
            const shopifyOrderId = String(shopifyOrder.id);
            const status = mapFinancialStatus(shopifyOrder.financial_status);

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

          send({
            phase: 'orders',
            message: `Importando pedidos... (página ${pageNum})`,
            imported,
          });

          // Parse Link header for cursor-based pagination
          pageInfo = null;
          const linkHeader: string | null = res.headers.get('link');
          if (linkHeader) {
            const nextMatch: RegExpMatchArray | null = linkHeader.match(
              /<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/
            );
            if (nextMatch) {
              pageInfo = nextMatch[1];
            }
          }
        } while (pageInfo);

        send({
          phase: 'orders',
          message: `${imported} pedidos importados`,
          imported,
          done: true,
        });

        // Phase 2: Calculate velocity
        send({ phase: 'velocity', message: 'Calculando velocity de vendas...', progress: 0 });

        await calculateAndSaveVelocity(store.id, undefined, (progress, total) => {
          send({
            phase: 'velocity',
            message: `Calculando velocity... ${progress}/${total} variantes`,
            progress,
            total,
          });
        });

        send({
          phase: 'velocity',
          message: 'Velocity calculada com sucesso',
          done: true,
        });

        // Done
        send({ phase: 'complete', imported, skipped });
      } catch (err) {
        send({
          phase: 'error',
          message: err instanceof Error ? err.message : 'Erro desconhecido',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
