'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { PlanKey } from '@/lib/stripe';

interface BillingCardProps {
  plan: PlanKey | null;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

interface PlanDetail {
  name: string;
  skuLimit: string;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
  highlighted?: boolean;
}

const PLANS_DETAIL: Record<PlanKey, PlanDetail> = {
  STARTER: {
    name: 'Starter',
    skuLimit: '50 SKUs',
    priceMonthly: 47,
    priceYearly: 449,
    features: [
      'Alertas de recompra',
      'Dashboard em tempo real',
      'Estoque reservado vs disponível',
      'Velocity de vendas (30 dias)',
      '1 grupo de lead time',
      '1 import de planilha/mês',
      'Filtro por coleção',
      'Aba de pedidos realtime',
    ],
  },
  PRO: {
    name: 'Pro',
    skuLimit: '200 SKUs',
    priceMonthly: 97,
    priceYearly: 929,
    highlighted: true,
    features: [
      'Tudo do Starter, mais:',
      'Velocity de vendas (7/30/90 dias)',
      '3 grupos de lead time',
      '5 imports de planilha/mês',
    ],
  },
  BUSINESS: {
    name: 'Business',
    skuLimit: '500 SKUs',
    priceMonthly: 197,
    priceYearly: 1890,
    features: [
      'Tudo do Pro, mais:',
      'Grupos de lead time ilimitados',
      'Imports de planilha ilimitados',
      'Onboarding 1-on-1',
    ],
  },
  ENTERPRISE: {
    name: 'Enterprise',
    skuLimit: '2.000 SKUs',
    priceMonthly: 397,
    priceYearly: 3810,
    features: [
      'Tudo do Business, mais:',
      'Suporte prioritário',
    ],
  },
};

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  TRIALING: { label: 'Trial 14 dias', variant: 'secondary' },
  ACTIVE: { label: 'Ativo', variant: 'default' },
  PAST_DUE: { label: 'Pagamento pendente', variant: 'destructive' },
  CANCELED: { label: 'Cancelado', variant: 'destructive' },
  UNPAID: { label: 'Inadimplente', variant: 'destructive' },
};

const PLAN_ORDER: PlanKey[] = ['STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'];

export function BillingCard({ plan, status, currentPeriodEnd, cancelAtPeriodEnd }: BillingCardProps) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleCheckout(selectedPlan: PlanKey, interval: 'monthly' | 'yearly') {
    setLoading(`${selectedPlan}-${interval}`);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan, interval }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(null);
    }
  }

  async function handlePortal() {
    setLoading('portal');
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(null);
    }
  }

  const currentPlanIndex = plan ? PLAN_ORDER.indexOf(plan) : -1;
  const periodEnd = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString('pt-BR')
    : null;
  const statusInfo = status ? STATUS_CONFIG[status] : null;

  return (
    <div className="space-y-6">
      {/* Current plan summary */}
      <Card>
        <CardHeader>
          <CardTitle>Seu Plano</CardTitle>
          <CardDescription>
            {plan
              ? 'Gerencie sua assinatura e veja o que está incluso.'
              : 'Escolha um plano para desbloquear todas as funcionalidades.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {plan && status ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold">
                    {PLANS_DETAIL[plan].name}
                  </span>
                  {statusInfo && (
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Até {PLANS_DETAIL[plan].skuLimit} &middot; R${PLANS_DETAIL[plan].priceMonthly}/mês
                </p>
                {periodEnd && (
                  <p className="text-sm text-muted-foreground">
                    {cancelAtPeriodEnd
                      ? `Cancela em ${periodEnd}`
                      : `Renova em ${periodEnd}`}
                  </p>
                )}
              </div>
              <Button onClick={handlePortal} disabled={loading === 'portal'} variant="outline">
                {loading === 'portal' ? 'Abrindo...' : 'Gerenciar assinatura'}
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
              <p className="font-medium">Nenhum plano ativo</p>
              <p className="text-sm">Escolha um plano abaixo para começar com 14 dias grátis.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* What's included in current plan */}
      {plan && (
        <Card>
          <CardHeader>
            <CardTitle>O que está incluso</CardTitle>
            <CardDescription>
              Funcionalidades do plano {PLANS_DETAIL[plan].name} ({PLANS_DETAIL[plan].skuLimit})
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {getAllFeaturesForPlan(plan).map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 text-green-600">&#10003;</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* All plans grid */}
      <Card>
        <CardHeader>
          <CardTitle>{plan ? 'Trocar de plano' : 'Escolha seu plano'}</CardTitle>
          <CardDescription>
            Todos os planos incluem 14 dias de trial grátis. Cancele quando quiser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLAN_ORDER.map((p, index) => {
              const detail = PLANS_DETAIL[p];
              const isCurrent = p === plan;
              const isUpgrade = plan ? index > currentPlanIndex : false;
              const isDowngrade = plan ? index < currentPlanIndex : false;

              return (
                <div
                  key={p}
                  className={`relative flex flex-col rounded-lg border p-4 ${
                    detail.highlighted && !plan ? 'border-primary ring-1 ring-primary' : ''
                  } ${isCurrent ? 'border-primary bg-primary/5' : ''}`}
                >
                  {detail.highlighted && !plan && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                      <Badge variant="default" className="text-xs">Popular</Badge>
                    </div>
                  )}
                  {isCurrent && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                      <Badge variant="default" className="text-xs">Plano atual</Badge>
                    </div>
                  )}

                  <h3 className="font-semibold">{detail.name}</h3>
                  <p className="text-xs text-muted-foreground">Até {detail.skuLimit}</p>

                  <p className="mt-3 text-2xl font-bold">
                    R${detail.priceMonthly}
                    <span className="text-sm font-normal text-muted-foreground">/mês</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ou R${detail.priceYearly}/ano (20% off)
                  </p>

                  <ul className="mt-4 flex-1 space-y-1.5">
                    {detail.features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <span className="mt-0.5 text-green-600">&#10003;</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 flex flex-col gap-2">
                    {isCurrent ? (
                      <Button disabled size="sm" variant="outline">
                        Plano atual
                      </Button>
                    ) : (
                      <>
                        <Button
                          onClick={() => handleCheckout(p, 'monthly')}
                          disabled={loading !== null}
                          size="sm"
                          variant={isDowngrade ? 'outline' : 'default'}
                        >
                          {loading === `${p}-monthly`
                            ? 'Abrindo...'
                            : isUpgrade
                              ? 'Upgrade mensal'
                              : isDowngrade
                                ? 'Downgrade mensal'
                                : 'Começar trial'}
                        </Button>
                        <Button
                          onClick={() => handleCheckout(p, 'yearly')}
                          disabled={loading !== null}
                          variant="outline"
                          size="sm"
                        >
                          {loading === `${p}-yearly`
                            ? 'Abrindo...'
                            : isUpgrade || isDowngrade
                              ? 'Anual (20% off)'
                              : 'Trial anual (20% off)'}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Mais de 2.000 SKUs?{' '}
            <a href="mailto:contato@stocksync.com.br" className="underline hover:text-foreground">
              Fale com nosso time
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/** Returns full feature list for a plan (including inherited from lower tiers) */
function getAllFeaturesForPlan(plan: PlanKey): string[] {
  const base = [
    'Alertas de recompra (CRITICO / ATENÇÃO / OK)',
    'Dashboard em tempo real (<5s)',
    'Estoque reservado vs disponível',
    'Filtro por coleção Shopify',
    'Aba de pedidos realtime',
  ];

  const byPlan: Record<PlanKey, string[]> = {
    STARTER: [
      ...base,
      'Velocity de vendas (30 dias)',
      '1 grupo de lead time',
      '1 import de planilha por mês',
    ],
    PRO: [
      ...base,
      'Velocity de vendas (7, 30 e 90 dias)',
      '3 grupos de lead time',
      '5 imports de planilha por mês',
    ],
    BUSINESS: [
      ...base,
      'Velocity de vendas (7, 30 e 90 dias)',
      'Grupos de lead time ilimitados',
      'Imports de planilha ilimitados',
      'Onboarding 1-on-1 com o time',
    ],
    ENTERPRISE: [
      ...base,
      'Velocity de vendas (7, 30 e 90 dias)',
      'Grupos de lead time ilimitados',
      'Imports de planilha ilimitados',
      'Onboarding 1-on-1 com o time',
      'Suporte prioritário',
    ],
  };

  return byPlan[plan];
}
