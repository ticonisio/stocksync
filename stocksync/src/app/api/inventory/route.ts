import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export type FilterStatus = 'all' | 'available' | 'reserved' | 'out_of_stock';
export type SortField = 'name' | 'available' | 'reserved';
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

  // Build Prisma where clause — search applied server-side for performance
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

  // Post-query sort for computed rollup fields (operates within current page)
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

  // Post-query status filter — operates on current page's rollup values
  // Note: total reflects pre-status-filter count (accepted limitation, see architecture decisions)
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
