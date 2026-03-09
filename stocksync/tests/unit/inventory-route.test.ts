import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/inventory/route';

// ── Mocks (hoisted with vi.hoisted) ───────────────────────────────────────

const {
  mockGetServerSession,
  mockStoreFindFirst,
  mockCollectionFindFirst,
  mockTransaction,
  mockFindMany,
  mockCount,
  mockSalesVelocityFindMany,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockStoreFindFirst: vi.fn(),
  mockCollectionFindFirst: vi.fn(),
  mockTransaction: vi.fn(),
  mockFindMany: vi.fn(),
  mockCount: vi.fn(),
  mockSalesVelocityFindMany: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    store: { findFirst: mockStoreFindFirst },
    collection: { findFirst: mockCollectionFindFirst },
    product: { findMany: mockFindMany, count: mockCount },
    salesVelocity: { findMany: mockSalesVelocityFindMany },
    $transaction: mockTransaction,
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(url: string): Request {
  return new Request(url);
}

const fakeStore = { id: 'store-1', userId: 'user-1' };
const fakeCollection = { id: 'col-1', storeId: 'store-1', title: 'Camisetas' };

const fakeProducts = [
  {
    id: 'prod-1',
    title: 'Produto A',
    storeId: 'store-1',
    variants: [
      { id: 'var-1', title: 'P', sku: 'SKU-P', availableStock: 10, reservedStock: 2, committedStock: 1 },
      { id: 'var-2', title: 'M', sku: 'SKU-M', availableStock: 5, reservedStock: 0, committedStock: 3 },
    ],
  },
  {
    id: 'prod-2',
    title: 'Produto B',
    storeId: 'store-1',
    variants: [
      { id: 'var-3', title: 'Único', sku: null, availableStock: 0, reservedStock: 0, committedStock: 0 },
    ],
  },
];

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GET /api/inventory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 401 quando não autenticado', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await GET(makeRequest('http://localhost/api/inventory'));
    expect(res.status).toBe(401);
  });

  it('retorna 404 quando store não encontrada', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(null);
    const res = await GET(makeRequest('http://localhost/api/inventory'));
    expect(res.status).toBe(404);
  });

  it('retorna produtos paginados com page e totalPages', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    mockTransaction.mockResolvedValueOnce([fakeProducts, 50]);

    const res = await GET(makeRequest('http://localhost/api/inventory?page=1&limit=25'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total).toBe(50);
    expect(json.page).toBe(1);
    expect(json.totalPages).toBe(2);
    expect(json.products).toHaveLength(2);
  });

  it('calcula availableRollup, reservedRollup e committedRollup corretamente', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    mockTransaction.mockResolvedValueOnce([[fakeProducts[0]], 1]);

    const res = await GET(makeRequest('http://localhost/api/inventory'));
    const json = await res.json();
    const product = json.products[0];

    expect(product.availableRollup).toBe(15); // 10 + 5
    expect(product.reservedRollup).toBe(2);   // 2 + 0
    expect(product.committedRollup).toBe(4);  // 1 + 3
  });

  it('produto esgotado tem availableRollup = 0', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    mockTransaction.mockResolvedValueOnce([[fakeProducts[1]], 1]);

    const res = await GET(makeRequest('http://localhost/api/inventory'));
    const json = await res.json();
    expect(json.products[0].availableRollup).toBe(0);
  });

  it('usa page=1 como default quando não informado', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    mockTransaction.mockResolvedValueOnce([[], 0]);

    const res = await GET(makeRequest('http://localhost/api/inventory'));
    const json = await res.json();
    expect(json.page).toBe(1);
  });

  // ── Filtros Story 3.3 ───────────────────────────────────────────────────

  it('filtra por status=out_of_stock retornando só produtos esgotados', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    mockTransaction.mockResolvedValueOnce([fakeProducts, 2]);

    const res = await GET(makeRequest('http://localhost/api/inventory?status=out_of_stock'));
    const json = await res.json();
    expect(json.products).toHaveLength(1);
    expect(json.products[0].id).toBe('prod-2');
    expect(json.products[0].availableRollup).toBe(0);
  });

  it('filtra por status=available retornando só produtos com estoque', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    mockTransaction.mockResolvedValueOnce([fakeProducts, 2]);

    const res = await GET(makeRequest('http://localhost/api/inventory?status=available'));
    const json = await res.json();
    expect(json.products).toHaveLength(1);
    expect(json.products[0].id).toBe('prod-1');
  });

  it('ordena por available desc corretamente', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    mockTransaction.mockResolvedValueOnce([fakeProducts, 2]);

    const res = await GET(makeRequest('http://localhost/api/inventory?sort=available&order=desc'));
    const json = await res.json();
    expect(json.products[0].id).toBe('prod-1');
    expect(json.products[1].id).toBe('prod-2');
  });

  it('ordena por available asc corretamente', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    mockTransaction.mockResolvedValueOnce([fakeProducts, 2]);

    const res = await GET(makeRequest('http://localhost/api/inventory?sort=available&order=asc'));
    const json = await res.json();
    expect(json.products[0].id).toBe('prod-2');
    expect(json.products[1].id).toBe('prod-1');
  });

  it('passa where clause com search para o prisma (findMany recebe OR filter)', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    mockTransaction.mockResolvedValueOnce([[fakeProducts[0]], 1]);

    const res = await GET(makeRequest('http://localhost/api/inventory?search=Produto+A'));
    expect(res.status).toBe(200);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: 'store-1',
          OR: expect.arrayContaining([
            expect.objectContaining({
              title: expect.objectContaining({ contains: 'Produto A' }),
            }),
          ]),
        }),
      })
    );
  });

  // ── Filtros Story 3.4 — coleção ────────────────────────────────────────

  it('retorna 403 quando collectionId não pertence à store', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    mockCollectionFindFirst.mockResolvedValueOnce(null); // not found → forbidden

    const res = await GET(makeRequest('http://localhost/api/inventory?collectionId=other-col'));
    expect(res.status).toBe(403);
  });

  it('filtra por collectionId válido — passa filtro de coleção no where', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    mockCollectionFindFirst.mockResolvedValueOnce(fakeCollection);
    mockTransaction.mockResolvedValueOnce([[fakeProducts[0]], 1]);

    const res = await GET(makeRequest('http://localhost/api/inventory?collectionId=col-1'));
    expect(res.status).toBe(200);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          collections: { some: { collectionId: 'col-1' } },
        }),
      })
    );
  });

  it('filtra por collectionId=uncategorized — sem validação de store', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    mockTransaction.mockResolvedValueOnce([[fakeProducts[1]], 1]);

    const res = await GET(makeRequest('http://localhost/api/inventory?collectionId=uncategorized'));
    expect(res.status).toBe(200);
    expect(mockCollectionFindFirst).not.toHaveBeenCalled(); // no cross-store check for 'uncategorized'

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          collections: { none: {} },
        }),
      })
    );
  });

  it('AC7: combina collectionId + search + status corretamente', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    mockCollectionFindFirst.mockResolvedValueOnce(fakeCollection);
    mockTransaction.mockResolvedValueOnce([fakeProducts, 2]);

    const res = await GET(
      makeRequest('http://localhost/api/inventory?collectionId=col-1&search=Produto&status=available')
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    // prod-1 (available=15 > 0) → pass; prod-2 (available=0) → filtered out
    expect(json.products).toHaveLength(1);
    expect(json.products[0].id).toBe('prod-1');

    // where clause deve incluir collectionId + search filters
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          collections: { some: { collectionId: 'col-1' } },
          OR: expect.arrayContaining([
            expect.objectContaining({ title: expect.objectContaining({ contains: 'Produto' }) }),
          ]),
        }),
      })
    );
  });

  it('ordena por velocity desc — usa velMap de salesVelocity', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    mockTransaction.mockResolvedValueOnce([fakeProducts, 2]);
    // var-1 e var-2 de prod-1: 5 + 3 = 8/day; var-3 de prod-2: 0
    mockSalesVelocityFindMany.mockResolvedValueOnce([
      { variantId: 'var-1', velocityPerDay: 5 },
      { variantId: 'var-2', velocityPerDay: 3 },
      { variantId: 'var-3', velocityPerDay: 0 },
    ]);

    const res = await GET(makeRequest('http://localhost/api/inventory?sort=velocity&order=desc'));
    const json = await res.json();
    expect(json.products[0].id).toBe('prod-1'); // vel=8 > vel=0
  });

  it('ordena por urgency — produto com menor dias de estoque aparece primeiro', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);
    // prod-1: available=15, vel=5 → urgency=3 dias
    // prod-2: available=0, vel=0 → urgency=Infinity (sem demanda)
    mockTransaction.mockResolvedValueOnce([fakeProducts, 2]);
    mockSalesVelocityFindMany.mockResolvedValueOnce([
      { variantId: 'var-1', velocityPerDay: 3 },
      { variantId: 'var-2', velocityPerDay: 2 },
    ]);

    const res = await GET(makeRequest('http://localhost/api/inventory?sort=urgency&order=asc'));
    const json = await res.json();
    expect(json.products[0].id).toBe('prod-1'); // urgency=3 < Infinity
    expect(json.products[1].id).toBe('prod-2'); // urgency=Infinity
  });
});
