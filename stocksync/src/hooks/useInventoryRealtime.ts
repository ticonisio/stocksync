'use client';

import { useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useInventoryStore, type ProductWithRollup } from '@/store/inventoryStore';
import { toast } from 'sonner';

export function useInventoryRealtime(storeId: string) {
  const updateVariant = useInventoryStore((s) => s.updateVariant);
  const markUpdated = useInventoryStore((s) => s.markUpdated);
  const clearUpdated = useInventoryStore((s) => s.clearUpdated);
  const setProducts = useInventoryStore((s) => s.setProducts);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory?limit=25');
      if (!res.ok) return;
      const data = (await res.json()) as { products: ProductWithRollup[]; total: number };
      setProducts(data.products, data.total);
    } catch {
      // silent — next realtime event will bring fresh data
    }
  }, [setProducts]);

  useEffect(() => {
    const channel = supabase
      .channel(`inventory:${storeId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'variants',
          filter: `storeId=eq.${storeId}`,
        },
        (payload) => {
          const v = payload.new as {
            id: string;
            availableStock: number;
            reservedStock: number;
            committedStock: number;
          };
          updateVariant(v.id, {
            availableStock: v.availableStock,
            reservedStock: v.reservedStock,
            committedStock: v.committedStock,
          });
          markUpdated(v.id);
          setTimeout(() => clearUpdated(v.id), 2000);
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          toast.error('Conexão perdida. Reconectando...', { duration: 3000 });
          setTimeout(() => void refetch(), 3000);
        }
      });

    return () => {
      void channel.unsubscribe();
    };
  }, [storeId, updateVariant, markUpdated, clearUpdated, refetch]);
}
