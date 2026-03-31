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
    // MNT-001: rastrear timeouts para cancelar no cleanup (evita chamada ao store após unmount)
    const pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();

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
            averageCost: number | null;
            price: number | null;
          };
          updateVariant(v.id, {
            availableStock: v.availableStock,
            reservedStock: v.reservedStock,
            committedStock: v.committedStock,
            averageCost: v.averageCost,
            price: v.price,
          });
          markUpdated(v.id);
          const tid = setTimeout(() => {
            pendingTimeouts.delete(tid);
            clearUpdated(v.id);
          }, 2000);
          pendingTimeouts.add(tid);
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          // REQ-001: texto alinhado com AC5
          toast.error('Reconectando...', { duration: 3000 });
          // MNT-002: re-fetch sempre busca limit=25 (primeira página) — limitação conhecida,
          // aceitável pois reconexão é evento raro e dados são re-sincronizados pelo Realtime
          setTimeout(() => void refetch(), 3000);
        }
      });

    return () => {
      // MNT-001: cancelar todos os timeouts de highlight pendentes
      pendingTimeouts.forEach(clearTimeout);
      void channel.unsubscribe();
    };
  }, [storeId, updateVariant, markUpdated, clearUpdated, refetch]);
}
