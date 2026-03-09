'use client';

import { useState, useEffect } from 'react';
import { Search, ArrowUp, ArrowDown, ArrowUpDown, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDebounce } from '@/hooks/useDebounce';
import { useInventoryFilters, useInventoryFilterActions } from '@/hooks/useInventoryFilters';
import type { SortField } from '@/app/api/inventory/route';

interface InventoryFiltersProps {
  total: number;
  filteredCount: number;
}

export function InventoryFilters({ total, filteredCount }: InventoryFiltersProps) {
  const filters = useInventoryFilters();
  const { updateFilters, clearFilters } = useInventoryFilterActions();

  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebounce(searchInput, 300);

  // Sync debounced search to URL
  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      updateFilters({ search: debouncedSearch });
    }
  }, [debouncedSearch, filters.search, updateFilters]);

  // Sync URL search → local input on external navigation (back/forward)
  useEffect(() => {
    setSearchInput(filters.search);
  }, [filters.search]);

  function handleSortToggle(field: SortField) {
    if (filters.sort === field) {
      updateFilters({ order: filters.order === 'asc' ? 'desc' : 'asc' });
    } else {
      updateFilters({ sort: field, order: 'asc' });
    }
  }

  function getSortIcon(field: SortField) {
    if (filters.sort !== field) return <ArrowUpDown className="h-3 w-3" />;
    return filters.order === 'asc' ? (
      <ArrowUp className="h-3 w-3" />
    ) : (
      <ArrowDown className="h-3 w-3" />
    );
  }

  const hasActiveFilters =
    filters.search || filters.status !== 'all' || filters.sort !== 'name' || filters.order !== 'asc';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou SKU..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-8"
          />
        </div>

        {/* Status filter */}
        <Select
          value={filters.status}
          onValueChange={(value) =>
            updateFilters({ status: value as 'all' | 'available' | 'reserved' | 'out_of_stock' })
          }
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="available">Disponível</SelectItem>
            <SelectItem value="reserved">Reservado</SelectItem>
            <SelectItem value="out_of_stock">Esgotado</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort buttons */}
        <div className="flex gap-1">
          <Button
            variant={filters.sort === 'name' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSortToggle('name')}
            className="gap-1"
          >
            Nome {getSortIcon('name')}
          </Button>
          <Button
            variant={filters.sort === 'available' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSortToggle('available')}
            className="gap-1"
          >
            Disponível {getSortIcon('available')}
          </Button>
          <Button
            variant={filters.sort === 'reserved' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleSortToggle('reserved')}
            className="gap-1"
          >
            Reservado {getSortIcon('reserved')}
          </Button>
        </div>

        {/* Clear filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchInput('');
              clearFilters();
            }}
            className="gap-1 text-muted-foreground"
          >
            <X className="h-3 w-3" />
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Result count — AC7 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm text-muted-foreground">
          Exibindo {filteredCount} de {total} produtos
          {filters.status !== 'all' && (
            <span className="ml-1 text-xs">(total sem filtro de status)</span>
          )}
        </p>
        {(filters.sort === 'available' || filters.sort === 'reserved') && (
          <p className="text-xs text-muted-foreground">
            * Ordenação se aplica à página atual
          </p>
        )}
      </div>
    </div>
  );
}
