import { prisma } from '@/lib/prisma';
import { PLANS, type PlanKey } from '@/lib/stripe';
import type { Subscription } from '@prisma/client';

export async function getSubscription(storeId: string): Promise<Subscription | null> {
  return prisma.subscription.findUnique({ where: { storeId } });
}

export function isSubscriptionActive(sub: Subscription | null): boolean {
  if (!sub) return false;
  return (
    (sub.status === 'ACTIVE' || sub.status === 'TRIALING') &&
    sub.currentPeriodEnd > new Date()
  );
}

export function getPlanLimits(plan: PlanKey | null) {
  if (!plan) {
    // No subscription — block access
    return {
      name: 'Sem plano',
      skuLimit: 0,
      velocityPeriods: [] as string[],
      leadTimeGroups: 0,
      importsPerMonth: 0,
      onboarding: false,
      prioritySupport: false,
    };
  }

  const config = PLANS[plan];
  return {
    name: config.name,
    skuLimit: config.skuLimit,
    ...config.features,
  };
}

export async function getStoreWithPlan(storeId: string) {
  const sub = await getSubscription(storeId);
  const active = isSubscriptionActive(sub);
  const limits = getPlanLimits(active ? (sub!.plan as PlanKey) : null);

  return {
    subscription: sub,
    isActive: active,
    plan: active ? (sub!.plan as PlanKey) : null,
    limits,
  };
}

/** Check if store has exceeded its SKU limit */
export async function checkSkuLimit(storeId: string): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
}> {
  const { limits } = await getStoreWithPlan(storeId);

  const variantCount = await prisma.variant.count({ where: { storeId } });

  return {
    allowed: limits.skuLimit === -1 || variantCount <= limits.skuLimit,
    current: variantCount,
    limit: limits.skuLimit,
  };
}

/** Check if store can create more imports this month */
export async function checkImportLimit(storeId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
}> {
  const { limits } = await getStoreWithPlan(storeId);

  if (limits.importsPerMonth === -1) {
    return { allowed: true, used: 0, limit: -1 };
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const importCount = await prisma.import.count({
    where: { storeId, createdAt: { gte: startOfMonth } },
  });

  return {
    allowed: importCount < limits.importsPerMonth,
    used: importCount,
    limit: limits.importsPerMonth,
  };
}
