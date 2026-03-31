import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

const ITEMS_PER_PAGE = 25;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? String(ITEMS_PER_PAGE), 10)));
  const status = url.searchParams.get('status') ?? '';
  const search = url.searchParams.get('search')?.trim() ?? '';

  const where: Prisma.OrderWhereInput = {
    storeId: store.id,
    ...(status && status !== 'all' ? { status: status.toUpperCase() as Prisma.EnumOrderStatusFilter['equals'] } : {}),
    ...(search
      ? {
          OR: [
            { shopifyOrderId: { contains: search, mode: 'insensitive' } },
            { items: { some: { variant: { title: { contains: search, mode: 'insensitive' } } } } },
          ],
        }
      : {}),
  };

  const skip = (page - 1) * limit;

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
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return NextResponse.json({
    orders,
    total,
    page,
    perPage: limit,
  });
}
