import { Suspense } from 'react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InventoryTable } from '@/components/inventory/InventoryTable';
import { InventoryFilters } from '@/components/inventory/InventoryFilters';

const ITEMS_PER_PAGE = 25;

type SearchParams = {
  page?: string;
  search?: string;
  status?: string;
  sort?: string;
  order?: string;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) redirect('/onboarding/connect-shopify');

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10));
  const skip = (page - 1) * ITEMS_PER_PAGE;

  const search = searchParams.search?.trim() ?? '';
  const sort = searchParams.sort ?? 'name';
  const order = (searchParams.order ?? 'asc') as 'asc' | 'desc';

  // Build where clause — search applied server-side
  const where: Prisma.ProductWhereInput = {
    storeId: store.id,
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { variants: { some: { sku: { contains: search, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    sort === 'name' ? { title: order } : { title: 'asc' };

  const [rawProducts, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      include: { variants: { orderBy: { title: 'asc' } } },
      skip,
      take: ITEMS_PER_PAGE,
      orderBy,
    }),
    prisma.product.count({ where }),
  ]);

  const productsWithRollup = rawProducts.map((p) => ({
    ...p,
    availableRollup: p.variants.reduce((s, v) => s + v.availableStock, 0),
    reservedRollup: p.variants.reduce((s, v) => s + v.reservedStock, 0),
    committedRollup: p.variants.reduce((s, v) => s + v.committedStock, 0),
  }));

  // Post-query sort for computed fields (within current page)
  const sortedProducts =
    sort === 'available'
      ? [...productsWithRollup].sort((a, b) =>
          order === 'asc'
            ? a.availableRollup - b.availableRollup
            : b.availableRollup - a.availableRollup
        )
      : sort === 'reserved'
        ? [...productsWithRollup].sort((a, b) =>
            order === 'asc'
              ? a.reservedRollup - b.reservedRollup
              : b.reservedRollup - a.reservedRollup
          )
        : productsWithRollup;

  // Post-query status filter
  const status = searchParams.status ?? 'all';
  const filteredProducts =
    status === 'available'
      ? sortedProducts.filter((p) => p.availableRollup > 0)
      : status === 'reserved'
        ? sortedProducts.filter((p) => p.reservedRollup > 0)
        : status === 'out_of_stock'
          ? sortedProducts.filter((p) => p.availableRollup === 0)
          : sortedProducts;

  // Summary stats (all products, unfiltered)
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

      {/* Filters — wrapped in Suspense (required for useSearchParams in Next.js 14) */}
      <Suspense fallback={<div className="h-16 bg-muted animate-pulse rounded-md" />}>
        <InventoryFilters total={total} filteredCount={filteredProducts.length} />
      </Suspense>

      {/* Inventory table */}
      <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-md" />}>
        <InventoryTable
          products={filteredProducts}
          total={total}
          page={page}
          perPage={ITEMS_PER_PAGE}
          storeId={store.id}
        />
      </Suspense>
    </div>
  );
}
