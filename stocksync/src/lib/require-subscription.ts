import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { isSubscriptionActive } from '@/lib/subscription';

/**
 * Server-side guard: redirects to /settings if store has no active subscription.
 * Call at the top of any protected page after getting the storeId.
 */
export async function requireActiveSubscription(storeId: string): Promise<void> {
  const subscription = await prisma.subscription.findUnique({
    where: { storeId },
  });

  if (!isSubscriptionActive(subscription)) {
    redirect('/settings');
  }
}
