import { Suspense } from 'react';
import { TrendingUp, AlertTriangle, Package } from 'lucide-react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { aggregateVelocityByProduct } from '@/lib/insightsAggregator';
import { InsightCard } from '@/components/insights/InsightCard';
import { InsightsList } from '@/components/insights/InsightsList';
import { PeriodSelector } from '@/components/insights/PeriodSelector';
import { Card, CardContent } from '@/components/ui/card';
import { requireActiveSubscription } from '@/lib/require-subscription';
import { getStoreWithPlan } from '@/lib/subscription';

const VALID_PERIODS = ['7d', '30d', '90d'] as const;
type Period = (typeof VALID_PERIODS)[number];

const PERIOD_LABELS: Record<Period, string> = {
  '7d': '7 dias',
  '30d': '30 dias',
  '90d': '90 dias',
};

function parsePeriod(raw: string | undefined, allowedPeriods: string[]): Period {
  if (VALID_PERIODS.includes(raw as Period) && allowedPeriods.includes(raw as string)) return raw as Period;
  // Default to the best allowed period
  if (allowedPeriods.includes('30d')) return '30d';
  return (allowedPeriods[0] as Period) ?? '30d';
}

interface InsightsPageProps {
  searchParams: { period?: string };
}

export default async function InsightsPage({ searchParams }: InsightsPageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) redirect('/connect-shopify');
  await requireActiveSubscription(store.id);

  const { limits } = await getStoreWithPlan(store.id);
  const allowedPeriods = limits.velocityPeriods;
  const period = parsePeriod(searchParams.period, allowedPeriods);
  const periodLabel = PERIOD_LABELS[period];

  const velocities = await prisma.salesVelocity.findMany({
    where: { storeId: store.id, period },
    select: {
      velocityPerDay: true,
      unitsSold: true,
      variant: {
        select: {
          productId: true,
          title: true,
          availableStock: true,
          product: { select: { title: true } },
        },
      },
    },
  });

  const rollups = aggregateVelocityByProduct(velocities);

  // Top sellers: products with actual sales, sorted by velocity desc
  const topSellers = [...rollups]
    .filter((p) => p.velocityPerDay > 0)
    .sort((a, b) => b.velocityPerDay - a.velocityPerDay)
    .slice(0, 10);

  // Needs reorder: products with sales and stock running low
  // Show products where stock lasts less than 30 days at current velocity
  const needsImport = rollups
    .filter((p) => p.velocityPerDay > 0 && p.diasRestantes !== null && p.diasRestantes < 30)
    .sort((a, b) => (a.diasRestantes ?? 0) - (b.diasRestantes ?? 0));

  // Summary stats
  const totalProducts = rollups.length;
  const totalSold = rollups.reduce((acc, p) => acc + p.unitsSold, 0);
  const criticalCount = needsImport.filter((p) => (p.diasRestantes ?? 0) <= 7).length;
  const zeroStock = rollups.filter((p) => p.totalAvailableStock === 0).length;

  const hasData = rollups.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Insights</h1>
        <Suspense fallback={<div className="flex gap-1">{VALID_PERIODS.map(p => <div key={p} className="h-9 w-20 bg-muted animate-pulse rounded-md" />)}</div>}>
          <PeriodSelector currentPeriod={period} allowedPeriods={allowedPeriods} />
        </Suspense>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium text-foreground mb-2">Sem dados de vendas</p>
          <p className="text-muted-foreground max-w-sm">
            Sincronize seus pedidos na aba <span className="font-medium text-foreground">Pedidos</span> para calcular a velocity e ver insights.
          </p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{totalProducts}</p>
                <p className="text-xs text-muted-foreground mt-1">Produtos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-green-500">{totalSold}</p>
                <p className="text-xs text-muted-foreground mt-1">Vendidos ({periodLabel})</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-destructive">{criticalCount}</p>
                <p className="text-xs text-muted-foreground mt-1">Estoque critico (&le;7d)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-warning">{zeroStock}</p>
                <p className="text-xs text-muted-foreground mt-1">Sem estoque</p>
              </CardContent>
            </Card>
          </div>

          {/* Top Sellers */}
          {topSellers.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-lg font-semibold mb-3 text-foreground">
                <TrendingUp className="h-5 w-5 text-green-500" />
                Mais Vendidos ({periodLabel})
              </h2>
              <div className="space-y-2">
                {topSellers.map((p, i) => (
                  <InsightCard
                    key={p.productId}
                    variant="trending"
                    rank={i + 1}
                    title={p.title}
                    velocityPerDay={p.velocityPerDay}
                    unitsSold={p.unitsSold}
                    totalAvailableStock={p.totalAvailableStock}
                    topVariantTitle={p.topVariantTitle}
                    periodLabel={periodLabel}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Needs Import */}
          {needsImport.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-lg font-semibold mb-3 text-foreground">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Precisa Importar
              </h2>
              <p className="text-sm text-muted-foreground mb-3">
                Produtos com estoque para menos de 30 dias, baseado na velocity de {periodLabel}.
              </p>
              <div className="space-y-2">
                {needsImport.map((p) => (
                  <InsightCard
                    key={p.productId}
                    variant="reorder"
                    title={p.title}
                    velocityPerDay={p.velocityPerDay}
                    unitsSold={p.unitsSold}
                    totalAvailableStock={p.totalAvailableStock}
                    diasRestantes={p.diasRestantes ?? 0}
                    periodLabel={periodLabel}
                  />
                ))}
              </div>
            </section>
          )}

          {/* No sales warning */}
          {topSellers.length === 0 && (
            <div className="flex flex-col items-center py-12 text-center">
              <Package className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                Nenhum produto com vendas nos ultimos {periodLabel}. Tente um periodo maior.
              </p>
            </div>
          )}

          {/* All Products with search and sort */}
          <section>
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-3 text-foreground">
              <Package className="h-5 w-5" />
              Todos os Produtos
            </h2>
            <InsightsList rollups={rollups} periodLabel={periodLabel} />
          </section>
        </>
      )}
    </div>
  );
}
