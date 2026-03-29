import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export type FilterStatus = 'all' | 'available' | 'reserved' | 'out_of_stock';
export type SortField = 'name' | 'available' | 'reserved' | 'velocity' | 'urgency' | 'value';
export type SortOrder = 'asc' | 'desc';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '25', 10) || 25));
  const skip = (page - 1) * limit;

  const search = searchParams.get('search')?.trim() ?? '';
  const status = (searchParams.get('status') ?? 'all') as FilterStatus;
  const sort = (searchParams.get('sort') ?? 'name') as SortField;
  const order = (searchParams.get('order') ?? 'asc') as SortOrder;
  const collectionId = searchParams.get('collectionId') ?? '';

  // Validate collectionId belongs to this store (cross-store protection)
  if (collectionId && collectionId !== 'uncategorized') {
    const col = await prisma.collection.findFirst({
      where: { id: collectionId, storeId: store.id },
    });
    if (!col) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Collection filter — ProductCollection junction: use { collectionId } not { id }
  const collectionFilter: Prisma.ProductWhereInput =
    collectionId === 'uncategorized'
      ? { collections: { none: {} } }
      : collectionId
        ? { collections: { some: { collectionId } } }
        : {};

  // Build Prisma where clause
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

  // Prisma orderBy — only 'name' can be done in DB; computed sorts applied post-query
  const orderBy: Prisma.ProductOrderByWithRelationInput =
    sort === 'name' ? { title: order } : { title: 'asc' };

  const [rawProducts, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      include: { variants: { orderBy: { title: 'asc' } } },
      skip,
      take: limit,
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

  // Velocity/urgency sort: fetch SalesVelocity if needed
  let velMap = new Map<string, number>();
  if (sort === 'velocity' || sort === 'urgency') {
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
    if (vel === 0) return Infinity; // no demand — not urgent
    return p.availableRollup / vel;
  };

  // Post-query sort for computed fields (operates within current page)
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
  // Note: total reflects pre-status-filter count (accepted limitation)
  const filteredProducts =
    status === 'available'
      ? sortedProducts.filter((p) => p.availableRollup > 0)
      : status === 'reserved'
        ? sortedProducts.filter((p) => p.reservedRollup > 0)
        : status === 'out_of_stock'
          ? sortedProducts.filter((p) => p.availableRollup === 0)
          : sortedProducts;

  return NextResponse.json({
    products: filteredProducts,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
