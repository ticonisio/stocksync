export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { syncStoreBatch } from '@/services/shopify/sync';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) {
    return NextResponse.json({ error: 'No store connected' }, { status: 404 });
  }

  try {
    const result = await syncStoreBatch(store.id);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[sync] syncStoreBatch failed:', err);
    return NextResponse.json({ status: 'error', syncDone: 0, hasMore: false });
  }
}
