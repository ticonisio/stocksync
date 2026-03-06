'use client';

import { useRouter } from 'next/navigation';

interface Collection {
  id: string;
  title: string;
}

interface CollectionFilterProps {
  collections: Collection[];
  selected?: string;
}

export function CollectionFilter({ collections, selected }: CollectionFilterProps) {
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    router.push(value ? `/dashboard?collection=${value}` : '/dashboard');
  }

  return (
    <select
      value={selected ?? ''}
      onChange={handleChange}
      className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <option value="">Todas as coleções</option>
      {collections.map((c) => (
        <option key={c.id} value={c.id}>
          {c.title}
        </option>
      ))}
    </select>
  );
}
