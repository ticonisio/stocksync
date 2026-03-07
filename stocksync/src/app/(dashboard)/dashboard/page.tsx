import { Suspense } from 'react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InventoryTable } from '@/components/inventory/InventoryTable';

const ITEMS_PER_PAGE = 25;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) redirect('/onboarding/connect-shopify');

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10));
  const skip = (page - 1) * ITEMS_PER_PAGE;

  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      where: { storeId: store.id },
      include: { variants: { orderBy: { title: 'asc' } } },
      skip,
      take: ITEMS_PER_PAGE,
      orderBy: { title: 'asc' },
    }),
    prisma.product.count({ where: { storeId: store.id } }),
  ]);

  const productsWithRollup = products.map((p) => ({
    ...p,
    availableRollup: p.variants.reduce((s, v) => s + v.availableStock, 0),
    reservedRollup: p.variants.reduce((s, v) => s + v.reservedStock, 0),
    committedRollup: p.variants.reduce((s, v) => s + v.committedStock, 0),
  }));

  // Summary stats (all products, not just current page)
  const allStats = await prisma.variant.aggregate({
    where: { storeId: store.id },
    _sum: { availableStock: true, reservedStock: true, committedStock: true },
    _count: { id: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Produtos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Variantes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{allStats._count.id}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Disponível</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {allStats._sum.availableStock ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground text-amber-600">
              Reservado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">
              {allStats._sum.reservedStock ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Inventory table */}
      <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-md" />}>
        <InventoryTable
          products={productsWithRollup}
          total={total}
          page={page}
          perPage={ITEMS_PER_PAGE}
        />
      </Suspense>
    </div>
  );
}
