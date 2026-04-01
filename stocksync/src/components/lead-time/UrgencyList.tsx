'use client';

import { useState, useMemo } from 'react';
import { ArrowUpDown, Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { UrgencyCard } from './UrgencyCard';
import type { UrgencyItem } from '@/services/inventory/urgency-service';

type SortField = 'urgency' | 'velocity' | 'stock' | 'reorder' | 'leadtime';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'CRÍTICO' | 'ATENÇÃO' | 'OK';

interface UrgencyListProps {
  items: UrgencyItem[];
}

export function UrgencyList({ items }: UrgencyListProps) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('urgency');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'urgency' ? 'asc' : 'desc');
    }
  }

  const filtered = useMemo(() => {
    let result = items;

    if (statusFilter !== 'all') {
      result = result.filter((i) => i.status === statusFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((i) => i.title.toLowerCase().includes(q));
    }

    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'urgency') cmp = a.urgency - b.urgency;
      else if (sortField === 'velocity') cmp = a.velocityPerDay - b.velocityPerDay;
      else if (sortField === 'stock') cmp = a.totalAvailableStock - b.totalAvailableStock;
      else if (sortField === 'reorder') cmp = a.reorderQty - b.reorderQty;
      else if (sortField === 'leadtime') cmp = a.leadTimeDays - b.leadTimeDays;
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [items, search, sortField, sortDir, statusFilter]);

  const sortLabel = (field: SortField) => {
    const active = sortField === field;
    return active ? (sortDir === 'desc' ? '↓' : '↑') : '';
  };

  const statusCounts = useMemo(() => ({
    'CRÍTICO': items.filter((i) => i.status === 'CRÍTICO').length,
    'ATENÇÃO': items.filter((i) => i.status === 'ATENÇÃO').length,
    'OK': items.filter((i) => i.status === 'OK').length,
  }), [items]);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar produto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 text-foreground"
        />
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Button
          variant={statusFilter === 'all' ? 'secondary' : 'ghost'}
          size="sm"
          className="text-xs h-7"
          onClick={() => setStatusFilter('all')}
        >
          Todos ({items.length})
        </Button>
        <Button
          variant={statusFilter === 'CRÍTICO' ? 'secondary' : 'ghost'}
          size="sm"
          className="text-xs h-7 text-destructive"
          onClick={() => setStatusFilter('CRÍTICO')}
        >
          Critico ({statusCounts['CRÍTICO']})
        </Button>
        <Button
          variant={statusFilter === 'ATENÇÃO' ? 'secondary' : 'ghost'}
          size="sm"
          className="text-xs h-7 text-warning"
          onClick={() => setStatusFilter('ATENÇÃO')}
        >
          Atenção ({statusCounts['ATENÇÃO']})
        </Button>
        <Button
          variant={statusFilter === 'OK' ? 'secondary' : 'ghost'}
          size="sm"
          className="text-xs h-7 text-green-500"
          onClick={() => setStatusFilter('OK')}
        >
          OK ({statusCounts['OK']})
        </Button>
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">Ordenar:</span>
        {([
          ['urgency', 'Prioridade'],
          ['velocity', 'Velocity'],
          ['reorder', 'Qtd Recompra'],
          ['stock', 'Estoque'],
          ['leadtime', 'Lead Time'],
        ] as [SortField, string][]).map(([field, label]) => (
          <Button
            key={field}
            variant={sortField === field ? 'secondary' : 'ghost'}
            size="sm"
            className="text-xs h-7"
            onClick={() => toggleSort(field)}
          >
            <ArrowUpDown className="h-3 w-3 mr-1" />
            {label} {sortLabel(field)}
          </Button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        {filtered.length} produto{filtered.length !== 1 ? 's' : ''}
      </p>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {search.trim()
            ? `Nenhum produto encontrado para "${search}"`
            : 'Nenhum produto neste filtro'}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <UrgencyCard key={item.productId} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
