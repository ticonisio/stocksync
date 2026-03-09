'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { TrendingUp, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Period = '7d' | '30d' | '90d';

type SalesVelocity = {
  period: string;
  velocityPerDay: number;
};

type Variant = {
  id: string;
  title: string;
  sku: string | null;
  availableStock: number;
  reservedStock: number;
  committedStock: number;
  salesVelocities: SalesVelocity[];
};

interface VariantVelocityTableProps {
  productId: string;
  initialVariants: Variant[];
  initialPeriod: Period;
}

function formatVelocity(vel: number): string {
  if (vel === 0) return '—';
  if (vel < 0.1) return '< 0.1 un/dia';
  return `${vel.toFixed(2)} un/dia`;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function VariantVelocityTable({
  productId,
  initialVariants,
  initialPeriod,
}: VariantVelocityTableProps) {
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [leadTimeValues, setLeadTimeValues] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const { data, isLoading } = useSWR(
    `/api/inventory/${productId}?period=${period}`,
    fetcher,
    {
      fallbackData: { product: { variants: initialVariants }, recentEvents: [] },
      revalidateOnFocus: false,
    }
  );

  const variants: Variant[] = data?.product?.variants ?? initialVariants;

  const handlePeriodChange = useCallback((newPeriod: Period) => {
    setPeriod(newPeriod);
  }, []);

  const handleLeadTimeChange = useCallback((variantId: string, value: string) => {
    setLeadTimeValues((prev) => ({ ...prev, [variantId]: value }));
  }, []);

  const handleSaveLeadTime = useCallback(
    async (variantId: string) => {
      const raw = leadTimeValues[variantId];
      const parsed = raw === '' || raw === undefined ? null : parseInt(raw, 10);

      if (parsed !== null && (isNaN(parsed) || parsed <= 0)) {
        return;
      }

      setSavingId(variantId);
      try {
        const res = await fetch(`/api/products/${productId}/lead-time`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadTimeOverride: parsed }),
        });

        if (res.ok) {
          setSavedId(variantId);
          setTimeout(() => setSavedId(null), 2000);
        }
      } finally {
        setSavingId(null);
      }
    },
    [leadTimeValues, productId]
  );

  const periods: Period[] = ['7d', '30d', '90d'];
  const periodLabels: Record<Period, string> = { '7d': '7 dias', '30d': '30 dias', '90d': '90 dias' };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4" />
          Variantes & Velocity
        </CardTitle>
        <div className="flex gap-1">
          {periods.map((p) => (
            <Button
              key={p}
              variant={period === p ? 'default' : 'outline'}
              size="sm"
              onClick={() => handlePeriodChange(p)}
            >
              {periodLabels[p]}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Variante</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Disponível</TableHead>
              <TableHead className="text-right">Reservado</TableHead>
              <TableHead className="text-right">Comprometido</TableHead>
              <TableHead className="text-right">Velocity</TableHead>
              <TableHead className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Lead Time Override
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((variant) => {
              const velocityEntry = variant.salesVelocities[0];
              const velocity = velocityEntry?.velocityPerDay ?? 0;
              const isSaving = savingId === variant.id;
              const isSaved = savedId === variant.id;
              const inputValue = leadTimeValues[variant.id] ?? '';

              return (
                <TableRow key={variant.id} className={isLoading ? 'opacity-50' : undefined}>
                  <TableCell className="font-medium">{variant.title}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {variant.sku ?? '—'}
                  </TableCell>
                  <TableCell className="text-right">{variant.availableStock}</TableCell>
                  <TableCell className="text-right">{variant.reservedStock}</TableCell>
                  <TableCell className="text-right">{variant.committedStock}</TableCell>
                  <TableCell className="text-right text-sm">
                    {formatVelocity(velocity)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        placeholder="dias"
                        value={inputValue}
                        onChange={(e) => handleLeadTimeChange(variant.id, e.target.value)}
                        className="h-8 w-20"
                      />
                      <Button
                        size="sm"
                        variant={isSaved ? 'default' : 'outline'}
                        disabled={isSaving}
                        onClick={() => handleSaveLeadTime(variant.id)}
                        className="h-8"
                      >
                        {isSaving ? '...' : isSaved ? 'Salvo!' : 'Salvar'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
