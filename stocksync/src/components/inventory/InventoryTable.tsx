'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Variant {
  id: string;
  title: string;
  sku: string | null;
  availableStock: number;
  reservedStock: number;
  committedStock: number;
}

interface ProductWithRollup {
  id: string;
  title: string;
  variants: Variant[];
  availableRollup: number;
  reservedRollup: number;
  committedRollup: number;
}

interface InventoryTableProps {
  products: ProductWithRollup[];
  total: number;
  page: number;
  perPage: number;
}

export function InventoryTable({ products, total, page, perPage }: InventoryTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const totalPages = Math.ceil(total / perPage);

  function toggleExpand(productId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function navigate(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(newPage));
    router.push('/dashboard?' + params.toString());
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <p className="text-muted-foreground text-lg">Nenhum produto sincronizado ainda.</p>
        <Link
          href="/onboarding/connect-shopify"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Conectar loja Shopify
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Exibindo {Math.min(page * perPage, total) - perPage + 1}–{Math.min(page * perPage, total)} de {total} produtos
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Produto</TableHead>
              <TableHead className="text-right">Disponível</TableHead>
              <TableHead className="text-right">Reservado</TableHead>
              <TableHead className="text-right">Comprometido</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => {
              const isExpanded = expanded.has(product.id);
              const isOutOfStock = product.availableRollup === 0;

              return (
                <React.Fragment key={product.id}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleExpand(product.id)}
                  >
                    <TableCell className="py-3">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <span>{product.title}</span>
                        {isOutOfStock && (
                          <Badge variant="destructive" className="text-xs">
                            Esgotado
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {product.variants.length} variante{product.variants.length !== 1 ? 's' : ''}
                      </div>
                    </TableCell>
                    <TableCell className="text-right py-3 font-mono text-sm">
                      {product.availableRollup}
                    </TableCell>
                    <TableCell className="text-right py-3 font-mono text-sm text-amber-600">
                      {product.reservedRollup > 0 ? product.reservedRollup : '—'}
                    </TableCell>
                    <TableCell className="text-right py-3 font-mono text-sm text-blue-600">
                      {product.committedRollup > 0 ? product.committedRollup : '—'}
                    </TableCell>
                  </TableRow>

                  {isExpanded &&
                    product.variants.map((variant) => (
                      <TableRow key={variant.id} className="bg-muted/30">
                        <TableCell className="py-2" />
                        <TableCell className="py-2 pl-8">
                          <div className="text-sm">{variant.title}</div>
                          <div className="text-xs text-muted-foreground">
                            SKU: {variant.sku ?? '—'}
                          </div>
                        </TableCell>
                        <TableCell className="text-right py-2 font-mono text-sm">
                          {variant.availableStock}
                        </TableCell>
                        <TableCell className="text-right py-2 font-mono text-sm text-amber-600">
                          {variant.reservedStock > 0 ? variant.reservedStock : '—'}
                        </TableCell>
                        <TableCell className="text-right py-2 font-mono text-sm text-blue-600">
                          {variant.committedStock > 0 ? variant.committedStock : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(page - 1)}
            disabled={page <= 1}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(page + 1)}
            disabled={page >= totalPages}
          >
            Próximo
          </Button>
        </div>
      )}
    </div>
  );
}
