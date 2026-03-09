'use client';

import { useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { FilterStatus, SortField, SortOrder } from '@/app/api/inventory/route';

export type { FilterStatus, SortField, SortOrder };

export interface InventoryFilters {
  search: string;
  status: FilterStatus;
  sort: SortField;
  order: SortOrder;
}

export function useInventoryFilters(): InventoryFilters {
  const searchParams = useSearchParams();
  return {
    search: searchParams.get('search') ?? '',
    status: (searchParams.get('status') as FilterStatus) ?? 'all',
    sort: (searchParams.get('sort') as SortField) ?? 'name',
    order: (searchParams.get('order') as SortOrder) ?? 'asc',
  };
}

export function useInventoryFilterActions() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilters = useCallback(
    (updates: Partial<InventoryFilters>) => {
      const params = new URLSearchParams(searchParams.toString());

      if ('search' in updates) {
        if (updates.search) params.set('search', updates.search);
        else params.delete('search');
      }
      if ('status' in updates) {
        if (updates.status && updates.status !== 'all') params.set('status', updates.status);
        else params.delete('status');
      }
      if ('sort' in updates) {
        if (updates.sort && updates.sort !== 'name') params.set('sort', updates.sort);
        else params.delete('sort');
      }
      if ('order' in updates) {
        if (updates.order && updates.order !== 'asc') params.set('order', updates.order);
        else params.delete('order');
      }

      // Reset to page 1 when filters change
      params.set('page', '1');

      router.push('/dashboard?' + params.toString());
    },
    [router, searchParams],
  );

  const clearFilters = useCallback(() => {
    router.push('/dashboard');
  }, [router]);

  return { updateFilters, clearFilters };
}
