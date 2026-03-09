import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/collections/route';

const { mockGetServerSession, mockFindFirst, mockFindMany, mockCount } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockFindFirst: vi.fn(),
  mockFindMany: vi.fn(),
  mockCount: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    store: { findFirst: mockFindFirst },
    collection: { findMany: mockFindMany },
    product: { count: mockCount },
  },
}));

const fakeStore = { id: 'store-1', userId: 'user-1' };

const fakeCollections = [
  { id: 'col-1', title: 'Camisetas', handle: 'camisetas', storeId: 'store-1', _count: { products: 5 } },
  { id: 'col-2', title: 'Calças', handle: 'calcas', storeId: 'store-1', _count: { products: 3 } },
];

describe('GET /api/collections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 401 quando não autenticado', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('retorna 404 quando store não encontrada', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockFindFirst.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('retorna coleções com productCount e uncategorizedCount', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockFindFirst.mockResolvedValueOnce(fakeStore);
    mockFindMany.mockResolvedValueOnce(fakeCollections);
    mockCount.mockResolvedValueOnce(7);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.collections).toHaveLength(2);
    expect(json.collections[0]).toMatchObject({ id: 'col-1', title: 'Camisetas', productCount: 5 });
    expect(json.collections[1]).toMatchObject({ id: 'col-2', title: 'Calças', productCount: 3 });
    expect(json.uncategorizedCount).toBe(7);
  });

  it('retorna lista vazia quando não há coleções', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockFindFirst.mockResolvedValueOnce(fakeStore);
    mockFindMany.mockResolvedValueOnce([]);
    mockCount.mockResolvedValueOnce(0);

    const res = await GET();
    const json = await res.json();
    expect(json.collections).toHaveLength(0);
    expect(json.uncategorizedCount).toBe(0);
  });
});
