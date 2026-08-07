import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeClient) return stripeClient;

  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  stripeClient = new Stripe(apiKey, {
    apiVersion: '2025-03-31.basil',
    typescript: true,
  });
  return stripeClient;
}

export type PlanKey = 'STARTER' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';

export interface PlanConfig {
  name: string;
  skuLimit: number;
  monthlyPriceId: string;
  yearlyPriceId: string;
  features: {
    velocityPeriods: string[];
    leadTimeGroups: number; // -1 = unlimited
    importsPerMonth: number; // -1 = unlimited
    onboarding: boolean;
    prioritySupport: boolean;
  };
}

// These Price IDs must be created in Stripe Dashboard and set as env vars
export const PLANS: Record<PlanKey, PlanConfig> = {
  STARTER: {
    name: 'Starter',
    skuLimit: 50,
    monthlyPriceId: process.env.STRIPE_PRICE_STARTER_MONTHLY!,
    yearlyPriceId: process.env.STRIPE_PRICE_STARTER_YEARLY!,
    features: {
      velocityPeriods: ['30d'],
      leadTimeGroups: 1,
      importsPerMonth: 1,
      onboarding: false,
      prioritySupport: false,
    },
  },
  PRO: {
    name: 'Pro',
    skuLimit: 200,
    monthlyPriceId: process.env.STRIPE_PRICE_PRO_MONTHLY!,
    yearlyPriceId: process.env.STRIPE_PRICE_PRO_YEARLY!,
    features: {
      velocityPeriods: ['7d', '30d', '90d'],
      leadTimeGroups: 3,
      importsPerMonth: 5,
      onboarding: false,
      prioritySupport: false,
    },
  },
  BUSINESS: {
    name: 'Business',
    skuLimit: 500,
    monthlyPriceId: process.env.STRIPE_PRICE_BUSINESS_MONTHLY!,
    yearlyPriceId: process.env.STRIPE_PRICE_BUSINESS_YEARLY!,
    features: {
      velocityPeriods: ['7d', '30d', '90d'],
      leadTimeGroups: -1,
      importsPerMonth: -1,
      onboarding: true,
      prioritySupport: false,
    },
  },
  ENTERPRISE: {
    name: 'Enterprise',
    skuLimit: 2000,
    monthlyPriceId: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY!,
    yearlyPriceId: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY!,
    features: {
      velocityPeriods: ['7d', '30d', '90d'],
      leadTimeGroups: -1,
      importsPerMonth: -1,
      onboarding: true,
      prioritySupport: true,
    },
  },
};

/** Resolve plan from a Stripe Price ID */
export function getPlanFromPriceId(priceId: string): PlanKey | null {
  for (const [key, plan] of Object.entries(PLANS)) {
    if (plan.monthlyPriceId === priceId || plan.yearlyPriceId === priceId) {
      return key as PlanKey;
    }
  }
  return null;
}
