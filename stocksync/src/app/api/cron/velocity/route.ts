import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateAndSaveVelocity } from '@/services/velocity/calculateVelocity';
import { checkAndCreateNotifications } from '@/services/notifications/notification-service';

export async function GET(req: Request): Promise<Response> {
  // Verify Vercel cron secret to prevent unauthorized access
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stores = await prisma.store.findMany({
    where: { syncStatus: 'COMPLETE' },
    select: { id: true, shopifyDomain: true },
  });

  const results: Array<{ storeId: string; domain: string; status: string; notifications?: number }> = [];

  for (const store of stores) {
    try {
      await calculateAndSaveVelocity(store.id);
      const notifs = await checkAndCreateNotifications(store.id);
      results.push({ storeId: store.id, domain: store.shopifyDomain, status: 'ok', notifications: notifs });
    } catch (err) {
      console.error(`[cron/velocity] Failed for store ${store.id}:`, err);
      results.push({ storeId: store.id, domain: store.shopifyDomain, status: 'error' });
    }
  }

  console.log(`[cron/velocity] Processed ${stores.length} stores`);

  return NextResponse.json({ processed: stores.length, results });
}
