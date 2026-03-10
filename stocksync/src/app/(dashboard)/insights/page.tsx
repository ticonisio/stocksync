import { Suspense } from 'react';
import { TrendingUp, RefreshCw } from 'lucide-react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { aggregateVelocityByProduct } from '@/lib/insightsAggregator';
import { InsightCard } from '@/components/insights/InsightCard';
import { PeriodSelector } from '@/components/insights/PeriodSelector';

const VALID_PERIODS = ['7d', '30d', '90d'] as const;
type Period = (typeof VALID_PERIODS)[number];

function parsePeriod(raw: string | undefined): Period {
  if (VALID_PERIODS.includes(raw as Period)) return raw as Period;
  return '30d';
}

interface InsightsPageProps {
  searchParams: { period?: string };
}

export default async function InsightsPage({ searchParams }: InsightsPageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) redirect('/connect-shopify');

  const period = parsePeriod(searchParams.period);

  const velocities = await prisma.salesVelocity.findMany({
    where: { storeId: store.id, period },
    include: {
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

  const trendingProducts = rollups
    .sort((a, b) => b.velocityPerDay - a.velocityPerDay)
    .slice(0, 10)
    .map((p, i) => ({ rank: i + 1, ...p }));

  const reorderProducts = rollups
    .filter((p) => p.velocityPerDay > 0 && p.totalAvailableStock < p.velocityPerDay * 14)
    .map((p) => ({
      ...p,
      diasRestantes: Math.max(0, Math.floor(p.totalAvailableStock / p.velocityPerDay)),
    }))
    .sort((a, b) => a.diasRestantes - b.diasRestantes);

  const hasData = rollups.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Insights</h1>
        <Suspense fallback={<div className="flex gap-1">{VALID_PERIODS.map(p => <div key={p} className="h-9 w-20 bg-muted animate-pulse rounded-md" />)}</div>}>
          <PeriodSelector currentPeriod={period} />
        </Suspense>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground max-w-sm">
            Dados insuficientes — a velocity será calculada após os primeiros pedidos processados.
          </p>
        </div>
      ) : (
        <>
          {/* Produtos em Alta */}
          <section>
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-3">
              <TrendingUp className="h-5 w-5" />
              Produtos em Alta
            </h2>
            {trendingProducts.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum produto com velocity calculada no período.</p>
            ) : (
              <div className="space-y-2">
                {trendingProducts.map((p) => (
                  <InsightCard
                    key={p.productId}
                    variant="trending"
                    rank={p.rank}
                    title={p.title}
                    velocityPerDay={p.velocityPerDay}
                    totalAvailableStock={p.totalAvailableStock}
                    topVariantTitle={p.topVariantTitle}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Vale Repor */}
          <section>
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-3">
              <RefreshCw className="h-5 w-5" />
              Vale Repor
            </h2>
            {reorderProducts.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum produto com estoque crítico no momento.</p>
            ) : (
              <div className="space-y-2">
                {reorderProducts.map((p) => (
                  <InsightCard
                    key={p.productId}
                    variant="reorder"
                    title={p.title}
                    velocityPerDay={p.velocityPerDay}
                    totalAvailableStock={p.totalAvailableStock}
                    diasRestantes={p.diasRestantes}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
