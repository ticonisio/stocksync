import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const {
  mockGetServerSession,
  mockStoreFindFirst,
  mockLeadTimeGroupFindMany,
  mockLeadTimeGroupCreate,
  mockLeadTimeGroupFindFirst,
  mockLeadTimeGroupUpdate,
  mockLeadTimeGroupDelete,
  mockProductLeadTimeGroupDeleteMany,
  mockProductLeadTimeGroupCreateMany,
  mockProductUpdate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockStoreFindFirst: vi.fn(),
  mockLeadTimeGroupFindMany: vi.fn(),
  mockLeadTimeGroupCreate: vi.fn(),
  mockLeadTimeGroupFindFirst: vi.fn(),
  mockLeadTimeGroupUpdate: vi.fn(),
  mockLeadTimeGroupDelete: vi.fn(),
  mockProductLeadTimeGroupDeleteMany: vi.fn(),
  mockProductLeadTimeGroupCreateMany: vi.fn(),
  mockProductUpdate: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    store: { findFirst: mockStoreFindFirst },
    leadTimeGroup: {
      findMany: mockLeadTimeGroupFindMany,
      create: mockLeadTimeGroupCreate,
      findFirst: mockLeadTimeGroupFindFirst,
      findUnique: vi.fn().mockResolvedValue({ id: 'g1', products: [] }),
      update: mockLeadTimeGroupUpdate,
      delete: mockLeadTimeGroupDelete,
    },
    productLeadTimeGroup: {
      deleteMany: mockProductLeadTimeGroupDeleteMany,
      createMany: mockProductLeadTimeGroupCreateMany,
    },
    product: { update: mockProductUpdate },
    $transaction: mockTransaction,
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

const fakeStore = { id: 'store-1' };
const fakeGroup = { id: 'g1', storeId: 'store-1', name: 'Fornecedor CN', leadTimeDays: 30, bufferDays: null };

// ── GET /api/lead-time-groups ──────────────────────────────────────────────

describe('GET /api/lead-time-groups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValue(fakeStore);
    mockLeadTimeGroupFindMany.mockResolvedValue([]);
  });

  it('retorna 401 quando não autenticado', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/lead-time-groups/route');
    const res = await GET(makeRequest('GET', 'http://localhost/api/lead-time-groups'));
    expect(res.status).toBe(401);
  });

  it('retorna 404 quando store não encontrada', async () => {
    mockStoreFindFirst.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/lead-time-groups/route');
    const res = await GET(makeRequest('GET', 'http://localhost/api/lead-time-groups'));
    expect(res.status).toBe(404);
  });

  it('retorna 200 com lista vazia', async () => {
    const { GET } = await import('@/app/api/lead-time-groups/route');
    const res = await GET(makeRequest('GET', 'http://localhost/api/lead-time-groups'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groups).toEqual([]);
  });

  it('mapeia productCount corretamente', async () => {
    mockLeadTimeGroupFindMany.mockResolvedValueOnce([
      { ...fakeGroup, products: [{ productId: 'p1' }, { productId: 'p2' }] },
    ]);
    const { GET } = await import('@/app/api/lead-time-groups/route');
    const res = await GET(makeRequest('GET', 'http://localhost/api/lead-time-groups'));
    const body = await res.json();
    expect(body.groups[0].productCount).toBe(2);
    // products array must be stripped
    expect(body.groups[0].products).toBeUndefined();
  });
});

// ── POST /api/lead-time-groups ─────────────────────────────────────────────

describe('POST /api/lead-time-groups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValue(fakeStore);
    mockLeadTimeGroupCreate.mockResolvedValue(fakeGroup);
  });

  it('retorna 401 quando não autenticado', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/lead-time-groups/route');
    const res = await POST(makeRequest('POST', 'http://localhost/api/lead-time-groups', { name: 'A', leadTimeDays: 30 }));
    expect(res.status).toBe(401);
  });

  it('retorna 400 para body inválido', async () => {
    const { POST } = await import('@/app/api/lead-time-groups/route');
    const res = await POST(makeRequest('POST', 'http://localhost/api/lead-time-groups', { name: '' }));
    expect(res.status).toBe(400);
  });

  it('retorna 400 para leadTimeDays < 1', async () => {
    const { POST } = await import('@/app/api/lead-time-groups/route');
    const res = await POST(makeRequest('POST', 'http://localhost/api/lead-time-groups', { name: 'A', leadTimeDays: 0 }));
    expect(res.status).toBe(400);
  });

  it('retorna 201 ao criar grupo válido', async () => {
    const { POST } = await import('@/app/api/lead-time-groups/route');
    const res = await POST(
      makeRequest('POST', 'http://localhost/api/lead-time-groups', { name: 'Fornecedor CN', leadTimeDays: 30 })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.group.name).toBe('Fornecedor CN');
  });

  it('cria grupo com bufferDays quando fornecido', async () => {
    const { POST } = await import('@/app/api/lead-time-groups/route');
    await POST(
      makeRequest('POST', 'http://localhost/api/lead-time-groups', { name: 'A', leadTimeDays: 30, bufferDays: 10 })
    );
    expect(mockLeadTimeGroupCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bufferDays: 10 }) })
    );
  });
});

// ── PUT /api/lead-time-groups/[id] ────────────────────────────────────────

describe('PUT /api/lead-time-groups/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValue(fakeStore);
    mockLeadTimeGroupFindFirst.mockResolvedValue(fakeGroup);
    mockLeadTimeGroupUpdate.mockResolvedValue({ ...fakeGroup, name: 'Updated' });
  });

  it('retorna 401 quando não autenticado', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const { PUT } = await import('@/app/api/lead-time-groups/[id]/route');
    const res = await PUT(
      makeRequest('PUT', 'http://localhost/api/lead-time-groups/g1', { name: 'X', leadTimeDays: 10 }),
      { params: { id: 'g1' } }
    );
    expect(res.status).toBe(401);
  });

  it('retorna 404 quando grupo não pertence à store', async () => {
    mockLeadTimeGroupFindFirst.mockResolvedValueOnce(null);
    const { PUT } = await import('@/app/api/lead-time-groups/[id]/route');
    const res = await PUT(
      makeRequest('PUT', 'http://localhost/api/lead-time-groups/g1', { name: 'X', leadTimeDays: 10 }),
      { params: { id: 'g1' } }
    );
    expect(res.status).toBe(404);
  });

  it('retorna 200 ao atualizar grupo', async () => {
    const { PUT } = await import('@/app/api/lead-time-groups/[id]/route');
    const res = await PUT(
      makeRequest('PUT', 'http://localhost/api/lead-time-groups/g1', { name: 'Updated', leadTimeDays: 45 }),
      { params: { id: 'g1' } }
    );
    expect(res.status).toBe(200);
  });
});

// ── DELETE /api/lead-time-groups/[id] ────────────────────────────────────

describe('DELETE /api/lead-time-groups/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValue(fakeStore);
    mockLeadTimeGroupFindFirst.mockResolvedValue(fakeGroup);
    mockLeadTimeGroupDelete.mockResolvedValue(fakeGroup);
  });

  it('retorna 401 quando não autenticado', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const { DELETE } = await import('@/app/api/lead-time-groups/[id]/route');
    const res = await DELETE(
      makeRequest('DELETE', 'http://localhost/api/lead-time-groups/g1'),
      { params: { id: 'g1' } }
    );
    expect(res.status).toBe(401);
  });

  it('retorna 404 quando grupo não pertence à store', async () => {
    mockLeadTimeGroupFindFirst.mockResolvedValueOnce(null);
    const { DELETE } = await import('@/app/api/lead-time-groups/[id]/route');
    const res = await DELETE(
      makeRequest('DELETE', 'http://localhost/api/lead-time-groups/g1'),
      { params: { id: 'g1' } }
    );
    expect(res.status).toBe(404);
  });

  it('retorna 200 ao deletar grupo', async () => {
    const { DELETE } = await import('@/app/api/lead-time-groups/[id]/route');
    const res = await DELETE(
      makeRequest('DELETE', 'http://localhost/api/lead-time-groups/g1'),
      { params: { id: 'g1' } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
