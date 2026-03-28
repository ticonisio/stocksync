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

  return (
    <AuthSessionProvider>
      <div className="flex h-screen bg-background">
        <Sidebar criticalCount={criticalCount} />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </AuthSessionProvider>
  );
}
