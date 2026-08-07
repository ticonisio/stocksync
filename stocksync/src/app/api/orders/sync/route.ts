import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encrypt';
import { calculateAndSaveVelocity } from '@/services/velocity/calculateVelocity';
import { checkAndCreateNotifications } from '@/services/notifications/notification-service';
import { buildOrdersUrl, getHistoryStartDate } from '@/services/shopify/order-history';
import { z } from 'zod';

const syncRequestSchema = z.object({
  mode: z.enum(['incremental', 'history']).default('incremental'),
  period: z.enum(['30d', '90d', '365d', 'all']).default('90d'),
});

type SyncRequest = z.infer<typeof syncRequestSchema>;

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

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let requestData: SyncRequest;
  try {
    const rawBody = await req.text();
    const parsed = syncRequestSchema.safeParse(rawBody ? JSON.parse(rawBody) : {});
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid sync options' }), { status: 400 });
    }
    requestData = parsed.data;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) {
    return new Response(JSON.stringify({ error: 'Store not found' }), { status: 404 });
  }

  const token = decrypt(store.accessTokenEncrypted);
  const encoder = new TextEncoder();
  const syncStartedAt = new Date();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      let imported = 0;
      let skipped = 0;
      let pageInfo: string | null = null;
      let pageNum = 0;

      try {
        // Phase 1: Import historical orders or fetch only orders created since the last sync.
        const isHistoryImport = requestData.mode === 'history';
        const historyStartDate = getHistoryStartDate(requestData.period, syncStartedAt);
        send({
          phase: 'orders',
          message: isHistoryImport
            ? historyStartDate
              ? `Buscando pedidos desde ${historyStartDate.toLocaleDateString('pt-BR')}...`
              : 'Buscando todo o histórico de pedidos da Shopify...'
            : store.lastOrderSyncAt
              ? 'Buscando novos pedidos da Shopify...'
              : 'Buscando pedidos da Shopify...',
          imported: 0,
        });

        do {
          pageNum++;
          const url = buildOrdersUrl({
            shopifyDomain: store.shopifyDomain,
            pageInfo,
            mode: requestData.mode,
            period: requestData.period,
            lastOrderSyncAt: store.lastOrderSyncAt,
            now: syncStartedAt,
          });

          const res: Response = await fetch(url, {
            headers: { 'X-Shopify-Access-Token': token },
            signal: AbortSignal.timeout(30000),
          });

          if (!res.ok) {
            const message =
              res.status === 401 || res.status === 403
                ? 'A Shopify recusou o acesso aos pedidos. Verifique se o app da loja possui permissão para ler pedidos históricos.'
                : `Erro ao buscar pedidos na Shopify (HTTP ${res.status}).`;
            send({ phase: 'error', message });
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
              } else if (existing.quantity !== item.quantity) {
                await prisma.orderItem.update({
                  where: { id: existing.id },
                  data: { quantity: item.quantity },
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
          message: `${imported} pedidos processados`,
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

        const notifications = await checkAndCreateNotifications(store.id);

        send({
          phase: 'velocity',
          message: 'Insights e alertas atualizados com sucesso',
          done: true,
        });

        // Store the time captured before the import so orders created during the run
        // are included by the next incremental sync.
        await prisma.store.update({
          where: { id: store.id },
          data: { lastOrderSyncAt: syncStartedAt },
        });

        // Done
        send({
          phase: 'complete',
          imported,
          skipped,
          notifications,
          mode: requestData.mode,
          period: requestData.period,
        });
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
