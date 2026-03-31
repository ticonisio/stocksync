'use client';

const statusConfig: Record<string, { label: string; className: string }> = {
  PAID: {
    label: 'Pago',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  },
  CANCELLED: {
    label: 'Cancelado',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
  REFUNDED: {
    label: 'Reembolsado',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  PENDING: {
    label: 'Pendente',
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400',
  },
};

interface OrderStatusBadgeProps {
  status: string;
}

export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.PENDING;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
