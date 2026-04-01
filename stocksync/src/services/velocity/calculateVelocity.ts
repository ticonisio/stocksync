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
 *                     Se omitido, recalcula TODAS as variantes da store (batch SQL).
 */
export async function calculateAndSaveVelocity(
  storeId: string,
  variantIds?: string[],
  onProgress?: (progress: number, total: number) => void
): Promise<void> {
  // When recalculating specific variants (webhook), use per-variant queries
  if (variantIds && variantIds.length > 0) {
    await calculateForVariants(storeId, variantIds);
    return;
  }

  // Batch mode: one SQL query per period for ALL variants in the store
  for (const [period, days] of Object.entries(PERIOD_DAYS)) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Count only PAID orders — FR16: velocity "baseada em pedidos pagos"
    const rows = await prisma.$queryRaw<
      Array<{ variantId: string; unitsSold: bigint }>
    >`
      SELECT oi."variantId", COALESCE(SUM(oi."quantity"), 0) as "unitsSold"
      FROM "OrderItem" oi
      JOIN "Order" o ON o."id" = oi."orderId"
      WHERE o."storeId" = ${storeId}
        AND o."status" NOT IN ('CANCELLED', 'REFUNDED')
        AND o."createdAt" >= ${since}
      GROUP BY oi."variantId"
    `;

    const soldMap = new Map<string, number>();
    for (const row of rows) {
      soldMap.set(row.variantId, Number(row.unitsSold));
    }

    // Get all variants for this store
    const allVariants = await prisma.variant.findMany({
      where: { storeId },
      select: { id: true },
    });

    // Batch upsert all velocities
    for (let i = 0; i < allVariants.length; i++) {
      const variant = allVariants[i];
      const unitsSold = soldMap.get(variant.id) ?? 0;
      const velocityPerDay = unitsSold / days;

      await prisma.salesVelocity.upsert({
        where: { variantId_period: { variantId: variant.id, period } },
        update: { unitsSold, velocityPerDay, calculatedAt: new Date() },
        create: { variantId: variant.id, storeId, period, unitsSold, velocityPerDay },
      });

      // Report progress on last period (90d) to avoid triple-counting
      if (period === '90d' && onProgress) {
        onProgress(i + 1, allVariants.length);
      }
    }
  }
}

/** Per-variant calculation (used by webhooks for a few variants) */
async function calculateForVariants(storeId: string, variantIds: string[]): Promise<void> {
  for (const variantId of variantIds) {
    for (const [period, days] of Object.entries(PERIOD_DAYS)) {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const result = await prisma.orderItem.aggregate({
        where: {
          variantId,
          order: { storeId, status: { notIn: ['CANCELLED', 'REFUNDED'] }, createdAt: { gte: since } },
        },
        _sum: { quantity: true },
      });

      const unitsSold = result._sum.quantity ?? 0;
      const velocityPerDay = unitsSold / days;

      await prisma.salesVelocity.upsert({
        where: { variantId_period: { variantId, period } },
        update: { unitsSold, velocityPerDay, calculatedAt: new Date() },
        create: { variantId, storeId, period, unitsSold, velocityPerDay },
      });
    }
  }
}
