import { prisma } from '@/lib/prisma';

const VALID_PERIODS = ['7d', '30d', '90d'] as const;
type Period = (typeof VALID_PERIODS)[number];

export function parsePeriod(raw: string | null | undefined): Period {
  if (VALID_PERIODS.includes(raw as Period)) return raw as Period;
  return '30d';
}

export interface UrgencyItem {
  productId: string;
  title: string;
  topVariantTitle: string;
  velocityPerDay: number;
  totalAvailableStock: number;
  leadTimeDays: number;
  effectiveBuffer: number;
  urgency: number;
  status: 'CRÍTICO' | 'ATENÇÃO' | 'OK';
  reorderQty: number;
}

export async function getUrgencyItems(
  storeId: string,
  period: string
): Promise<UrgencyItem[]> {
  const effectivePeriod = parsePeriod(period);

  // Fetch products with lead time groups and variants
  const products = await prisma.product.findMany({
    where: { storeId },
    select: {
      id: true,
      title: true,
      leadTimeOverride: true,
      leadTimeGroups: {
        select: {
          leadTimeGroup: {
            select: { leadTimeDays: true, bufferDays: true },
          },
        },
      },
      variants: {
        select: { id: true, title: true, availableStock: true },
      },
    },
  });

  if (products.length === 0) return [];

  // Fetch sales velocities for all variants in this store+period
  const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));
  const velocities = await prisma.salesVelocity.findMany({
    where: { storeId, period: effectivePeriod, variantId: { in: variantIds } },
    select: { variantId: true, velocityPerDay: true },
  });

  const velMap = new Map<string, number>(
    velocities.map((sv) => [sv.variantId, sv.velocityPerDay])
  );

  const items: UrgencyItem[] = [];

  for (const product of products) {
    // Calculate velocity and stock rollups
    let velocityPerDay = 0;
    let totalAvailableStock = 0;
    let topVariantTitle = '';
    let topVariantVelocity = -1;

    for (const variant of product.variants) {
      const vel = velMap.get(variant.id) ?? 0;
      velocityPerDay += vel;
      totalAvailableStock += variant.availableStock;
      if (vel > topVariantVelocity) {
        topVariantVelocity = vel;
        topVariantTitle = variant.title;
      }
    }

    // Determine effective lead time
    const group = product.leadTimeGroups[0]?.leadTimeGroup ?? null;
    const effectiveLeadTimeDays = product.leadTimeOverride ?? group?.leadTimeDays ?? null;

    // Skip products without any lead time configured
    if (effectiveLeadTimeDays === null) continue;

    // Products with no velocity: show as OK (no demand = no urgency)
    if (velocityPerDay === 0) {
      items.push({
        productId: product.id,
        title: product.title,
        topVariantTitle: product.variants[0]?.title ?? '',
        velocityPerDay: 0,
        totalAvailableStock,
        leadTimeDays: effectiveLeadTimeDays,
        effectiveBuffer: group?.bufferDays ?? Math.max(7, Math.round(effectiveLeadTimeDays * 0.15)),
        urgency: Infinity,
        status: 'OK',
        reorderQty: 0,
      });
      continue;
    }

    // Calculate effective buffer
    const effectiveBuffer =
      group?.bufferDays ?? Math.max(7, Math.round(effectiveLeadTimeDays * 0.15));

    // Calculate urgency
    const urgency = Math.floor(totalAvailableStock / velocityPerDay) - effectiveLeadTimeDays;

    // Determine status
    const status: UrgencyItem['status'] =
      urgency <= 0 ? 'CRÍTICO' : urgency <= effectiveBuffer ? 'ATENÇÃO' : 'OK';

    // Recommended reorder quantity: enough stock to cover lead time + buffer
    const targetStock = Math.ceil(velocityPerDay * (effectiveLeadTimeDays + effectiveBuffer));
    const reorderQty = Math.max(0, targetStock - totalAvailableStock);

    items.push({
      productId: product.id,
      title: product.title,
      topVariantTitle,
      velocityPerDay,
      totalAvailableStock,
      leadTimeDays: effectiveLeadTimeDays,
      effectiveBuffer,
      urgency,
      status,
      reorderQty,
    });
  }

  // Sort by urgency ASC (CRÍTICO first)
  return items.sort((a, b) => a.urgency - b.urgency);
}
