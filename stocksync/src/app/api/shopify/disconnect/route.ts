import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = await prisma.store.findFirst({
    where: { userId: session.user.id },
  });

  if (!store) {
    return NextResponse.json({ error: 'No store found' }, { status: 404 });
  }

  // Delete all related data in correct order within a transaction
  await prisma.$transaction([
    // Junction tables first
    prisma.productLeadTimeGroup.deleteMany({
      where: { product: { storeId: store.id } },
    }),
    prisma.productCollection.deleteMany({
      where: { product: { storeId: store.id } },
    }),
    prisma.orderItem.deleteMany({
      where: { order: { storeId: store.id } },
    }),
    // Tables with foreign keys to products/variants
    prisma.salesVelocity.deleteMany({ where: { storeId: store.id } }),
    prisma.webhookEvent.deleteMany({ where: { storeId: store.id } }),
    prisma.order.deleteMany({ where: { storeId: store.id } }),
    prisma.leadTimeGroup.deleteMany({ where: { storeId: store.id } }),
    // Variants before products
    prisma.variant.deleteMany({ where: { storeId: store.id } }),
    prisma.collection.deleteMany({ where: { storeId: store.id } }),
    prisma.product.deleteMany({ where: { storeId: store.id } }),
    // Finally the store
    prisma.store.delete({ where: { id: store.id } }),
  ]);

  return NextResponse.json({ success: true });
}
