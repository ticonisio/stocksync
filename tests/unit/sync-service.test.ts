import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockDecrypt = vi.fn((encrypted: string) => `token:${encrypted}`);
const mockStoreFindUniqueOrThrow = vi.fn();
const mockStoreUpdate = vi.fn();
const mockProductUpsert = vi.fn();
const mockVariantUpsert = vi.fn();
const mockCollectionUpsert = vi.fn();
const mockProductFindUnique = vi.fn();
const mockCollectionFindUnique = vi.fn();
const mockProductCollectionUpsert = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    store: {
      findUniqueOrThrow: mockStoreFindUniqueOrThrow,
      update: mockStoreUpdate,
    },
    product: {
      upsert: mockProductUpsert,
      findUnique: mockProductFindUnique,
    },
    variant: { upsert: mockVariantUpsert },
    collection: {
      upsert: mockCollectionUpsert,
      findUnique: mockCollectionFindUnique,
    },
    productCollection: { upsert: mockProductCollectionUpsert },
  },
}));

vi.mock('@/lib/encrypt', () => ({ decrypt: mockDecrypt }));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeProduct(id: number, variantCount = 1) {
  return {
    id,
    title: `Product ${id}`,
    handle: `product-${id}`,
    variants: Array.from({ length: variantCount }, (_, i) => ({
      id: id * 100 + i,
      product_id: id,
      title: `Variant ${i + 1}`,
      sku: `SKU-${id}-${i}`,
      inventory_quantity: 10 + i,
    })),
  };
}

function mockFetchOnce(body: unknown, headers: Record<string, string> = {}, status = 200) {
  return vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (key: string) => headers[key] ?? null },
    json: async () => body,
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('syncStore', () => {
  const storeId = 'store-1';
  const mockStore = {
    id: storeId,
    shopifyDomain: 'test-store.myshopify.com',
    accessTokenEncrypted: 'enc-token',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreFindUniqueOrThrow.mockResolvedValue(mockStore);
    mockStoreUpdate.mockResolvedValue({});
    mockProductUpsert.mockImplementation(({ create }: { create: { id?: string } }) =>
      Promise.resolve({ id: 'db-product-id', ...create })
    );
    mockVariantUpsert.mockResolvedValue({ id: 'db-variant-id' });
    mockCollectionUpsert.mockResolvedValue({ id: 'db-collection-id' });
    mockProductCollectionUpsert.mockResolvedValue({});
  });

  it('syncs a single page of products successfully', async () => {
    const products = [makeProduct(1, 2), makeProduct(2, 1)];

    global.fetch = vi
      .fn()
      // products page (no next cursor)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ products }),
      })
      // smart_collections
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ smart_collections: [] }),
      })
      // custom_collections
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ custom_collections: [] }),
      })
      // collects page
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ collects: [] }),
      }) as ReturnType<typeof vi.fn>;

    const { syncStore } = await import('@/services/shopify/sync');
    await syncStore(storeId);

    expect(mockStoreUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ syncStatus: 'SYNCING' }) })
    );
    expect(mockProductUpsert).toHaveBeenCalledTimes(2);
    expect(mockVariantUpsert).toHaveBeenCalledTimes(3); // 2 + 1
    expect(mockStoreUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ syncStatus: 'COMPLETE' }) })
    );
  });

  it('paginates through multiple pages of products', async () => {
    const page1 = [makeProduct(1)];
    const page2 = [makeProduct(2)];

    global.fetch = vi
      .fn()
      // page 1 — has next cursor
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (k: string) =>
            k === 'Link' ? '<https://test.myshopify.com?page_info=cursor-abc>; rel="next"' : null,
        },
        json: async () => ({ products: page1 }),
      })
      // page 2 — no next cursor
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ products: page2 }),
      })
      // smart_collections
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ smart_collections: [] }),
      })
      // custom_collections
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ custom_collections: [] }),
      })
      // collects
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ collects: [] }),
      }) as ReturnType<typeof vi.fn>;

    const { syncStore } = await import('@/services/shopify/sync');
    await syncStore(storeId);

    expect(mockProductUpsert).toHaveBeenCalledTimes(2);
    // syncDone updated twice (once per page)
    const syncDoneUpdates = mockStoreUpdate.mock.calls.filter(
      (call) => call[0].data.syncDone !== undefined && call[0].data.syncStatus === undefined
    );
    expect(syncDoneUpdates).toHaveLength(2);
  });

  it('retries on HTTP 429 and succeeds', async () => {
    vi.useFakeTimers();

    global.fetch = vi
      .fn()
      // first attempt — 429
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (k: string) => (k === 'Retry-After' ? '1' : null) },
        json: async () => ({}),
      })
      // retry — success
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ products: [makeProduct(1)] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ smart_collections: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ custom_collections: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ collects: [] }),
      }) as ReturnType<typeof vi.fn>;

    const { syncStore } = await import('@/services/shopify/sync');
    const syncPromise = syncStore(storeId);
    await vi.runAllTimersAsync();
    await syncPromise;

    expect(global.fetch).toHaveBeenCalledTimes(5);
    expect(mockStoreUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ syncStatus: 'COMPLETE' }) })
    );

    vi.useRealTimers();
  });

  it('sets syncStatus ERROR on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error')) as ReturnType<
      typeof vi.fn
    >;

    const { syncStore } = await import('@/services/shopify/sync');
    await expect(syncStore(storeId)).rejects.toThrow('Network error');

    expect(mockStoreUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ syncStatus: 'ERROR' }) })
    );
  });

  it('upserts variant with correct productId from DB', async () => {
    const product = makeProduct(42, 1);
    mockProductUpsert.mockResolvedValueOnce({ id: 'db-product-42' });

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ products: [product] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ smart_collections: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ custom_collections: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ collects: [] }),
      }) as ReturnType<typeof vi.fn>;

    const { syncStore } = await import('@/services/shopify/sync');
    await syncStore(storeId);

    expect(mockVariantUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ productId: 'db-product-42' }),
      })
    );
  });
});
