import { getServerSession } from 'next-auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowLeft, Clock, Settings } from 'lucide-react';
import { VariantVelocityTable } from '@/components/inventory/VariantVelocityTable';
import { requireActiveSubscription } from '@/lib/require-subscription';

type SearchParams = {
  from?: string;
  period?: string;
};

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: SearchParams;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) redirect('/connect-store');
  await requireActiveSubscription(store.id);

  const period = (searchParams.period ?? '30d') as '7d' | '30d' | '90d';

  const product = await prisma.product.findFirst({
    where: { id: params.id, storeId: store.id },
    include: {
      variants: {
        include: {
          salesVelocities: { where: { period } },
        },
        orderBy: { title: 'asc' },
      },
      collections: {
        include: { collection: { select: { id: true, title: true } } },
      },
      leadTimeGroups: {
        include: { leadTimeGroup: { select: { id: true, name: true, leadTimeDays: true } } },
      },
    },
  });

  if (!product) notFound();

  const recentEvents = await prisma.orderItem.findMany({
    where: { variant: { productId: params.id, storeId: store.id } },
    include: {
      order: { select: { shopifyOrderId: true, status: true, createdAt: true } },
      variant: { select: { title: true, sku: true } },
    },
    orderBy: { order: { createdAt: 'desc' } },
    take: 10,
  });

  const backHref = searchParams.from ? decodeURIComponent(searchParams.from) : '/dashboard';
  const primaryLeadTimeGroup = product.leadTimeGroups[0]?.leadTimeGroup ?? null;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Breadcrumb / Voltar */}
      <div className="flex items-center gap-2">
        <Link href={backHref}>
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </Link>
      </div>

      {/* Header do produto */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{product.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {product.collections.map(({ collection }) => (
            <Badge key={collection.id} variant="secondary">
              {collection.title}
            </Badge>
          ))}
          {primaryLeadTimeGroup && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>
                Grupo de lead time:{' '}
                <span className="font-medium text-foreground">
                  {primaryLeadTimeGroup.name} ({primaryLeadTimeGroup.leadTimeDays}d)
                </span>
              </span>
              <Link href="/settings" className="ml-1">
                <Settings className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Tabela de variantes com velocity e lead time inline (Client Component) */}
      <VariantVelocityTable
        productId={params.id}
        initialVariants={product.variants}
        initialPeriod={period}
      />

      {/* Últimos 10 eventos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimos Pedidos</CardTitle>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento recente.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Variante</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(event.order.createdAt).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-sm font-mono">
                      {event.order.shopifyOrderId}
                    </TableCell>
                    <TableCell className="text-sm">{event.variant.title}</TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {event.quantity > 0 ? `+${event.quantity}` : event.quantity}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
