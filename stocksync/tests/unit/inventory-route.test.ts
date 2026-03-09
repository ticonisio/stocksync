import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/inventory/route';

// ── Mocks (hoisted with vi.hoisted) ───────────────────────────────────────

const { mockGetServerSession, mockFindFirst, mockTransaction, mockFindMany, mockCount } =
  vi.hoisted(() => ({
    mockGetServerSession: vi.fn(),
    mockFindFirst: vi.fn(),
    mockTransaction: vi.fn(),
    mockFindMany: vi.fn(),
    mockCount: vi.fn(),
  }));

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    store: { findFirst: mockFindFirst },
    product: { findMany: mockFindMany, count: mockCount },
    $transaction: mockTransaction,
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(url: string): Request {
  return new Request(url);
}

const fakeStore = { id: 'store-1', userId: 'user-1' };

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
    mockFindFirst.mockResolvedValueOnce(null);
    const res = await GET(makeRequest('http://localhost/api/inventory'));
    expect(res.status).toBe(404);
  });

  it('retorna produtos paginados com page e totalPages', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockFindFirst.mockResolvedValueOnce(fakeStore);
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
    mockFindFirst.mockResolvedValueOnce(fakeStore);
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
    mockFindFirst.mockResolvedValueOnce(fakeStore);
    mockTransaction.mockResolvedValueOnce([[fakeProducts[1]], 1]);

    const res = await GET(makeRequest('http://localhost/api/inventory'));
    const json = await res.json();
    expect(json.products[0].availableRollup).toBe(0);
  });

  it('usa page=1 como default quando não informado', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockFindFirst.mockResolvedValueOnce(fakeStore);
    mockTransaction.mockResolvedValueOnce([[], 0]);

    const res = await GET(makeRequest('http://localhost/api/inventory'));
    const json = await res.json();
    expect(json.page).toBe(1);
  });

  // ── Novos testes: filtros (Story 3.3) ──────────────────────────────────

  it('filtra por status=out_of_stock retornando só produtos esgotados', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockFindFirst.mockResolvedValueOnce(fakeStore);
    mockTransaction.mockResolvedValueOnce([fakeProducts, 2]);

    const res = await GET(makeRequest('http://localhost/api/inventory?status=out_of_stock'));
    const json = await res.json();
    expect(json.products).toHaveLength(1);
    expect(json.products[0].id).toBe('prod-2');
    expect(json.products[0].availableRollup).toBe(0);
  });

  it('filtra por status=available retornando só produtos com estoque', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockFindFirst.mockResolvedValueOnce(fakeStore);
    mockTransaction.mockResolvedValueOnce([fakeProducts, 2]);

    const res = await GET(makeRequest('http://localhost/api/inventory?status=available'));
    const json = await res.json();
    expect(json.products).toHaveLength(1);
    expect(json.products[0].id).toBe('prod-1');
  });

  it('ordena por available desc corretamente', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockFindFirst.mockResolvedValueOnce(fakeStore);
    mockTransaction.mockResolvedValueOnce([fakeProducts, 2]);

    const res = await GET(makeRequest('http://localhost/api/inventory?sort=available&order=desc'));
    const json = await res.json();
    // prod-1: availableRollup=15, prod-2: 0 → desc: prod-1 first
    expect(json.products[0].id).toBe('prod-1');
    expect(json.products[1].id).toBe('prod-2');
  });

  it('ordena por available asc corretamente', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockFindFirst.mockResolvedValueOnce(fakeStore);
    mockTransaction.mockResolvedValueOnce([fakeProducts, 2]);

    const res = await GET(makeRequest('http://localhost/api/inventory?sort=available&order=asc'));
    const json = await res.json();
    // asc: prod-2 (0) first, prod-1 (15) second
    expect(json.products[0].id).toBe('prod-2');
    expect(json.products[1].id).toBe('prod-1');
  });

  it('passa where clause com search para o prisma (findMany recebe OR filter)', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockFindFirst.mockResolvedValueOnce(fakeStore);
    mockTransaction.mockResolvedValueOnce([[fakeProducts[0]], 1]);

    const res = await GET(makeRequest('http://localhost/api/inventory?search=Produto+A'));
    expect(res.status).toBe(200);

    // findMany é chamado antes de $transaction — verificar where clause diretamente
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
});
