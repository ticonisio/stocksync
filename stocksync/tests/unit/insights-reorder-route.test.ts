import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const {
  mockGetServerSession,
  mockStoreFindFirst,
  mockSalesVelocityFindMany,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockStoreFindFirst: vi.fn(),
  mockSalesVelocityFindMany: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    store: { findFirst: mockStoreFindFirst },
    salesVelocity: { findMany: mockSalesVelocityFindMany },
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeVelocityRecord(
  productId: string,
  productTitle: string,
  variantTitle: string,
  velocityPerDay: number,
  availableStock: number
) {
  return {
    velocityPerDay,
    variant: {
      productId,
      title: variantTitle,
      availableStock,
      product: { title: productTitle },
    },
  };
}

function makeRequest(url: string): Request {
  return new Request(url);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/insights/reorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValue({ id: 'store-1' });
    mockSalesVelocityFindMany.mockResolvedValue([]);
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/insights/reorder/route');
    const res = await GET(makeRequest('http://localhost/api/insights/reorder'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when store not found', async () => {
    mockStoreFindFirst.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/insights/reorder/route');
    const res = await GET(makeRequest('http://localhost/api/insights/reorder'));
    expect(res.status).toBe(404);
  });

  it('filters correctly: velocity > 0 AND stock < velocity * 14', async () => {
    mockSalesVelocityFindMany.mockResolvedValueOnce([
      // DEVE aparecer: velocity=2, stock=10 → 10 < 2*14=28 ✓
      makeVelocityRecord('prod-a', 'Produto A', 'A/P', 2.0, 10),
      // NÃO deve aparecer: velocity=0 (sem movimento)
      makeVelocityRecord('prod-b', 'Produto B', 'B/M', 0.0, 50),
      // NÃO deve aparecer: velocity=1, stock=20 → 20 >= 1*14=14 ✓ (acima do threshold)
      makeVelocityRecord('prod-c', 'Produto C', 'C/G', 1.0, 20),
    ]);

    const { GET } = await import('@/app/api/insights/reorder/route');
    const res = await GET(makeRequest('http://localhost/api/insights/reorder?period=30d'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.products).toHaveLength(1);
    expect(body.products[0].title).toBe('Produto A');
  });

  it('calculates diasRestantes correctly via Math.floor(stock / velocity)', async () => {
    mockSalesVelocityFindMany.mockResolvedValueOnce([
      // diasRestantes = Math.floor(10 / 2.0) = 5
      makeVelocityRecord('prod-a', 'Produto A', 'A/P', 2.0, 10),
      // diasRestantes = Math.floor(3 / 1.5) = 2 → mais urgente, deve vir primeiro
      makeVelocityRecord('prod-b', 'Produto B', 'B/M', 1.5, 3),
    ]);

    const { GET } = await import('@/app/api/insights/reorder/route');
    const res = await GET(makeRequest('http://localhost/api/insights/reorder'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.products).toHaveLength(2);
    // Sorted by diasRestantes ASC (mais urgente primeiro)
    expect(body.products[0].title).toBe('Produto B');
    expect(body.products[0].diasRestantes).toBe(2);
    expect(body.products[1].title).toBe('Produto A');
    expect(body.products[1].diasRestantes).toBe(5);
  });
});
