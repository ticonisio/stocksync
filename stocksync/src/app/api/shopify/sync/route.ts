export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { syncStore } from '@/services/shopify/sync';
import { waitUntil } from '@vercel/functions';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) {
    return NextResponse.json({ error: 'No store connected' }, { status: 404 });
  }

  // waitUntil keeps the serverless function alive after responding
  waitUntil(
    syncStore(store.id).catch((err) => {
      console.error('[sync] syncStore failed:', err);
    })
  );

  return NextResponse.json({ status: 'started' });
}
