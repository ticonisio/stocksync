import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateAndSaveVelocity } from '@/services/velocity/calculateVelocity';

// ── Mocks (hoisted) ────────────────────────────────────────────────────────

const {
  mockVariantFindMany,
  mockOrderItemAggregate,
  mockSalesVelocityUpsert,
} = vi.hoisted(() => ({
  mockVariantFindMany: vi.fn(),
  mockOrderItemAggregate: vi.fn(),
  mockSalesVelocityUpsert: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    variant: { findMany: mockVariantFindMany },
    orderItem: { aggregate: mockOrderItemAggregate },
    salesVelocity: { upsert: mockSalesVelocityUpsert },
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const STORE_ID = 'store-1';
const VARIANT_A = { id: 'variant-a' };
const VARIANT_B = { id: 'variant-b' };

// ── Tests ──────────────────────────────────────────────────────────────────

describe('calculateAndSaveVelocity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSalesVelocityUpsert.mockResolvedValue({});
  });

  it('calcula velocity correta para 7d, 30d e 90d', async () => {
    mockVariantFindMany.mockResolvedValueOnce([VARIANT_A]);
    // 7d: 14 unidades vendidas → 14/7 = 2.0 un/dia
    mockOrderItemAggregate
      .mockResolvedValueOnce({ _sum: { quantity: 14 } })  // 7d
      .mockResolvedValueOnce({ _sum: { quantity: 60 } })  // 30d → 2.0
      .mockResolvedValueOnce({ _sum: { quantity: 90 } }); // 90d → 1.0

    await calculateAndSaveVelocity(STORE_ID);

    expect(mockSalesVelocityUpsert).toHaveBeenCalledTimes(3);

    // 7d
    expect(mockSalesVelocityUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { variantId_period: { variantId: 'variant-a', period: '7d' } },
        update: expect.objectContaining({ unitsSold: 14, velocityPerDay: 2 }),
        create: expect.objectContaining({ unitsSold: 14, velocityPerDay: 2 }),
      })
    );

    // 30d
    expect(mockSalesVelocityUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { variantId_period: { variantId: 'variant-a', period: '30d' } },
        update: expect.objectContaining({ unitsSold: 60, velocityPerDay: 2 }),
      })
    );

    // 90d
    expect(mockSalesVelocityUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { variantId_period: { variantId: 'variant-a', period: '90d' } },
        update: expect.objectContaining({ unitsSold: 90, velocityPerDay: 1 }),
      })
    );
  });

  it('persiste unitsSold: 0 e velocityPerDay: 0 para variante sem vendas', async () => {
    mockVariantFindMany.mockResolvedValueOnce([VARIANT_A]);
    mockOrderItemAggregate
      .mockResolvedValueOnce({ _sum: { quantity: null } }) // 7d — sem vendas
      .mockResolvedValueOnce({ _sum: { quantity: null } }) // 30d
      .mockResolvedValueOnce({ _sum: { quantity: null } }); // 90d

    await calculateAndSaveVelocity(STORE_ID);

    expect(mockSalesVelocityUpsert).toHaveBeenCalledTimes(3);
    for (const call of mockSalesVelocityUpsert.mock.calls) {
      expect(call[0].update.unitsSold).toBe(0);
      expect(call[0].update.velocityPerDay).toBe(0);
    }
  });

  it('restringe recálculo às variantIds fornecidas', async () => {
    mockVariantFindMany.mockResolvedValueOnce([VARIANT_A]);
    mockOrderItemAggregate.mockResolvedValue({ _sum: { quantity: 10 } });

    await calculateAndSaveVelocity(STORE_ID, ['variant-a']);

    expect(mockVariantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['variant-a'] },
        }),
      })
    );
  });

  it('recalcula todas as variantes quando variantIds omitido', async () => {
    mockVariantFindMany.mockResolvedValueOnce([VARIANT_A, VARIANT_B]);
    mockOrderItemAggregate.mockResolvedValue({ _sum: { quantity: 5 } });

    await calculateAndSaveVelocity(STORE_ID);

    expect(mockVariantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId: STORE_ID }, // sem filtro id
      })
    );
    // 2 variantes × 3 períodos = 6 upserts
    expect(mockSalesVelocityUpsert).toHaveBeenCalledTimes(6);
  });

  it('UPSERT é idempotente — segundo chamada não duplica', async () => {
    mockVariantFindMany.mockResolvedValue([VARIANT_A]);
    mockOrderItemAggregate.mockResolvedValue({ _sum: { quantity: 7 } });

    await calculateAndSaveVelocity(STORE_ID);
    await calculateAndSaveVelocity(STORE_ID);

    // 3 períodos × 2 chamadas = 6, mas cada UPSERT usa where de chave única
    expect(mockSalesVelocityUpsert).toHaveBeenCalledTimes(6);
    // Todos chamam upsert (não create/update diretamente) — idempotente
    for (const call of mockSalesVelocityUpsert.mock.calls) {
      expect(call[0]).toHaveProperty('where.variantId_period');
      expect(call[0]).toHaveProperty('update');
      expect(call[0]).toHaveProperty('create');
    }
  });

  it('filtra orderItems pelo storeId correto (cross-store protection)', async () => {
    mockVariantFindMany.mockResolvedValueOnce([VARIANT_A]);
    mockOrderItemAggregate.mockResolvedValue({ _sum: { quantity: 3 } });

    await calculateAndSaveVelocity(STORE_ID, ['variant-a']);

    expect(mockOrderItemAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          order: expect.objectContaining({ storeId: STORE_ID, status: 'PAID' }),
        }),
      })
    );
  });
});
