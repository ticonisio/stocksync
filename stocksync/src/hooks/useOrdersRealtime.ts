'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { OrderData } from '@/components/orders/OrdersTable';

interface UseOrdersRealtimeResult {
  newOrders: OrderData[];
  updatedStatuses: Map<string, string>;
  highlightedIds: Set<string>;
}

export function useOrdersRealtime(storeId: string): UseOrdersRealtimeResult {
  const [newOrders, setNewOrders] = useState<OrderData[]>([]);
  const [updatedStatuses, setUpdatedStatuses] = useState<Map<string, string>>(new Map());
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();

    const channel = supabase
      .channel(`orders:${storeId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `storeId=eq.${storeId}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string;
            shopifyOrderId: string;
            status: string;
            createdAt: string;
          };

          // Fetch full order with items from API
          try {
            const res = await fetch(`/api/orders?search=${encodeURIComponent(row.shopifyOrderId)}&limit=1`);
            if (res.ok) {
              const data = await res.json();
              if (data.orders?.[0]) {
                const order = data.orders[0] as OrderData;
                setNewOrders((prev) => [order, ...prev]);
                setHighlightedIds((prev) => new Set([...prev, order.id]));

                const tid = setTimeout(() => {
                  pendingTimeouts.delete(tid);
                  setHighlightedIds((prev) => {
                    const next = new Set(prev);
                    next.delete(order.id);
                    return next;
                  });
                }, 2000);
                pendingTimeouts.add(tid);
              }
            }
          } catch {
            // silent — will appear on next page refresh
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `storeId=eq.${storeId}`,
        },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          setUpdatedStatuses((prev) => new Map([...prev, [row.id, row.status]]));
        }
      )
      .subscribe();

    return () => {
      pendingTimeouts.forEach(clearTimeout);
      void channel.unsubscribe();
    };
  }, [storeId]);

  return { newOrders, updatedStatuses, highlightedIds };
}
