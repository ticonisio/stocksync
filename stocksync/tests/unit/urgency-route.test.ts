import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const {
  mockGetServerSession,
  mockStoreFindFirst,
  mockGetUrgencyItems,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockStoreFindFirst: vi.fn(),
  mockGetUrgencyItems: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    store: { findFirst: mockStoreFindFirst },
  },
}));
vi.mock('@/services/inventory/urgency-service', () => ({
  parsePeriod: (raw: string | null | undefined) => {
    if (['7d', '30d', '90d'].includes(raw as string)) return raw;
    return '30d';
  },
  getUrgencyItems: mockGetUrgencyItems,
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(url: string): Request {
  return new Request(url);
}

function makeUrgencyItem(productId: string, status: 'CRÍTICO' | 'ATENÇÃO' | 'OK') {
  return {
    productId,
    title: `Produto ${productId}`,
    topVariantTitle: 'Variante',
    velocityPerDay: 2,
    totalAvailableStock: 100,
    leadTimeDays: 30,
    effectiveBuffer: 7,
    urgency: status === 'CRÍTICO' ? -5 : status === 'ATENÇÃO' ? 3 : 20,
    status,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/urgency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValue({ id: 'store-1' });
    mockGetUrgencyItems.mockResolvedValue([]);
  });

  it('retorna 401 quando não autenticado', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/urgency/route');
    const res = await GET(makeRequest('http://localhost/api/urgency'));
    expect(res.status).toBe(401);
  });

  it('retorna 404 quando store não encontrada', async () => {
    mockStoreFindFirst.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/urgency/route');
    const res = await GET(makeRequest('http://localhost/api/urgency'));
    expect(res.status).toBe(404);
  });

  it('retorna 200 com items e summary vazios', async () => {
    const { GET } = await import('@/app/api/urgency/route');
    const res = await GET(makeRequest('http://localhost/api/urgency'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(body.summary).toEqual({ critical: 0, warning: 0, ok: 0 });
  });

  it('calcula summary corretamente por status', async () => {
    mockGetUrgencyItems.mockResolvedValueOnce([
      makeUrgencyItem('p1', 'CRÍTICO'),
      makeUrgencyItem('p2', 'CRÍTICO'),
      makeUrgencyItem('p3', 'ATENÇÃO'),
      makeUrgencyItem('p4', 'OK'),
      makeUrgencyItem('p5', 'OK'),
      makeUrgencyItem('p6', 'OK'),
    ]);

    const { GET } = await import('@/app/api/urgency/route');
    const res = await GET(makeRequest('http://localhost/api/urgency?period=30d'));
    const body = await res.json();

    expect(body.summary.critical).toBe(2);
    expect(body.summary.warning).toBe(1);
    expect(body.summary.ok).toBe(3);
    expect(body.items).toHaveLength(6);
  });

  it('passa o period correto para getUrgencyItems', async () => {
    const { GET } = await import('@/app/api/urgency/route');
    await GET(makeRequest('http://localhost/api/urgency?period=7d'));
    expect(mockGetUrgencyItems).toHaveBeenCalledWith('store-1', '7d');
  });

  it('usa 30d como default quando period é inválido', async () => {
    const { GET } = await import('@/app/api/urgency/route');
    await GET(makeRequest('http://localhost/api/urgency?period=invalid'));
    expect(mockGetUrgencyItems).toHaveBeenCalledWith('store-1', '30d');
  });
});
