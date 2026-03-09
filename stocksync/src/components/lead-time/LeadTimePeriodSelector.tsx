'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

type Period = '7d' | '30d' | '90d';

const PERIODS: Period[] = ['7d', '30d', '90d'];
const PERIOD_LABELS: Record<Period, string> = { '7d': '7 dias', '30d': '30 dias', '90d': '90 dias' };

interface LeadTimePeriodSelectorProps {
  currentPeriod: Period;
}

export function LeadTimePeriodSelector({ currentPeriod }: LeadTimePeriodSelectorProps) {
  const router = useRouter();

  return (
    <div className="flex gap-1">
      {PERIODS.map((p) => (
        <Button
          key={p}
          variant={currentPeriod === p ? 'default' : 'outline'}
          size="sm"
          onClick={() => router.push(`/lead-time?period=${p}`)}
        >
          {PERIOD_LABELS[p]}
        </Button>
      ))}
    </div>
  );
}
