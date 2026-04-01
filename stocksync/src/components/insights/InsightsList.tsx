'use client';

import { useState, useMemo } from 'react';
import { ArrowUpDown, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { InsightCard } from './InsightCard';
import type { ProductVelocityRollup } from '@/lib/insightsAggregator';

type SortField = 'velocity' | 'sold' | 'stock' | 'dias' | 'name';
type SortDir = 'asc' | 'desc';

interface InsightsListProps {
  rollups: ProductVelocityRollup[];
  periodLabel: string;
}

export function InsightsList({ rollups, periodLabel }: InsightsListProps) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('velocity');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'name' ? 'asc' : 'desc');
    }
  }

  const filtered = useMemo(() => {
    let items = rollups;

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((p) => p.title.toLowerCase().includes(q));
    }

    items = [...items].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'velocity') cmp = a.velocityPerDay - b.velocityPerDay;
      else if (sortField === 'sold') cmp = a.unitsSold - b.unitsSold;
      else if (sortField === 'stock') cmp = a.totalAvailableStock - b.totalAvailableStock;
      else if (sortField === 'dias') {
        const aDias = a.diasRestantes ?? Infinity;
        const bDias = b.diasRestantes ?? Infinity;
        cmp = aDias - bDias;
      } else cmp = a.title.localeCompare(b.title);
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return items;
  }, [rollups, search, sortField, sortDir]);

  const sortLabel = (field: SortField) => {
    const active = sortField === field;
    return active ? (sortDir === 'desc' ? '↓' : '↑') : '';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-foreground"
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-muted-foreground mr-1">Ordenar:</span>
          {([
            ['velocity', 'Velocity'],
            ['sold', 'Vendidos'],
            ['stock', 'Estoque'],
            ['dias', 'Dias'],
            ['name', 'Nome'],
          ] as [SortField, string][]).map(([field, label]) => (
            <Button
              key={field}
              variant={sortField === field ? 'secondary' : 'ghost'}
              size="sm"
              className="text-xs h-8"
              onClick={() => toggleSort(field)}
            >
              <ArrowUpDown className="h-3 w-3 mr-1" />
              {label} {sortLabel(field)}
            </Button>
          ))}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {filtered.length} produto{filtered.length !== 1 ? 's' : ''}
        {search.trim() ? ` encontrado${filtered.length !== 1 ? 's' : ''}` : ''}
      </p>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {search.trim()
            ? `Nenhum produto encontrado para "${search}"`
            : 'Nenhum produto com velocity calculada'}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((p, i) => (
            <InsightCard
              key={p.productId}
              variant="trending"
              rank={i + 1}
              title={p.title}
              velocityPerDay={p.velocityPerDay}
              unitsSold={p.unitsSold}
              totalAvailableStock={p.totalAvailableStock}
              topVariantTitle={p.topVariantTitle}
              periodLabel={periodLabel}
            />
          ))}
        </div>
      )}
    </div>
  );
}
