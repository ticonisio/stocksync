import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { isSubscriptionActive } from '@/lib/subscription';

/**
 * Server-side guard: redirects to /settings only when a known subscription is inactive.
 * Stores without a subscription record can still navigate the app and choose a plan later.
 * Call at the top of any protected page after getting the storeId.
 */
export async function requireActiveSubscription(storeId: string): Promise<void> {
  const subscription = await prisma.subscription.findUnique({
    where: { storeId },
  });

  if (subscription && !isSubscriptionActive(subscription)) {
    redirect('/settings');
  }
}
