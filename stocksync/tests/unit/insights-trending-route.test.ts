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
  availableStock = 20
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

describe('GET /api/insights/trending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValue({ id: 'store-1' });
    mockSalesVelocityFindMany.mockResolvedValue([]);
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/insights/trending/route');
    const res = await GET(makeRequest('http://localhost/api/insights/trending'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when store not found', async () => {
    mockStoreFindFirst.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/insights/trending/route');
    const res = await GET(makeRequest('http://localhost/api/insights/trending'));
    expect(res.status).toBe(404);
  });

  it('returns products sorted by velocity DESC with correct rank', async () => {
    mockSalesVelocityFindMany.mockResolvedValueOnce([
      makeVelocityRecord('prod-b', 'Produto B', 'B/M', 1.5),
      makeVelocityRecord('prod-a', 'Produto A', 'A/P', 3.0),
      makeVelocityRecord('prod-c', 'Produto C', 'C/G', 0.5),
    ]);

    const { GET } = await import('@/app/api/insights/trending/route');
    const res = await GET(makeRequest('http://localhost/api/insights/trending?period=30d'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.products).toHaveLength(3);
    expect(body.products[0].rank).toBe(1);
    expect(body.products[0].title).toBe('Produto A');
    expect(body.products[0].velocityPerDay).toBeCloseTo(3.0);
    expect(body.products[1].rank).toBe(2);
    expect(body.products[1].title).toBe('Produto B');
    expect(body.products[2].rank).toBe(3);
    expect(body.products[2].title).toBe('Produto C');
  });

  it('returns empty array when no velocity data for period', async () => {
    mockSalesVelocityFindMany.mockResolvedValueOnce([]);
    const { GET } = await import('@/app/api/insights/trending/route');
    const res = await GET(makeRequest('http://localhost/api/insights/trending?period=7d'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.products).toEqual([]);
  });
});
