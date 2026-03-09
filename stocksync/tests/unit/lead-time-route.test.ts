import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH } from '@/app/api/products/[productId]/lead-time/route';

// ── Mocks (hoisted) ────────────────────────────────────────────────────────

const {
  mockGetServerSession,
  mockStoreFindFirst,
  mockProductUpdateMany,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockStoreFindFirst: vi.fn(),
  mockProductUpdateMany: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    store: { findFirst: mockStoreFindFirst },
    product: { updateMany: mockProductUpdateMany },
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/products/prod-1/lead-time', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const fakeStore = { id: 'store-1', userId: 'user-1' };

// ── Tests ──────────────────────────────────────────────────────────────────

describe('PATCH /api/products/[productId]/lead-time', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 401 quando não autenticado', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await PATCH(makeRequest({ leadTimeOverride: 5 }), { params: { productId: 'prod-1' } });
    expect(res.status).toBe(401);
  });

  it('retorna 400 para valor inválido (negativo)', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    const res = await PATCH(makeRequest({ leadTimeOverride: -1 }), { params: { productId: 'prod-1' } });
    expect(res.status).toBe(400);
  });

  it('retorna 400 para valor inválido (zero)', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    const res = await PATCH(makeRequest({ leadTimeOverride: 0 }), { params: { productId: 'prod-1' } });
    expect(res.status).toBe(400);
  });

  it('retorna 400 para valor inválido (string)', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    const res = await PATCH(makeRequest({ leadTimeOverride: 'abc' }), { params: { productId: 'prod-1' } });
    expect(res.status).toBe(400);
  });

  it('retorna 200 ao atualizar override com valor positivo', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    mockProductUpdateMany.mockResolvedValueOnce({ count: 1 });

    const res = await PATCH(makeRequest({ leadTimeOverride: 14 }), { params: { productId: 'prod-1' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    expect(mockProductUpdateMany).toHaveBeenCalledWith({
      where: { id: 'prod-1', storeId: 'store-1' },
      data: { leadTimeOverride: 14 },
    });
  });

  it('retorna 200 ao remover override (null)', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    mockProductUpdateMany.mockResolvedValueOnce({ count: 1 });

    const res = await PATCH(makeRequest({ leadTimeOverride: null }), { params: { productId: 'prod-1' } });
    expect(res.status).toBe(200);
    expect(mockProductUpdateMany).toHaveBeenCalledWith({
      where: { id: 'prod-1', storeId: 'store-1' },
      data: { leadTimeOverride: null },
    });
  });

  it('retorna 404 quando produto não pertence à store', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    mockProductUpdateMany.mockResolvedValueOnce({ count: 0 });

    const res = await PATCH(makeRequest({ leadTimeOverride: 7 }), { params: { productId: 'prod-outro' } });
    expect(res.status).toBe(404);
  });
});
