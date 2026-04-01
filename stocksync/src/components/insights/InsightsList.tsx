'use client';

import { useState, useMemo } from 'react';
import { ArrowUpDown, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { InsightCard } from './InsightCard';
import type { ProductVelocityRollup } from '@/lib/insightsAggregator';

type SortField = 'velocity' | 'stock' | 'name';
type SortDir = 'asc' | 'desc';

interface InsightsListProps {
  rollups: ProductVelocityRollup[];
}

export function InsightsList({ rollups }: InsightsListProps) {
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
      else if (sortField === 'stock') cmp = a.totalAvailableStock - b.totalAvailableStock;
      else cmp = a.title.localeCompare(b.title);
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
      {/* Search + Sort controls */}
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
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">Ordenar:</span>
          <Button
            variant={sortField === 'velocity' ? 'secondary' : 'ghost'}
            size="sm"
            className="text-xs h-8"
            onClick={() => toggleSort('velocity')}
          >
            <ArrowUpDown className="h-3 w-3 mr-1" />
            Velocity {sortLabel('velocity')}
          </Button>
          <Button
            variant={sortField === 'stock' ? 'secondary' : 'ghost'}
            size="sm"
            className="text-xs h-8"
            onClick={() => toggleSort('stock')}
          >
            <ArrowUpDown className="h-3 w-3 mr-1" />
            Estoque {sortLabel('stock')}
          </Button>
          <Button
            variant={sortField === 'name' ? 'secondary' : 'ghost'}
            size="sm"
            className="text-xs h-8"
            onClick={() => toggleSort('name')}
          >
            <ArrowUpDown className="h-3 w-3 mr-1" />
            Nome {sortLabel('name')}
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {filtered.length} produto{filtered.length !== 1 ? 's' : ''}
        {search.trim() ? ` encontrado${filtered.length !== 1 ? 's' : ''}` : ''}
      </p>

      {/* Product list */}
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
              totalAvailableStock={p.totalAvailableStock}
              topVariantTitle={p.topVariantTitle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
