'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { LayoutGrid, TrendingUp, Clock, Settings, LogOut, FileSpreadsheet, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CollectionsSidebar } from '@/components/inventory/CollectionsSidebar';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/insights', label: 'Insights', icon: TrendingUp },
  { href: '/lead-time', label: 'Tempo de Entrega', icon: Clock },
  { href: '/imports', label: 'Importações', icon: FileSpreadsheet },
  { href: '/orders', label: 'Pedidos', icon: ShoppingCart },
  { href: '/settings', label: 'Configurações', icon: Settings },
];

interface SidebarProps {
  criticalCount?: number;
  recentOrdersCount?: number;
}

export function Sidebar({ criticalCount = 0, recentOrdersCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();

  const userName = session?.user?.name ?? session?.user?.email ?? 'Usuário';
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <aside className="hidden lg:flex flex-col w-56 border-r border-border bg-card">
      <div className="p-4 border-b border-border">
        <span className="text-xl font-bold text-foreground tracking-tight">StockSync</span>
      </div>

      <nav className="p-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant="ghost"
                className={`w-full justify-start gap-2 ${
                  isActive
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
                {item.href === '/lead-time' && criticalCount > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 ml-auto">
                    {criticalCount}
                  </span>
                )}
                {item.href === '/orders' && recentOrdersCount > 0 && (
                  <span className="bg-blue-500 text-white text-xs rounded-full px-1.5 py-0.5 ml-auto">
                    {recentOrdersCount}
                  </span>
                )}
              </Button>
            </Link>
          );
        })}
      </nav>

      {/* Collections sidebar — separated by divider, scrollable */}
      <div className="flex-1 border-t border-border overflow-hidden flex flex-col min-h-0">
        <Suspense
          fallback={
            <div className="px-2 pt-2 space-y-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-7 bg-muted animate-pulse rounded-md" />
              ))}
            </div>
          }
        >
          <CollectionsSidebar />
        </Suspense>
      </div>

      <div className="p-3 border-t border-border space-y-2">
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-medium flex-shrink-0">
            {userInitial}
          </div>
          <span className="text-sm text-foreground truncate">{userName}</span>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 !text-foreground hover:!text-destructive hover:bg-destructive/10"
          onClick={() => signOut({ callbackUrl: '/login' })}
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </aside>
  );
}
