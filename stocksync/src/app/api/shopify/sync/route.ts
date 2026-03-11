export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { syncStore } from '@/services/shopify/sync';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) {
    return NextResponse.json({ error: 'No store connected' }, { status: 404 });
  }

  // Fire-and-forget: respond immediately, sync runs in background.
  // Error handling is inside syncStore (sets syncStatus to ERROR on failure).
  syncStore(store.id).catch(() => {
    // syncStore already sets syncStatus: 'ERROR' in its own catch block
  });

  return NextResponse.json({ status: 'started' });
}
