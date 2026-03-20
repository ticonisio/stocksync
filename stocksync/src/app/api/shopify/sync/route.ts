export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { syncStoreBatch } from '@/services/shopify/sync';

export async function POST() {
  const startTime = Date.now();
  console.log('[sync] POST /api/shopify/sync called');

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.log('[sync] Unauthorized - no session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
    if (!store) {
      console.log('[sync] No store found for user', session.user.id);
      return NextResponse.json({ error: 'No store connected' }, { status: 404 });
    }

    console.log(`[sync] Starting batch for store ${store.id}, cursor=${store.syncCursor ?? 'null'}, syncDone=${store.syncDone}`);
    const result = await syncStoreBatch(store.id);
    console.log(`[sync] Batch done in ${Date.now() - startTime}ms:`, JSON.stringify(result));
    return NextResponse.json(result);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[sync] syncStoreBatch failed after ${Date.now() - startTime}ms:`, errorMessage);
    return NextResponse.json({
      status: 'error',
      syncDone: 0,
      hasMore: false,
      error: errorMessage,
    });
  }
}
