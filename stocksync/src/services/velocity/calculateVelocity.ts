import { prisma } from '@/lib/prisma';

// ── Período → dias ──────────────────────────────────────────────────────────

const PERIOD_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

// ── Serviço principal ────────────────────────────────────────────────────────

/**
 * Calcula e persiste a velocity de vendas para variantes de uma store.
 *
 * @param storeId   - ID da store a processar
 * @param variantIds - IDs internos das variantes a recalcular.
 *                     Se omitido, recalcula TODAS as variantes da store.
 */
export async function calculateAndSaveVelocity(
  storeId: string,
  variantIds?: string[]
): Promise<void> {
  const variants = await prisma.variant.findMany({
    where: {
      storeId,
      ...(variantIds ? { id: { in: variantIds } } : {}),
    },
    select: { id: true },
  });

  for (const variant of variants) {
    for (const [period, days] of Object.entries(PERIOD_DAYS)) {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const result = await prisma.orderItem.aggregate({
        where: {
          variantId: variant.id,
          order: {
            storeId,
            status: 'PAID',
            createdAt: { gte: since },
          },
        },
        _sum: { quantity: true },
      });

      const unitsSold = result._sum.quantity ?? 0;
      const velocityPerDay = unitsSold / days;

      await prisma.salesVelocity.upsert({
        where: { variantId_period: { variantId: variant.id, period } },
        update: { unitsSold, velocityPerDay, calculatedAt: new Date() },
        create: { variantId: variant.id, storeId, period, unitsSold, velocityPerDay },
      });
    }
  }
}
