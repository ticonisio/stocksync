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
  collectionId?: string;
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
  const collectionId = searchParams.collectionId ?? '';

  // Validate collectionId if provided (cross-store protection)
  let activeCollection: { id: string; title: string } | null = null;
  if (collectionId && collectionId !== 'uncategorized') {
    activeCollection = await prisma.collection.findFirst({
      where: { id: collectionId, storeId: store.id },
      select: { id: true, title: true },
    });
    // If invalid collectionId, treat as no filter (graceful degradation)
    if (!activeCollection) redirect('/dashboard');
  }

  // Collection filter
  const collectionFilter: Prisma.ProductWhereInput =
    collectionId === 'uncategorized'
      ? { collections: { none: {} } }
      : collectionId
        ? { collections: { some: { collectionId } } }
        : {};

  // Build where clause — search applied server-side
  const where: Prisma.ProductWhereInput = {
    storeId: store.id,
    ...collectionFilter,
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

  // Velocity/urgency: only fetch when inside a collection view
  let velMap = new Map<string, number>();
  if (collectionId && (sort === 'velocity' || sort === 'urgency')) {
    const velocities = await prisma.salesVelocity.findMany({
      where: { storeId: store.id, period: '30d' },
      select: { variantId: true, velocityPerDay: true },
    });
    velMap = new Map(velocities.map((v) => [v.variantId, v.velocityPerDay]));
  }

  const getVelocity = (p: (typeof productsWithRollup)[0]) =>
    p.variants.reduce((sum, v) => sum + (velMap.get(v.id) ?? 0), 0);

  const getUrgencyDays = (p: (typeof productsWithRollup)[0]) => {
    const vel = getVelocity(p);
    return vel === 0 ? Infinity : p.availableRollup / vel;
  };

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
        : sort === 'velocity'
          ? [...productsWithRollup].sort((a, b) =>
              order === 'asc' ? getVelocity(a) - getVelocity(b) : getVelocity(b) - getVelocity(a)
            )
          : sort === 'urgency'
            ? [...productsWithRollup].sort((a, b) => getUrgencyDays(a) - getUrgencyDays(b))
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

  // Collection header label
  const collectionLabel =
    collectionId === 'uncategorized'
      ? 'Sem coleção'
      : activeCollection?.title ?? null;

  return (
    <div className="space-y-6">
      {/* Page header */}
      {collectionLabel ? (
        <div>
          <p className="text-sm text-muted-foreground mb-1">Dashboard</p>
          <h1 className="text-2xl font-bold text-foreground">
            {collectionLabel}
            <span className="ml-2 text-base font-normal text-muted-foreground">
              {total} produto{total !== 1 ? 's' : ''}
            </span>
          </h1>
        </div>
      ) : (
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
      )}

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
        <InventoryFilters
          total={total}
          filteredCount={filteredProducts.length}
          showCollectionSorts={!!collectionId}
        />
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
