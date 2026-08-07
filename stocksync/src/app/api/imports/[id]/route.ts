import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const importRecord = await prisma.import.findFirst({
    where: {
      id,
      storeId: store.id, // Cross-store protection
    },
    include: {
      items: {
        orderBy: { rowNumber: 'asc' },
        include: {
          matchedProduct: {
            select: { id: true, title: true },
          },
          matchedVariant: {
            select: { id: true, title: true, sku: true, availableStock: true },
          },
        },
      },
    },
  });

  if (!importRecord) {
    return NextResponse.json({ error: 'Import not found' }, { status: 404 });
  }

  return NextResponse.json({ import: importRecord });
}
