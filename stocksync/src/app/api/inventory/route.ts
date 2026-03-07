import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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

  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      where: { storeId: store.id },
      include: { variants: { orderBy: { title: 'asc' } } },
      skip,
      take: limit,
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

  return NextResponse.json({
    products: productsWithRollup,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
