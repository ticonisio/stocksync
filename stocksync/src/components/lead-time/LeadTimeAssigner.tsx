'use client';

import { useState, useCallback, useRef } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SearchProduct {
  id: string;
  title: string;
  leadTimeOverride: number | null;
  variants: { id: string; title: string; availableStock: number }[];
}

export function LeadTimeAssigner() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [leadTimes, setLeadTimes] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.products);
      }
    } finally {
      setSearching(false);
    }
  }, []);

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => search(value), 300);
    },
    [search]
  );

  const handleSave = useCallback(
    async (productId: string) => {
      const raw = leadTimes[productId];
      const parsed = raw === '' || raw === undefined ? null : parseInt(raw, 10);
      if (parsed !== null && (isNaN(parsed) || parsed <= 0)) return;

      setSavingId(productId);
      try {
        const res = await fetch(`/api/products/${productId}/lead-time`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadTimeOverride: parsed }),
        });
        if (res.ok) {
          setSavedIds((prev) => new Set(prev).add(productId));
          setResults((prev) =>
            prev.map((p) => (p.id === productId ? { ...p, leadTimeOverride: parsed } : p))
          );
          setTimeout(() => {
            setSavedIds((prev) => {
              const next = new Set(prev);
              next.delete(productId);
              return next;
            });
          }, 2000);
        }
      } finally {
        setSavingId(null);
      }
    },
    [leadTimes]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4" />
          Configurar Lead Time por Produto
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          placeholder="Buscar produto por nome ou SKU..."
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
        />

        {searching && (
          <p className="text-sm text-muted-foreground">Buscando...</p>
        )}

        {results.length > 0 && (
          <div className="space-y-2">
            {results.map((product) => {
              const totalStock = product.variants.reduce((s, v) => s + v.availableStock, 0);
              const isSaving = savingId === product.id;
              const isSaved = savedIds.has(product.id);
              const inputValue =
                leadTimes[product.id] ??
                (product.leadTimeOverride != null ? String(product.leadTimeOverride) : '');

              return (
                <div
                  key={product.id}
                  className="flex items-center gap-3 p-3 rounded-md border bg-card"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{product.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Estoque: {totalStock} un
                      {product.leadTimeOverride != null && ` · Lead time atual: ${product.leadTimeOverride}d`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Input
                      type="number"
                      min={1}
                      placeholder="dias"
                      value={inputValue}
                      onChange={(e) =>
                        setLeadTimes((prev) => ({ ...prev, [product.id]: e.target.value }))
                      }
                      className="h-8 w-20"
                    />
                    <Button
                      size="sm"
                      variant={isSaved ? 'default' : 'outline'}
                      disabled={isSaving}
                      onClick={() => handleSave(product.id)}
                      className="h-8"
                    >
                      {isSaving ? '...' : isSaved ? 'Salvo!' : 'Salvar'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {query.length >= 2 && !searching && results.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum produto encontrado para &ldquo;{query}&rdquo;
          </p>
        )}
      </CardContent>
    </Card>
  );
}
