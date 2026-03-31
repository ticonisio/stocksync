'use client';

import { useState, Fragment } from 'react';
import { ChevronDown, ChevronRight, Package } from 'lucide-react';
import { OrderStatusBadge } from './OrderStatusBadge';

export interface OrderItemData {
  id: string;
  quantity: number;
  variant: {
    title: string;
    sku: string | null;
    product: { title: string };
  };
}

export interface OrderData {
  id: string;
  shopifyOrderId: string;
  status: string;
  items: OrderItemData[];
  createdAt: string;
}

interface OrdersTableProps {
  orders: OrderData[];
  total: number;
  page: number;
  perPage: number;
  highlightedIds?: Set<string>;
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function OrdersTable({ orders, total, page, perPage, highlightedIds }: OrdersTableProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (orders.length === 0) {
    return (
      <div className="border border-border rounded-lg p-12 text-center">
        <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Nenhum pedido encontrado</p>
      </div>
    );
  }

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="w-8 px-3 py-3" />
            <th className="text-left px-3 py-3 font-medium text-muted-foreground">Pedido</th>
            <th className="text-left px-3 py-3 font-medium text-muted-foreground">Status</th>
            <th className="text-center px-3 py-3 font-medium text-muted-foreground">Itens</th>
            <th className="text-left px-3 py-3 font-medium text-muted-foreground">Produtos</th>
            <th className="text-left px-3 py-3 font-medium text-muted-foreground">Data</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {orders.map((order) => {
            const isExpanded = expandedIds.has(order.id);
            const isHighlighted = highlightedIds?.has(order.id);
            const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
            const productNames = [
              ...new Set(order.items.map((item) => item.variant.product.title)),
            ];
            const displayProducts =
              productNames.length <= 2
                ? productNames.join(', ')
                : `${productNames.slice(0, 2).join(', ')} +${productNames.length - 2}`;

            return (
              <Fragment key={order.id}>
                <tr
                  className={`hover:bg-muted/30 cursor-pointer transition-colors ${
                    isHighlighted ? 'bg-blue-50 dark:bg-blue-950/20 animate-pulse' : ''
                  }`}
                  onClick={() => toggleExpand(order.id)}
                >
                  <td className="px-3 py-3 text-muted-foreground">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </td>
                  <td className="px-3 py-3 font-mono text-foreground">#{order.shopifyOrderId}</td>
                  <td className="px-3 py-3">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="px-3 py-3 text-center text-foreground">{totalItems}</td>
                  <td className="px-3 py-3 text-foreground truncate max-w-[200px]" title={productNames.join(', ')}>
                    {displayProducts}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {dateFormatter.format(new Date(order.createdAt))}
                  </td>
                </tr>
                {isExpanded && (
                  <tr key={`${order.id}-details`}>
                    <td colSpan={6} className="bg-muted/20 px-6 py-3">
                      <div className="space-y-1">
                        {order.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-4 text-sm text-muted-foreground"
                          >
                            <span className="font-medium text-foreground">
                              {item.variant.product.title}
                            </span>
                            <span>— {item.variant.title}</span>
                            {item.variant.sku && (
                              <span className="font-mono text-xs">SKU: {item.variant.sku}</span>
                            )}
                            <span className="ml-auto font-medium">×{item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages} ({total} pedidos)
          </p>
          <div className="flex gap-1">
            {page > 1 && (
              <a
                href={`?page=${page - 1}`}
                className="px-3 py-1 text-sm rounded border border-border hover:bg-muted"
              >
                Anterior
              </a>
            )}
            {page < totalPages && (
              <a
                href={`?page=${page + 1}`}
                className="px-3 py-1 text-sm rounded border border-border hover:bg-muted"
              >
                Próxima
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
