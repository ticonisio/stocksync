import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { isSubscriptionActive } from '@/lib/subscription';

interface SubscriptionGateProps {
  storeId: string;
  children: React.ReactNode;
}

/**
 * Server component that blocks access if the store has no active subscription.
 * Wraps page content — NOT the settings page (so users can choose a plan).
 */
export async function SubscriptionGate({ storeId, children }: SubscriptionGateProps) {
  const subscription = await prisma.subscription.findUnique({
    where: { storeId },
  });

  if (!isSubscriptionActive(subscription)) {
    redirect('/settings');
  }

  return <>{children}</>;
}
