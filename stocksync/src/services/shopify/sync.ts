import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encrypt';
import type { ShopifyProduct, ShopifyVariant, ShopifyInventoryItem, ShopifyCollection } from '@/types/shopify';

const SHOPIFY_API_VERSION = '2026-01';
const PAGE_SIZE = 25;
const PAGES_PER_BATCH = 1;
const REQUEST_DELAY_MS = 500;
const MAX_RETRIES = 3;
const MAX_PAGES = 200; // Safety: max 40,000 products (200 * 200)

export type SyncBatchResult = {
  status: 'syncing' | 'complete' | 'error';
  syncDone: number;
  syncTotal: number | null;
  hasMore: boolean;
  error?: string;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, token: string, attempt = 0): Promise<Response> {
  const res = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': token },
    signal: AbortSignal.timeout(10000),
  });

  if (res.status === 429 && attempt < MAX_RETRIES) {
    const retryAfterSec = parseInt(res.headers.get('Retry-After') ?? '2', 10);
    const waitMs = (retryAfterSec + attempt) * 1000 * Math.pow(2, attempt);
    await delay(waitMs);
    return fetchWithRetry(url, token, attempt + 1);
  }

  if (!res.ok) {
    let errorBody = '';
    try {
      errorBody = await res.text();
    } catch {
      errorBody = '(could not read response body)';
    }
    console.error(`[sync] Shopify API error: ${res.status} ${url}`, errorBody);

    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Token inválido ou expirado (HTTP ${res.status}). Reconecte sua loja com um novo token.`
      );
    }

    throw new Error(`Shopify API error: ${res.status} ${url} — ${errorBody.slice(0, 200)}`);
  }

  return res;
}

async function fetchProductCount(domain: string, token: string): Promise<number> {
  const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/products/count.json`;
  const res = await fetchWithRetry(url, token);
  const data = (await res.json()) as { count: number };
  return data.count;
}

async function validateToken(domain: string, token: string): Promise<void> {
  const res = await fetch(
    `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`,
    {
      headers: { 'X-Shopify-Access-Token': token },
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!res.ok) {
    let errorBody = '';
    try {
      errorBody = await res.text();
    } catch {
      errorBody = '';
    }
    console.error(`[sync] Token validation failed: ${res.status}`, errorBody);
    throw new Error(
      `Token inválido ou expirado (HTTP ${res.status}). Reconecte sua loja com um novo token.`
    );
  }

  console.log(`[sync] Token validated successfully for ${domain}`);
}

async function fetchProductsPage(
  domain: string,
  token: string,
  cursor?: string
): Promise<{ products: ShopifyProduct[]; nextCursor: string | undefined }> {
  const url = new URL(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/products.json`);
  url.searchParams.set('limit', String(PAGE_SIZE));
  if (cursor) url.searchParams.set('page_info', cursor);

  const res = await fetchWithRetry(url.toString(), token);
  const data = (await res.json()) as { products: ShopifyProduct[] };

  const linkHeader = res.headers.get('Link') ?? '';
  const nextMatch = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  const nextCursor = nextMatch?.[1];

  return { products: data.products ?? [], nextCursor };
}

async function fetchInventoryItemCosts(
  domain: string,
  token: string,
  inventoryItemIds: number[]
): Promise<Map<number, number | null>> {
  const costMap = new Map<number, number | null>();
  const BATCH = 50; // Shopify allows up to 250 ids per request, but we keep it safe

  for (let i = 0; i < inventoryItemIds.length; i += BATCH) {
    const batch = inventoryItemIds.slice(i, i + BATCH);
    const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/inventory_items.json?ids=${batch.join(',')}`;
    const res = await fetchWithRetry(url, token);
    const data = (await res.json()) as { inventory_items: ShopifyInventoryItem[] };

    for (const item of data.inventory_items) {
      const cost = item.cost !== null && item.cost !== undefined ? parseFloat(item.cost) : null;
      costMap.set(item.id, cost !== null && !isNaN(cost) ? cost : null);
    }

    if (i + BATCH < inventoryItemIds.length) await delay(REQUEST_DELAY_MS);
  }

  return costMap;
}

async function upsertProductsPage(storeId: string, domain: string, token: string, products: ShopifyProduct[]): Promise<void> {
  await prisma.$transaction(
    products.map((p) =>
      prisma.product.upsert({
        where: { storeId_shopifyProductId: { storeId, shopifyProductId: String(p.id) } },
        update: { title: p.title, handle: p.handle },
        create: { storeId, shopifyProductId: String(p.id), title: p.title, handle: p.handle },
      })
    )
  );

  // Fetch costs from inventory items API
  const allVariants = products.flatMap((p) => p.variants);
  const inventoryItemIds = allVariants
    .map((v) => v.inventory_item_id)
    .filter((id): id is number => id != null);
  const costMap = inventoryItemIds.length > 0
    ? await fetchInventoryItemCosts(domain, token, inventoryItemIds)
    : new Map<number, number | null>();

  const productRecords = await prisma.product.findMany({
    where: {
      storeId,
      shopifyProductId: { in: products.map((p) => String(p.id)) },
    },
    select: { id: true, shopifyProductId: true },
  });
  const productIdMap = new Map(productRecords.map((r) => [r.shopifyProductId, r.id]));

  const variantOps = products.flatMap((p) => {
    const productId = productIdMap.get(String(p.id));
    if (!productId) return [];
    return p.variants.map((v) => {
      const cost = costMap.get(v.inventory_item_id) ?? null;
      const price = v.price ? parseFloat(v.price) : null;
      return prisma.variant.upsert({
        where: { storeId_shopifyVariantId: { storeId, shopifyVariantId: String(v.id) } },
        update: {
          title: v.title,
          sku: v.sku ?? null,
          availableStock: v.inventory_quantity,
          averageCost: cost,
          price: price !== null && !isNaN(price) ? price : null,
        },
        create: {
          storeId,
          productId,
          shopifyVariantId: String(v.id),
          title: v.title,
          sku: v.sku ?? null,
          availableStock: v.inventory_quantity,
          averageCost: cost,
          price: price !== null && !isNaN(price) ? price : null,
        },
      });
    });
  });

  const CHUNK_SIZE = 50;
  for (let i = 0; i < variantOps.length; i += CHUNK_SIZE) {
    await prisma.$transaction(variantOps.slice(i, i + CHUNK_SIZE));
  }
}

async function fetchAllCollections(
  domain: string,
  token: string
): Promise<ShopifyCollection[]> {
  const [smartRes, customRes] = await Promise.all([
    fetchWithRetry(
      `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/smart_collections.json?limit=${PAGE_SIZE}`,
      token
    ),
    fetchWithRetry(
      `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/custom_collections.json?limit=${PAGE_SIZE}`,
      token
    ),
  ]);

  const smartData = (await smartRes.json()) as { smart_collections: ShopifyCollection[] };
  const customData = (await customRes.json()) as { custom_collections: ShopifyCollection[] };

  return [...smartData.smart_collections, ...customData.custom_collections];
}

async function syncCollections(storeId: string, domain: string, token: string): Promise<void> {
  const collections = await fetchAllCollections(domain, token);

  if (collections.length === 0) return;

  await prisma.$transaction(
    collections.map((c) =>
      prisma.collection.upsert({
        where: { storeId_shopifyCollectionId: { storeId, shopifyCollectionId: String(c.id) } },
        update: { title: c.title, handle: c.handle },
        create: {
          storeId,
          shopifyCollectionId: String(c.id),
          title: c.title,
          handle: c.handle,
        },
      })
    )
  );

  // Sync product-collection relationships per collection
  // This works for BOTH smart collections (tag-based) and custom collections
  for (const collection of collections) {
    await syncCollectionProducts(storeId, domain, token, collection.id);
    await delay(REQUEST_DELAY_MS);
  }
}

async function syncCollectionProducts(
  storeId: string,
  domain: string,
  token: string,
  shopifyCollectionId: number
): Promise<void> {
  const collectionRecord = await prisma.collection.findUnique({
    where: { storeId_shopifyCollectionId: { storeId, shopifyCollectionId: String(shopifyCollectionId) } },
    select: { id: true },
  });
  if (!collectionRecord) return;

  let cursor: string | undefined;
  let page = 0;

  do {
    const url = new URL(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/products.json`);
    url.searchParams.set('collection_id', String(shopifyCollectionId));
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('fields', 'id');
    if (cursor) url.searchParams.set('page_info', cursor);

    const res = await fetchWithRetry(url.toString(), token);
    const data = (await res.json()) as { products: { id: number }[] };

    const linkHeader = res.headers.get('Link') ?? '';
    const nextMatch = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    cursor = nextMatch?.[1];

    if (!data.products || data.products.length === 0) break;

    const shopifyProductIds = data.products.map((p) => String(p.id));
    const productRecords = await prisma.product.findMany({
      where: { storeId, shopifyProductId: { in: shopifyProductIds } },
      select: { id: true },
    });

    const upsertOps = productRecords.map((p) =>
      prisma.productCollection.upsert({
        where: { productId_collectionId: { productId: p.id, collectionId: collectionRecord.id } },
        update: {},
        create: { productId: p.id, collectionId: collectionRecord.id },
      })
    );

    if (upsertOps.length > 0) {
      await prisma.$transaction(upsertOps);
    }

    page++;
    if (cursor) await delay(REQUEST_DELAY_MS);
  } while (cursor && page < MAX_PAGES);
}

/**
 * Sync one batch of products (up to BATCH_LIMIT).
 * Resumes from the stored cursor and saves the next cursor for the following batch.
 * After all products are synced, also syncs collections and collects.
 */
export async function syncStoreBatch(storeId: string): Promise<SyncBatchResult> {
  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
  const accessToken = decrypt(store.accessTokenEncrypted);
  const domain = store.shopifyDomain;

  try {
    // First batch or re-sync: validate token, fetch total count, and reset state
    const isResync = !store.syncCursor && store.syncStatus !== 'SYNCING';
    if (isResync) {
      await validateToken(domain, accessToken);
      const productCount = await fetchProductCount(domain, accessToken);
      await prisma.store.update({
        where: { id: storeId },
        data: { syncStatus: 'SYNCING', syncDone: 0, syncTotal: productCount, syncError: null, syncCursor: null },
      });
      store.syncTotal = productCount;
      store.syncDone = 0;
    }

    let cursor: string | undefined = store.syncCursor ?? undefined;
    let pagesProcessed = 0;
    let totalDone = store.syncDone ?? 0;

    // Fetch pages until we reach PAGES_PER_BATCH limit
    while (pagesProcessed < PAGES_PER_BATCH) {
      const { products, nextCursor } = await fetchProductsPage(domain, accessToken, cursor);

      if (products.length === 0) {
        cursor = undefined;
        break;
      }

      await upsertProductsPage(storeId, domain, accessToken, products);
      totalDone += products.length;
      pagesProcessed++;

      await prisma.store.update({
        where: { id: storeId },
        data: { syncDone: totalDone, syncCursor: nextCursor ?? null },
      });

      cursor = nextCursor;
      if (!cursor) break;
      if (pagesProcessed < PAGES_PER_BATCH) await delay(REQUEST_DELAY_MS);
    }

    // If there's still a cursor, there are more products to sync
    if (cursor) {
      console.log(`[sync] Batch complete for ${domain}: ${totalDone}/${store.syncTotal ?? '?'} products so far, resuming later`);
      return { status: 'syncing', syncDone: totalDone, syncTotal: store.syncTotal, hasMore: true };
    }

    // All products done — sync collections (non-blocking: don't fail the whole sync)
    console.log(`[sync] All products synced for ${domain} (${totalDone}), syncing collections...`);
    try {
      await syncCollections(storeId, domain, accessToken);
      console.log(`[sync] Collections synced for ${domain}`);
    } catch (collErr) {
      console.error(`[sync] Collection sync failed (non-blocking):`, collErr instanceof Error ? collErr.message : collErr);
    }

    await prisma.store.update({
      where: { id: storeId },
      data: { syncStatus: 'COMPLETE', syncCursor: null, lastSyncedAt: new Date() },
    });

    console.log(`[sync] Sync complete for ${domain}: ${totalDone} products`);
    return { status: 'complete', syncDone: totalDone, syncTotal: store.syncTotal, hasMore: false };

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[sync] Sync batch failed for store ${storeId}:`, errorMessage);
    await prisma.store.update({
      where: { id: storeId },
      data: { syncStatus: 'ERROR', syncError: errorMessage, syncCursor: null },
    }).catch(() => {});
    return { status: 'error', syncDone: store.syncDone ?? 0, syncTotal: store.syncTotal, hasMore: false, error: errorMessage };
  }
}

/**
 * @deprecated Use syncStoreBatch for chunked sync. Kept for backward compatibility.
 */
export async function syncStore(storeId: string): Promise<void> {
  let result: SyncBatchResult;
  do {
    result = await syncStoreBatch(storeId);
  } while (result.hasMore);

  if (result.status === 'error') {
    throw new Error(result.error);
  }
}

export type { ShopifyProduct, ShopifyVariant, ShopifyInventoryItem, ShopifyCollection };
