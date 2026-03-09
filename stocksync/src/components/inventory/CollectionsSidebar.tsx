'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Layers, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { CollectionsResponse } from '@/app/api/collections/route';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function CollectionsSidebar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeCollectionId = searchParams.get('collectionId');

  const { data, isLoading } = useSWR<CollectionsResponse>('/api/collections', fetcher, {
    revalidateOnFocus: false,
  });

  function navigate(collectionId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (collectionId) {
      params.set('collectionId', collectionId);
    } else {
      params.delete('collectionId');
    }
    // Reset page when changing collection
    params.delete('page');
    router.push('/dashboard?' + params.toString());
  }

  const itemClass = (active: boolean) =>
    `flex items-center justify-between w-full px-2 py-1.5 rounded-md text-sm cursor-pointer transition-colors ${
      active
        ? 'bg-accent text-accent-foreground font-medium'
        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
    }`;

  return (
    <div className="px-2 pb-2">
      <p className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Coleções
      </p>

      {/* Todos os Produtos */}
      <button
        className={itemClass(activeCollectionId === null)}
        onClick={() => navigate(null)}
      >
        <span className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 flex-shrink-0" />
          Todos os Produtos
        </span>
      </button>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-1 mt-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-7 bg-muted animate-pulse rounded-md" />
          ))}
        </div>
      )}

      {/* Collections list */}
      {data && data.collections.length > 0 && (
        <div className="mt-1 max-h-64 overflow-y-auto space-y-0.5">
          {data.collections.map((col) => (
            <button
              key={col.id}
              className={itemClass(activeCollectionId === col.id)}
              onClick={() => navigate(col.id)}
            >
              <span className="truncate">{col.title}</span>
              <Badge variant="secondary" className="ml-1 text-xs flex-shrink-0">
                {col.productCount}
              </Badge>
            </button>
          ))}
        </div>
      )}

      {/* Sem coleção */}
      {data && data.uncategorizedCount > 0 && (
        <button
          className={`${itemClass(activeCollectionId === 'uncategorized')} mt-1`}
          onClick={() => navigate('uncategorized')}
        >
          <span className="flex items-center gap-2">
            <Package className="h-3.5 w-3.5 flex-shrink-0" />
            Sem coleção
          </span>
          <Badge variant="outline" className="ml-1 text-xs flex-shrink-0">
            {data.uncategorizedCount}
          </Badge>
        </button>
      )}
    </div>
  );
}
