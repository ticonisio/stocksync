import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────

const mockGetServerSession = vi.fn();
const mockPrismaStoreFindFirst = vi.fn();
const mockPrismaImportCreate = vi.fn();
const mockPrismaImportItemCreateMany = vi.fn();
const mockPrismaImportItemFindMany = vi.fn();
const mockPrismaVariantFindMany = vi.fn();
const mockPrismaVariantUpdate = vi.fn();
const mockPrismaImportUpdate = vi.fn();
const mockPrismaTransaction = vi.fn();
const mockPrismaImportFindFirst = vi.fn();

vi.mock('next-auth', () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/subscription', () => ({
  getSubscription: vi.fn().mockResolvedValue({
    status: 'ACTIVE',
    currentPeriodEnd: new Date(Date.now() + 86400000),
  }),
  isSubscriptionActive: vi.fn().mockReturnValue(true),
  checkImportLimit: vi.fn().mockResolvedValue({ allowed: true, used: 0, limit: 10 }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    store: { findFirst: (...args: unknown[]) => mockPrismaStoreFindFirst(...args) },
    import: {
      create: (...args: unknown[]) => mockPrismaImportCreate(...args),
      update: (...args: unknown[]) => mockPrismaImportUpdate(...args),
      findFirst: (...args: unknown[]) => mockPrismaImportFindFirst(...args),
    },
    importItem: {
      createMany: (...args: unknown[]) => mockPrismaImportItemCreateMany(...args),
      findMany: (...args: unknown[]) => mockPrismaImportItemFindMany(...args),
    },
    variant: {
      findMany: (...args: unknown[]) => mockPrismaVariantFindMany(...args),
      update: (...args: unknown[]) => mockPrismaVariantUpdate(...args),
    },
    $transaction: (...args: unknown[]) => mockPrismaTransaction(...args),
  },
}));

// ─── Helpers ───────────────────────────────────────────────

function createRequest(body: unknown): Request {
  return new Request('http://localhost/api/imports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createGetRequest(url = 'http://localhost/api/imports'): Request {
  return new Request(url, { method: 'GET' });
}

const validSession = { user: { id: 'user-1' } };
const store = { id: 'store-1', userId: 'user-1' };

// ─── Tests ─────────────────────────────────────────────────

describe('POST /api/imports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue(validSession);
    mockPrismaStoreFindFirst.mockResolvedValue(store);
    mockPrismaVariantFindMany.mockResolvedValue([{ id: 'var-1', productId: 'prod-1' }]);
  });

  it('increments stock for matched items (NEVER sets)', async () => {
    const variantUpdateCalls: unknown[] = [];

    mockPrismaTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        import: {
          create: vi.fn().mockResolvedValue({ id: 'imp-1' }),
          update: vi.fn().mockResolvedValue({}),
        },
        importItem: {
          createMany: vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([
            { quantity: 10, unitCost: 5.0 },
          ]),
        },
        variant: {
          update: vi.fn().mockImplementation((args: unknown) => {
            variantUpdateCalls.push(args);
            return Promise.resolve({});
          }),
        },
      };
      return fn(tx);
    });

    const { POST } = await import('@/app/api/imports/route');

    const req = createRequest({
      fileName: 'test.csv',
      items: [
        {
          rawTitle: 'Product A',
          quantity: 10,
          unitCost: 5.0,
          matchedProductId: 'prod-1',
          matchedVariantId: 'var-1',
          matchStatus: 'MATCHED',
        },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    // Verify increment was used (first call is the stock update)
    const stockUpdate = variantUpdateCalls[0] as { data: { availableStock: { increment: number } } };
    expect(stockUpdate.data.availableStock).toEqual({ increment: 10 });

    // Verify NO set operation was used
    expect(stockUpdate.data.availableStock).not.toHaveProperty('set');
  });

  it('NEVER decrements stock — quantity must be positive', async () => {
    const { POST } = await import('@/app/api/imports/route');

    const req = createRequest({
      fileName: 'test.csv',
      items: [
        {
          rawTitle: 'Product A',
          quantity: -5, // Negative quantity
          unitCost: 5.0,
          matchedProductId: 'prod-1',
          matchedVariantId: 'var-1',
          matchStatus: 'MATCHED',
        },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(400); // Zod validation rejects negative
  });

  it('calculates weighted average cost correctly', async () => {
    let averageCostSaved: number | null = null;

    mockPrismaTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        import: {
          create: vi.fn().mockResolvedValue({ id: 'imp-1' }),
          update: vi.fn().mockResolvedValue({}),
        },
        importItem: {
          createMany: vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([
            // Previous import: 10 units at $5
            { quantity: 10, unitCost: 5.0 },
            // Current import: 20 units at $8
            { quantity: 20, unitCost: 8.0 },
          ]),
        },
        variant: {
          update: vi.fn().mockImplementation((args: { data: { averageCost?: number | null } }) => {
            if (args.data.averageCost !== undefined) {
              averageCostSaved = args.data.averageCost;
            }
            return Promise.resolve({});
          }),
        },
      };
      return fn(tx);
    });

    const { POST } = await import('@/app/api/imports/route');

    const req = createRequest({
      fileName: 'test.csv',
      items: [
        {
          rawTitle: 'Product A',
          quantity: 20,
          unitCost: 8.0,
          matchedProductId: 'prod-1',
          matchedVariantId: 'var-1',
          matchStatus: 'MATCHED',
        },
      ],
    });

    await POST(req);

    // CMP = (10*5 + 20*8) / (10+20) = (50+160)/30 = 210/30 = 7.0
    expect(averageCostSaved).toBe(7);
  });

  it('ignores UNMATCHED items — does not update stock', async () => {
    let variantUpdateCalled = false;

    mockPrismaTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        import: {
          create: vi.fn().mockResolvedValue({ id: 'imp-1' }),
          update: vi.fn().mockResolvedValue({}),
        },
        importItem: {
          createMany: vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([]),
        },
        variant: {
          update: vi.fn().mockImplementation(() => {
            variantUpdateCalled = true;
            return Promise.resolve({});
          }),
        },
      };
      return fn(tx);
    });

    const { POST } = await import('@/app/api/imports/route');

    const req = createRequest({
      fileName: 'test.csv',
      items: [
        {
          rawTitle: 'Unknown Product',
          quantity: 10,
          unitCost: 5.0,
          matchedProductId: null,
          matchedVariantId: null,
          matchStatus: 'UNMATCHED',
        },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(variantUpdateCalled).toBe(false);
  });

  it('rejects matched variants from another store', async () => {
    mockPrismaVariantFindMany.mockResolvedValueOnce([]);
    const { POST } = await import('@/app/api/imports/route');

    const req = createRequest({
      fileName: 'test.csv',
      items: [
        {
          rawTitle: 'Product A',
          quantity: 10,
          unitCost: 5.0,
          matchedProductId: 'prod-1',
          matchedVariantId: 'other-store-var',
          matchStatus: 'MATCHED',
        },
      ],
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(mockPrismaTransaction).not.toHaveBeenCalled();
  });
});

describe('GET /api/imports/[id] — cross-store protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue(validSession);
    mockPrismaStoreFindFirst.mockResolvedValue(store);
  });

  it('returns 404 when import belongs to another store', async () => {
    mockPrismaImportFindFirst.mockResolvedValue(null); // findFirst with storeId filter returns null

    const { GET } = await import('@/app/api/imports/[id]/route');

    const req = createGetRequest('http://localhost/api/imports/other-store-import');
    const res = await GET(req, { params: { id: 'other-store-import' } });

    expect(res.status).toBe(404);

    // Verify that storeId was included in the query
    expect(mockPrismaImportFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: store.id,
        }),
      })
    );
  });
});
