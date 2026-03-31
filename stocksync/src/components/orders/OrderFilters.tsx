'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';
import { Search } from 'lucide-react';

const statusOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'PAID', label: 'Pagos' },
  { value: 'CANCELLED', label: 'Cancelados' },
  { value: 'REFUNDED', label: 'Reembolsados' },
];

export function OrderFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentStatus = searchParams.get('status') ?? 'all';
  const currentSearch = searchParams.get('search') ?? '';

  const updateParams = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== 'all') {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete('page'); // reset to page 1 on filter change
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {/* Status filter */}
      <div className="flex gap-1">
        {statusOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => updateParams('status', opt.value)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              currentStatus === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Search input */}
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar pedido ou produto..."
          defaultValue={currentSearch}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              updateParams('search', e.currentTarget.value);
            }
          }}
          className="w-full pl-9 pr-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
    </div>
  );
}
