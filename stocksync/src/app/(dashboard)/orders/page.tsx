import { Suspense } from 'react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { OrderFilters } from '@/components/orders/OrderFilters';
import { OrdersRealtimeWrapper } from '@/components/orders/OrdersRealtimeWrapper';
import { SyncOrdersButton } from '@/components/orders/SyncOrdersButton';
import { requireActiveSubscription } from '@/lib/require-subscription';

const ITEMS_PER_PAGE = 25;

type SearchParams = {
  page?: string;
  status?: string;
  search?: string;
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) redirect('/connect-store');
  await requireActiveSubscription(store.id);

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10));
  const status = searchParams.status ?? '';
  const search = searchParams.search?.trim() ?? '';

  const where: Prisma.OrderWhereInput = {
    storeId: store.id,
    ...(status && status !== 'all'
      ? { status: status.toUpperCase() as Prisma.EnumOrderStatusFilter['equals'] }
      : {}),
    ...(search
      ? {
          OR: [
            { shopifyOrderId: { contains: search, mode: 'insensitive' } },
            {
              items: {
                some: { variant: { title: { contains: search, mode: 'insensitive' } } },
              },
            },
          ],
        }
      : {}),
  };

  const skip = (page - 1) * ITEMS_PER_PAGE;

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      include: {
        items: {
          include: {
            variant: {
              select: { title: true, sku: true, product: { select: { title: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: ITEMS_PER_PAGE,
    }),
    prisma.order.count({ where }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Pedidos</h1>
        <SyncOrdersButton />
      </div>

      <Suspense fallback={<div className="h-10 bg-muted animate-pulse rounded-md" />}>
        <OrderFilters />
      </Suspense>

      <OrdersRealtimeWrapper
        storeId={store.id}
        initialOrders={orders.map((o) => ({
          ...o,
          status: o.status as string,
          createdAt: o.createdAt.toISOString(),
        }))}
        total={total}
        page={page}
      />
    </div>
  );
}
