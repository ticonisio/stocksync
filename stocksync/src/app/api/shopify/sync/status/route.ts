import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) {
    return NextResponse.json({ error: 'No store connected' }, { status: 404 });
  }

  return NextResponse.json({
    syncStatus: store.syncStatus,
    syncError: store.syncError,
    syncDone: store.syncDone,
    syncTotal: store.syncTotal,
    lastSyncedAt: store.lastSyncedAt,
  });
}
