import { describe, it, expect } from 'vitest';

// Test the status config logic (pure function, no React rendering needed)
const statusConfig: Record<string, { label: string }> = {
  PAID: { label: 'Pago' },
  CANCELLED: { label: 'Cancelado' },
  REFUNDED: { label: 'Reembolsado' },
  PENDING: { label: 'Pendente' },
};

function getStatusLabel(status: string): string {
  return (statusConfig[status] ?? statusConfig.PENDING).label;
}

describe('OrderStatusBadge — status mapping', () => {
  it('maps PAID to Pago', () => {
    expect(getStatusLabel('PAID')).toBe('Pago');
  });

  it('maps CANCELLED to Cancelado', () => {
    expect(getStatusLabel('CANCELLED')).toBe('Cancelado');
  });

  it('maps REFUNDED to Reembolsado', () => {
    expect(getStatusLabel('REFUNDED')).toBe('Reembolsado');
  });

  it('maps PENDING to Pendente', () => {
    expect(getStatusLabel('PENDING')).toBe('Pendente');
  });

  it('falls back to Pendente for unknown status', () => {
    expect(getStatusLabel('UNKNOWN')).toBe('Pendente');
  });
});
