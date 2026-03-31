'use client';

import { useMemo } from 'react';
import { OrdersTable, type OrderData } from './OrdersTable';
import { useOrdersRealtime } from '@/hooks/useOrdersRealtime';

interface OrdersRealtimeWrapperProps {
  storeId: string;
  initialOrders: OrderData[];
  total: number;
  page: number;
}

const ITEMS_PER_PAGE = 25;

export function OrdersRealtimeWrapper({
  storeId,
  initialOrders,
  total,
  page,
}: OrdersRealtimeWrapperProps) {
  const { newOrders, updatedStatuses, highlightedIds } = useOrdersRealtime(storeId);

  // Merge realtime orders with SSR orders, avoiding duplicates
  const mergedOrders = useMemo(() => {
    const ssrIds = new Set(initialOrders.map((o) => o.id));
    const uniqueNew = newOrders.filter((o) => !ssrIds.has(o.id));

    const allOrders = [...uniqueNew, ...initialOrders];

    // Apply status updates from realtime
    if (updatedStatuses.size > 0) {
      return allOrders.map((order) => {
        const newStatus = updatedStatuses.get(order.id);
        return newStatus ? { ...order, status: newStatus } : order;
      });
    }

    return allOrders;
  }, [initialOrders, newOrders, updatedStatuses]);

  return (
    <OrdersTable
      orders={mergedOrders}
      total={total + newOrders.length}
      page={page}
      perPage={ITEMS_PER_PAGE}
      highlightedIds={highlightedIds}
    />
  );
}
