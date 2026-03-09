import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/inventory/[productId]/route';

// ── Mocks (hoisted) ────────────────────────────────────────────────────────

const {
  mockGetServerSession,
  mockStoreFindFirst,
  mockProductFindFirst,
  mockOrderItemFindMany,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockStoreFindFirst: vi.fn(),
  mockProductFindFirst: vi.fn(),
  mockOrderItemFindMany: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    store: { findFirst: mockStoreFindFirst },
    product: { findFirst: mockProductFindFirst },
    orderItem: { findMany: mockOrderItemFindMany },
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(productId: string, period?: string): Request {
  const url = period
    ? `http://localhost/api/inventory/${productId}?period=${period}`
    : `http://localhost/api/inventory/${productId}`;
  return new Request(url);
}

const fakeStore = { id: 'store-1', userId: 'user-1' };

const fakeProduct = {
  id: 'prod-1',
  title: 'Camiseta Básica',
  storeId: 'store-1',
  leadTimeOverride: null,
  variants: [
    {
      id: 'var-1',
      title: 'P',
      sku: 'CAM-P',
      availableStock: 10,
      reservedStock: 2,
      committedStock: 1,
      salesVelocities: [{ period: '30d', velocityPerDay: 0.5 }],
    },
    {
      id: 'var-2',
      title: 'M',
      sku: 'CAM-M',
      availableStock: 5,
      reservedStock: 0,
      committedStock: 3,
      salesVelocities: [],
    },
  ],
  collections: [
    { collectionId: 'col-1', collection: { id: 'col-1', title: 'Camisetas' } },
  ],
  leadTimeGroups: [
    { leadTimeGroupId: 'ltg-1', leadTimeGroup: { id: 'ltg-1', name: 'Padrão', leadTimeDays: 7 } },
  ],
};

const fakeEvents = [
  {
    id: 'oi-1',
    orderId: 'ord-1',
    variantId: 'var-1',
    quantity: 2,
    order: { shopifyOrderId: '#1001', status: 'fulfilled', createdAt: new Date('2026-03-01') },
    variant: { title: 'P', sku: 'CAM-P' },
  },
];

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/inventory/[productId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 401 quando não autenticado', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET(makeRequest('prod-1'), { params: { productId: 'prod-1' } });
    expect(res.status).toBe(401);
  });

  it('retorna 404 quando store não encontrada', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(null);
    const res = await GET(makeRequest('prod-1'), { params: { productId: 'prod-1' } });
    expect(res.status).toBe(404);
  });

  it('retorna 404 quando produto não pertence à store (cross-store protection)', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    mockProductFindFirst.mockResolvedValueOnce(null); // product not found for this storeId
    const res = await GET(makeRequest('prod-outro-store'), { params: { productId: 'prod-outro-store' } });
    expect(res.status).toBe(404);
  });

  it('retorna 200 com dados completos do produto', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    mockProductFindFirst.mockResolvedValueOnce(fakeProduct);
    mockOrderItemFindMany.mockResolvedValueOnce(fakeEvents);

    const res = await GET(makeRequest('prod-1'), { params: { productId: 'prod-1' } });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.product.id).toBe('prod-1');
    expect(json.product.variants).toHaveLength(2);
    expect(json.product.collections[0].collection.title).toBe('Camisetas');
    expect(json.product.leadTimeGroups[0].leadTimeGroup.name).toBe('Padrão');
    expect(json.recentEvents).toHaveLength(1);
    expect(json.recentEvents[0].order.shopifyOrderId).toBe('#1001');
  });

  it('filtra salesVelocities pelo período correto (7d)', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    mockProductFindFirst.mockResolvedValueOnce(fakeProduct);
    mockOrderItemFindMany.mockResolvedValueOnce([]);

    await GET(makeRequest('prod-1', '7d'), { params: { productId: 'prod-1' } });

    // Verify product.findFirst was called with period '7d' in where clause
    expect(mockProductFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-1', storeId: 'store-1' },
        include: expect.objectContaining({
          variants: expect.objectContaining({
            include: expect.objectContaining({
              salesVelocities: expect.objectContaining({
                where: { period: '7d' },
              }),
            }),
          }),
        }),
      })
    );
  });
});
