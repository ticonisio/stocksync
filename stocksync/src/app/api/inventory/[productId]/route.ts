import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export type Period = '7d' | '30d' | '90d';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const period = (searchParams.get('period') ?? '30d') as Period;

  const product = await prisma.product.findFirst({
    where: { id: productId, storeId: store.id },
    include: {
      variants: {
        include: {
          salesVelocities: {
            where: { period },
          },
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

  if (!product) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // orderItems is on Variant, not Product — separate query
  const recentEvents = await prisma.orderItem.findMany({
    where: {
      variant: { productId, storeId: store.id },
    },
    include: {
      order: { select: { shopifyOrderId: true, status: true, createdAt: true } },
      variant: { select: { title: true, sku: true } },
    },
    orderBy: { order: { createdAt: 'desc' } },
    take: 10,
  });

  return NextResponse.json({ product, recentEvents });
}
