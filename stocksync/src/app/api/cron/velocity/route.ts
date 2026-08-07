import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateAndSaveVelocity } from '@/services/velocity/calculateVelocity';
import { checkAndCreateNotifications } from '@/services/notifications/notification-service';

export async function GET(req: Request): Promise<Response> {
  // Verify Vercel cron secret to prevent unauthorized access (constant-time comparison)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/velocity] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const received = Buffer.from(authHeader);
  const valid =
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received);
  if (!valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stores = await prisma.store.findMany({
    where: { syncStatus: 'COMPLETE' },
    select: { id: true, shopifyDomain: true },
  });

  let succeeded = 0;
  let failed = 0;
  let notifications = 0;

  for (const store of stores) {
    try {
      await calculateAndSaveVelocity(store.id);
      const notifs = await checkAndCreateNotifications(store.id);
      succeeded++;
      notifications += notifs;
    } catch (err) {
      console.error(`[cron/velocity] Failed for store ${store.id}:`, err);
      failed++;
    }
  }

  console.log(`[cron/velocity] Processed ${stores.length} stores`);

  return NextResponse.json({ processed: stores.length, succeeded, failed, notifications });
}
