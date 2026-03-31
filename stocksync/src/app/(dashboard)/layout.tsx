import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AuthSessionProvider } from '@/components/providers/session-provider';
import { Sidebar } from '@/components/layout/sidebar';
import { getUrgencyItems } from '@/services/inventory/urgency-service';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const store = await prisma.store.findFirst({ where: { userId: session.user.id } });
  if (!store) redirect('/connect-shopify');

  // Fetch critical count for sidebar badge
  const urgencyItems = await getUrgencyItems(store.id, '30d');
  const criticalCount = urgencyItems.filter((i) => i.status === 'CRÍTICO').length;

  // Fetch recent orders count (last 24h) for sidebar badge
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentOrdersCount = await prisma.order.count({
    where: { storeId: store.id, createdAt: { gte: oneDayAgo } },
  });

  return (
    <AuthSessionProvider>
      <div className="flex h-screen bg-background">
        <Sidebar criticalCount={criticalCount} recentOrdersCount={recentOrdersCount} />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </AuthSessionProvider>
  );
}
