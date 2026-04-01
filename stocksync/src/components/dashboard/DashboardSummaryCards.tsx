'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useInventoryStore } from '@/store/inventoryStore';
import { formatBRL } from '@/lib/format';

interface DashboardSummaryCardsProps {
  /** Server-rendered initial values (used before any realtime event) */
  initial: {
    totalProducts: number;
    totalVariants: number;
    availableStock: number;
    reservedStock: number;
    totalCostValue: number | null;
    totalRetailValue: number | null;
  };
}

export function DashboardSummaryCards({ initial }: DashboardSummaryCardsProps) {
  const products = useInventoryStore((s) => s.products);
  const storeTotal = useInventoryStore((s) => s.total);

  // Recalculate aggregates from Zustand only when the store holds ALL products.
  // The InventoryTable only loads one page (e.g. 25 products), so partial data
  // would produce incorrect totals. Cost/value always use SSR values (SQL-based).
  const live = useMemo(() => {
    // Only recalculate stock counts from Zustand when we have all products
    if (products.length === 0 || products.length < storeTotal) return null;

    let available = 0;
    let reserved = 0;
    let costSum = 0;
    let hasCost = false;
    let retailSum = 0;
    let hasRetail = false;

    for (const p of products) {
      for (const v of p.variants) {
        available += v.availableStock;
        reserved += v.reservedStock;
        if (v.averageCost != null) {
          costSum += v.availableStock * v.averageCost;
          hasCost = true;
        }
        if (v.price != null) {
          retailSum += v.availableStock * v.price;
          hasRetail = true;
        }
      }
    }

    return {
      availableStock: available,
      reservedStock: reserved,
      totalCostValue: hasCost ? costSum : null,
      totalRetailValue: hasRetail ? retailSum : null,
    };
  }, [products, storeTotal]);

  // Use live values only when complete, otherwise SSR initial values
  const availableStock = live?.availableStock ?? initial.availableStock;
  const reservedStock = live?.reservedStock ?? initial.reservedStock;
  const totalCostValue = live ? live.totalCostValue : initial.totalCostValue;
  const totalRetailValue = live ? live.totalRetailValue : initial.totalRetailValue;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Produtos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-foreground">{initial.totalProducts}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Variantes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-foreground">{initial.totalVariants}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Disponível</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-foreground">{availableStock}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground text-amber-600 dark:text-amber-400">
            Reservado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{reservedStock}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground text-blue-600 dark:text-blue-400">
            Custo do Estoque
          </CardTitle>
        </CardHeader>
        <CardContent>
          {totalCostValue != null ? (
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {formatBRL(totalCostValue)}
            </p>
          ) : (
            <p
              className="text-2xl font-bold text-muted-foreground"
              title="Sincronize a loja para puxar custos"
            >
              —
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground text-emerald-600 dark:text-emerald-400">
            Valor do Estoque
          </CardTitle>
        </CardHeader>
        <CardContent>
          {totalRetailValue != null ? (
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatBRL(totalRetailValue)}
            </p>
          ) : (
            <p
              className="text-2xl font-bold text-muted-foreground"
              title="Sincronize a loja para puxar preços"
            >
              —
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
