import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export type CollectionWithCount = {
  id: string;
  title: string;
  handle: string;
  productCount: number;
};

export type CollectionsResponse = {
  collections: CollectionWithCount[];
  uncategorizedCount: number;
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const [rawCollections, uncategorizedCount] = await Promise.all([
    prisma.collection.findMany({
      where: { storeId: store.id },
      include: { _count: { select: { products: true } } },
      orderBy: { title: 'asc' },
    }),
    prisma.product.count({
      where: { storeId: store.id, collections: { none: {} } },
    }),
  ]);

  const collections: CollectionWithCount[] = rawCollections.map((c) => ({
    id: c.id,
    title: c.title,
    handle: c.handle,
    productCount: c._count.products,
  }));

  return NextResponse.json({ collections, uncategorizedCount } satisfies CollectionsResponse);
}
