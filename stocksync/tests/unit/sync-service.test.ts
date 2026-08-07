import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockDecrypt = vi.fn((encrypted: string) => `token:${encrypted}`);
const mockStoreFindUniqueOrThrow = vi.fn();
const mockStoreUpdate = vi.fn();
const mockProductUpsert = vi.fn();
const mockProductFindMany = vi.fn();
const mockVariantUpsert = vi.fn();
const mockCollectionUpsert = vi.fn();
const mockCollectionFindUnique = vi.fn();
const mockProductCollectionUpsert = vi.fn();
const mockTransaction = vi.fn((operations: Promise<unknown>[]) => Promise.all(operations));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    store: {
      findUniqueOrThrow: mockStoreFindUniqueOrThrow,
      update: mockStoreUpdate,
    },
    product: {
      upsert: mockProductUpsert,
      findMany: mockProductFindMany,
    },
    variant: { upsert: mockVariantUpsert },
    collection: {
      upsert: mockCollectionUpsert,
      findUnique: mockCollectionFindUnique,
    },
    productCollection: { upsert: mockProductCollectionUpsert },
    $transaction: mockTransaction,
  },
}));

vi.mock('@/lib/encrypt', () => ({ decrypt: mockDecrypt }));

function makeProduct(id: number, variantCount = 1) {
  return {
    id,
    title: `Product ${id}`,
    handle: `product-${id}`,
    variants: Array.from({ length: variantCount }, (_, index) => ({
      id: id * 100 + index,
      product_id: id,
      title: `Variant ${index + 1}`,
      sku: `SKU-${id}-${index}`,
      inventory_quantity: 10 + index,
      inventory_item_id: null,
      price: '25.00',
    })),
  };
}

function response(
  body: unknown,
  options: { status?: number; link?: string | null; retryAfter?: string | null } = {}
) {
  const status = options.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (key: string) => {
        if (key.toLowerCase() === 'link') return options.link ?? null;
        if (key.toLowerCase() === 'retry-after') return options.retryAfter ?? null;
        return null;
      },
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('syncStore', () => {
  const storeId = 'store-1';
  const mockStore = {
    id: storeId,
    shopifyDomain: 'test-store.myshopify.com',
    accessTokenEncrypted: 'enc-token',
    syncCursor: null as string | null,
    syncStatus: 'PENDING',
    syncDone: 0,
    syncTotal: null as number | null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.syncCursor = null;
    mockStore.syncStatus = 'PENDING';
    mockStore.syncDone = 0;
    mockStore.syncTotal = null;
    mockStoreFindUniqueOrThrow.mockImplementation(() => Promise.resolve({ ...mockStore }));
    mockStoreUpdate.mockImplementation(
      ({ data }: { data: Partial<typeof mockStore> }) => {
        Object.assign(mockStore, data);
        return Promise.resolve({ ...mockStore });
      }
    );
    mockProductUpsert.mockResolvedValue({ id: 'ignored-by-batch-mapper' });
    mockProductFindMany.mockImplementation(
      ({ where }: { where: { shopifyProductId: { in: string[] } } }) =>
        Promise.resolve(
          where.shopifyProductId.in.map((shopifyProductId) => ({
            id: `db-product-${shopifyProductId}`,
            shopifyProductId,
          }))
        )
    );
    mockVariantUpsert.mockResolvedValue({ id: 'db-variant-id' });
    mockCollectionUpsert.mockResolvedValue({ id: 'db-collection-id' });
    mockProductCollectionUpsert.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('syncs a single page of products successfully', async () => {
    const products = [makeProduct(1, 2), makeProduct(2, 1)];
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ shop: { id: 1 } }))
      .mockResolvedValueOnce(response({ count: products.length }))
      .mockResolvedValueOnce(response({ products }))
      .mockResolvedValueOnce(response({ smart_collections: [] }))
      .mockResolvedValueOnce(response({ custom_collections: [] })) as ReturnType<typeof vi.fn>;

    const { syncStore } = await import('@/services/shopify/sync');
    await syncStore(storeId);

    expect(mockProductUpsert).toHaveBeenCalledTimes(2);
    expect(mockVariantUpsert).toHaveBeenCalledTimes(3);
    expect(mockStore.syncStatus).toBe('COMPLETE');
    expect(mockStore.syncDone).toBe(2);
  });

  it('resumes from the saved cursor and paginates through multiple batches', async () => {
    const page1 = [makeProduct(1)];
    const page2 = [makeProduct(2)];
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ shop: { id: 1 } }))
      .mockResolvedValueOnce(response({ count: 2 }))
      .mockResolvedValueOnce(
        response(
          { products: page1 },
          { link: '<https://test.myshopify.com?page_info=cursor-abc>; rel="next"' }
        )
      )
      .mockResolvedValueOnce(response({ products: page2 }))
      .mockResolvedValueOnce(response({ smart_collections: [] }))
      .mockResolvedValueOnce(response({ custom_collections: [] })) as ReturnType<typeof vi.fn>;

    const { syncStore } = await import('@/services/shopify/sync');
    await syncStore(storeId);

    expect(mockProductUpsert).toHaveBeenCalledTimes(2);
    expect(mockStore.syncDone).toBe(2);
    expect(mockStore.syncCursor).toBeNull();
    expect(mockStore.syncStatus).toBe('COMPLETE');
  });

  it('retries product requests on HTTP 429 and succeeds', async () => {
    vi.useFakeTimers();
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ shop: { id: 1 } }))
      .mockResolvedValueOnce(response({ count: 1 }))
      .mockResolvedValueOnce(response({}, { status: 429, retryAfter: '1' }))
      .mockResolvedValueOnce(response({ products: [makeProduct(1)] }))
      .mockResolvedValueOnce(response({ smart_collections: [] }))
      .mockResolvedValueOnce(response({ custom_collections: [] })) as ReturnType<typeof vi.fn>;

    const { syncStore } = await import('@/services/shopify/sync');
    const syncPromise = syncStore(storeId);
    await vi.runAllTimersAsync();
    await syncPromise;

    expect(global.fetch).toHaveBeenCalledTimes(6);
    expect(mockStore.syncStatus).toBe('COMPLETE');
  });

  it('sets syncStatus ERROR on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error')) as ReturnType<
      typeof vi.fn
    >;

    const { syncStore } = await import('@/services/shopify/sync');
    await expect(syncStore(storeId)).rejects.toThrow('Network error');

    expect(mockStore.syncStatus).toBe('ERROR');
  });

  it('uses the internal product ID when upserting variants', async () => {
    const product = makeProduct(42);
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ shop: { id: 1 } }))
      .mockResolvedValueOnce(response({ count: 1 }))
      .mockResolvedValueOnce(response({ products: [product] }))
      .mockResolvedValueOnce(response({ smart_collections: [] }))
      .mockResolvedValueOnce(response({ custom_collections: [] })) as ReturnType<typeof vi.fn>;

    const { syncStore } = await import('@/services/shopify/sync');
    await syncStore(storeId);

    expect(mockVariantUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ productId: 'db-product-42' }),
      })
    );
  });
});
