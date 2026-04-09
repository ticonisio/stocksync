'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

type Period = '7d' | '30d' | '90d';

const PERIODS: Period[] = ['7d', '30d', '90d'];
const PERIOD_LABELS: Record<Period, string> = { '7d': '7 dias', '30d': '30 dias', '90d': '90 dias' };

interface PeriodSelectorProps {
  currentPeriod: Period;
  allowedPeriods?: string[];
}

export function PeriodSelector({ currentPeriod, allowedPeriods }: PeriodSelectorProps) {
  const router = useRouter();

  return (
    <div className="flex gap-1">
      {PERIODS.map((p) => {
        const locked = allowedPeriods && !allowedPeriods.includes(p);
        return (
          <Button
            key={p}
            variant={currentPeriod === p ? 'default' : 'outline'}
            size="sm"
            disabled={locked}
            title={locked ? 'Disponível em planos superiores' : undefined}
            onClick={() => router.push(`/insights?period=${p}`)}
          >
            {PERIOD_LABELS[p]}{locked ? ' 🔒' : ''}
          </Button>
        );
      })}
    </div>
  );
}
