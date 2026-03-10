import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Clock } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getUrgencyItems, parsePeriod } from '@/services/inventory/urgency-service';
import { UrgencyCard } from '@/components/lead-time/UrgencyCard';
import { UrgencySummary } from '@/components/lead-time/UrgencySummary';
import { LeadTimePeriodSelector } from '@/components/lead-time/LeadTimePeriodSelector';

interface LeadTimePageProps {
  searchParams: { period?: string };
}

export default async function LeadTimePage({ searchParams }: LeadTimePageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) redirect('/connect-shopify');

  const period = parsePeriod(searchParams.period);
  const items = await getUrgencyItems(store.id, period);

  const critical = items.filter((i) => i.status === 'CRÍTICO').length;
  const warning = items.filter((i) => i.status === 'ATENÇÃO').length;
  const ok = items.filter((i) => i.status === 'OK').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-6 w-6 text-foreground" />
          <h1 className="text-2xl font-bold text-foreground">Tempo de Entrega</h1>
        </div>
        <LeadTimePeriodSelector currentPeriod={period} />
      </div>

      <UrgencySummary critical={critical} warning={warning} ok={ok} />

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Clock className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium text-foreground">Nenhum produto com lead time configurado</p>
          <p className="text-sm text-muted-foreground mt-1">
            Configure grupos de lead time em Configurações para ver a urgência de recompra.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <UrgencyCard key={item.productId} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
