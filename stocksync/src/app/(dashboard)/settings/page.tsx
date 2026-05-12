import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LeadTimeGroupsManager } from '@/components/settings/LeadTimeGroupsManager';
import { DisconnectStoreButton } from '@/components/settings/DisconnectStoreButton';
import { BillingCard } from '@/components/settings/BillingCard';
import type { PlanKey } from '@/lib/stripe';

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const store = await prisma.store.findFirst({
    where: { userId: session.user.id },
    include: { subscription: true },
  });

  const sub = store?.subscription;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Configurações</h1>

      <BillingCard
        plan={(sub?.plan as PlanKey) ?? null}
        status={sub?.status ?? null}
        currentPeriodEnd={sub?.currentPeriodEnd?.toISOString() ?? null}
        cancelAtPeriodEnd={sub?.cancelAtPeriodEnd ?? false}
      />

      <Card>
        <CardHeader>
          <CardTitle>Integração da loja</CardTitle>
          <CardDescription>
            Gerencie a conexão com sua plataforma de ecommerce. Lojas Shopify podem trocar o token de acesso quando necessário.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button asChild variant="outline">
            <Link href="/connect-shopify">Reconectar loja</Link>
          </Button>
          <DisconnectStoreButton />
        </CardContent>
      </Card>

      <LeadTimeGroupsManager />
    </div>
  );
}
