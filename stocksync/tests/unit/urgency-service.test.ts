import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parsePeriod, getUrgencyItems } from '@/services/inventory/urgency-service';

// ── Mocks ──────────────────────────────────────────────────────────────────

const {
  mockProductFindMany,
  mockSalesVelocityFindMany,
} = vi.hoisted(() => ({
  mockProductFindMany: vi.fn(),
  mockSalesVelocityFindMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: { findMany: mockProductFindMany },
    salesVelocity: { findMany: mockSalesVelocityFindMany },
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeProduct(
  id: string,
  opts: {
    leadTimeDays?: number;
    bufferDays?: number | null;
    leadTimeOverride?: number | null;
    variants?: Array<{ id: string; title: string; availableStock: number }>;
  } = {}
) {
  const {
    leadTimeDays = 30,
    bufferDays = null,
    leadTimeOverride = null,
    variants = [{ id: `${id}-v1`, title: 'Default', availableStock: 100 }],
  } = opts;

  return {
    id,
    title: `Produto ${id}`,
    leadTimeOverride,
    leadTimeGroups: leadTimeDays
      ? [{ leadTimeGroup: { leadTimeDays, bufferDays } }]
      : [],
    variants,
  };
}

function makeVelocity(variantId: string, velocityPerDay: number) {
  return { variantId, velocityPerDay };
}

// ── parsePeriod ────────────────────────────────────────────────────────────

describe('parsePeriod', () => {
  it('retorna 30d como default para undefined', () => {
    expect(parsePeriod(undefined)).toBe('30d');
  });

  it('retorna 30d como default para null', () => {
    expect(parsePeriod(null)).toBe('30d');
  });

  it('retorna 30d como default para valor inválido', () => {
    expect(parsePeriod('invalid')).toBe('30d');
    expect(parsePeriod('60d')).toBe('30d');
    expect(parsePeriod('')).toBe('30d');
  });

  it('retorna 7d para "7d"', () => {
    expect(parsePeriod('7d')).toBe('7d');
  });

  it('retorna 30d para "30d"', () => {
    expect(parsePeriod('30d')).toBe('30d');
  });

  it('retorna 90d para "90d"', () => {
    expect(parsePeriod('90d')).toBe('90d');
  });
});

// ── getUrgencyItems ────────────────────────────────────────────────────────

describe('getUrgencyItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSalesVelocityFindMany.mockResolvedValue([]);
  });

  it('retorna [] quando não há produtos', async () => {
    mockProductFindMany.mockResolvedValueOnce([]);
    const result = await getUrgencyItems('store-1', '30d');
    expect(result).toEqual([]);
  });

  it('classifica produtos sem vendas como OK sem sugerir reposição', async () => {
    mockProductFindMany.mockResolvedValueOnce([
      makeProduct('p1', { variants: [{ id: 'v1', title: 'V1', availableStock: 100 }] }),
    ]);
    mockSalesVelocityFindMany.mockResolvedValueOnce([
      makeVelocity('v1', 0),
    ]);

    const result = await getUrgencyItems('store-1', '30d');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({ status: 'OK', urgency: Infinity, reorderQty: 0 })
    );
  });

  it('ignora produtos sem lead time configurado', async () => {
    mockProductFindMany.mockResolvedValueOnce([
      {
        id: 'p1',
        title: 'Produto p1',
        leadTimeOverride: null,
        leadTimeGroups: [], // no group
        variants: [{ id: 'v1', title: 'V1', availableStock: 100 }],
      },
    ]);
    mockSalesVelocityFindMany.mockResolvedValueOnce([
      makeVelocity('v1', 2),
    ]);

    const result = await getUrgencyItems('store-1', '30d');
    expect(result).toHaveLength(0);
  });

  it('calcula urgency = floor(stock / velocity) - leadTimeDays', async () => {
    // stock=100, velocity=2, leadTimeDays=30 → urgency = floor(50) - 30 = 20
    mockProductFindMany.mockResolvedValueOnce([
      makeProduct('p1', {
        leadTimeDays: 30,
        variants: [{ id: 'v1', title: 'V1', availableStock: 100 }],
      }),
    ]);
    mockSalesVelocityFindMany.mockResolvedValueOnce([makeVelocity('v1', 2)]);

    const result = await getUrgencyItems('store-1', '30d');
    expect(result).toHaveLength(1);
    expect(result[0].urgency).toBe(20);
  });

  it('status CRÍTICO quando urgency <= 0', async () => {
    // stock=20, velocity=2, leadTimeDays=30 → urgency = 10 - 30 = -20
    mockProductFindMany.mockResolvedValueOnce([
      makeProduct('p1', {
        leadTimeDays: 30,
        variants: [{ id: 'v1', title: 'V1', availableStock: 20 }],
      }),
    ]);
    mockSalesVelocityFindMany.mockResolvedValueOnce([makeVelocity('v1', 2)]);

    const result = await getUrgencyItems('store-1', '30d');
    expect(result[0].status).toBe('CRÍTICO');
  });

  it('status ATENÇÃO quando 0 < urgency <= effectiveBuffer', async () => {
    // stock=40, velocity=2, leadTimeDays=30, bufferDays=15 → urgency=20-30=-10... let me recalculate
    // stock=70, velocity=2, leadTimeDays=30 → urgency = 35-30 = 5
    // effectiveBuffer = max(7, round(30*0.15)) = max(7,5) = 7 → 5 <= 7 → ATENÇÃO
    mockProductFindMany.mockResolvedValueOnce([
      makeProduct('p1', {
        leadTimeDays: 30,
        bufferDays: null, // auto: max(7, round(30*0.15)) = 7
        variants: [{ id: 'v1', title: 'V1', availableStock: 70 }],
      }),
    ]);
    mockSalesVelocityFindMany.mockResolvedValueOnce([makeVelocity('v1', 2)]);

    const result = await getUrgencyItems('store-1', '30d');
    expect(result[0].urgency).toBe(5);
    expect(result[0].effectiveBuffer).toBe(7);
    expect(result[0].status).toBe('ATENÇÃO');
  });

  it('status OK quando urgency > effectiveBuffer', async () => {
    // stock=100, velocity=2, leadTimeDays=30 → urgency=20, buffer=7 → 20>7 → OK
    mockProductFindMany.mockResolvedValueOnce([
      makeProduct('p1', {
        leadTimeDays: 30,
        variants: [{ id: 'v1', title: 'V1', availableStock: 100 }],
      }),
    ]);
    mockSalesVelocityFindMany.mockResolvedValueOnce([makeVelocity('v1', 2)]);

    const result = await getUrgencyItems('store-1', '30d');
    expect(result[0].status).toBe('OK');
  });

  it('usa bufferDays do grupo quando explícito', async () => {
    // bufferDays=20 overrides auto
    mockProductFindMany.mockResolvedValueOnce([
      makeProduct('p1', {
        leadTimeDays: 30,
        bufferDays: 20,
        variants: [{ id: 'v1', title: 'V1', availableStock: 100 }],
      }),
    ]);
    mockSalesVelocityFindMany.mockResolvedValueOnce([makeVelocity('v1', 2)]);

    const result = await getUrgencyItems('store-1', '30d');
    expect(result[0].effectiveBuffer).toBe(20);
  });

  it('usa leadTimeOverride do produto quando definido', async () => {
    // override=10 beats group's 30
    mockProductFindMany.mockResolvedValueOnce([
      makeProduct('p1', {
        leadTimeDays: 30,
        leadTimeOverride: 10,
        variants: [{ id: 'v1', title: 'V1', availableStock: 100 }],
      }),
    ]);
    mockSalesVelocityFindMany.mockResolvedValueOnce([makeVelocity('v1', 2)]);

    const result = await getUrgencyItems('store-1', '30d');
    // urgency = floor(100/2) - 10 = 40
    expect(result[0].leadTimeDays).toBe(10);
    expect(result[0].urgency).toBe(40);
  });

  it('ordena por urgency ASC (CRÍTICO primeiro)', async () => {
    // p1: urgency=20 (OK), p2: urgency=-5 (CRÍTICO)
    mockProductFindMany.mockResolvedValueOnce([
      makeProduct('p1', {
        leadTimeDays: 30,
        variants: [{ id: 'v1', title: 'V1', availableStock: 100 }],
      }),
      makeProduct('p2', {
        leadTimeDays: 30,
        variants: [{ id: 'v2', title: 'V2', availableStock: 20 }],
      }),
    ]);
    mockSalesVelocityFindMany.mockResolvedValueOnce([
      makeVelocity('v1', 2), // urgency = 50-30 = 20
      makeVelocity('v2', 2), // urgency = 10-30 = -20
    ]);

    const result = await getUrgencyItems('store-1', '30d');
    expect(result[0].productId).toBe('p2');
    expect(result[1].productId).toBe('p1');
  });

  it('agrega velocity e stock de múltiplas variantes', async () => {
    mockProductFindMany.mockResolvedValueOnce([
      makeProduct('p1', {
        leadTimeDays: 20,
        variants: [
          { id: 'v1', title: 'Azul', availableStock: 40 },
          { id: 'v2', title: 'Verde', availableStock: 60 },
        ],
      }),
    ]);
    mockSalesVelocityFindMany.mockResolvedValueOnce([
      makeVelocity('v1', 1),
      makeVelocity('v2', 3),
    ]);

    const result = await getUrgencyItems('store-1', '30d');
    expect(result[0].totalAvailableStock).toBe(100);
    expect(result[0].velocityPerDay).toBe(4);
    // urgency = floor(100/4) - 20 = 25-20 = 5
    expect(result[0].urgency).toBe(5);
    // topVariant = v2 (maior velocity)
    expect(result[0].topVariantTitle).toBe('Verde');
  });
});
