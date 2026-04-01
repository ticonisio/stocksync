'use client';

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
  const deltas = useInventoryStore((s) => s.deltas);

  // Apply incremental deltas from realtime events over SSR initial values.
  // This works regardless of pagination — deltas track every variant update.
  const availableStock = initial.availableStock + deltas.availableDelta;
  const reservedStock = initial.reservedStock + deltas.reservedDelta;
  const totalCostValue =
    initial.totalCostValue != null ? initial.totalCostValue + deltas.costDelta : null;
  const totalRetailValue =
    initial.totalRetailValue != null ? initial.totalRetailValue + deltas.retailDelta : null;

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
