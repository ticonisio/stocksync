import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encrypt';
import type { ShopifyProduct, ShopifyVariant, ShopifyCollection, ShopifyCollect } from '@/types/shopify';

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

async function upsertProductsPage(storeId: string, products: ShopifyProduct[]): Promise<void> {
  await prisma.$transaction(
    products.map((p) =>
      prisma.product.upsert({
        where: { storeId_shopifyProductId: { storeId, shopifyProductId: String(p.id) } },
        update: { title: p.title, handle: p.handle },
        create: { storeId, shopifyProductId: String(p.id), title: p.title, handle: p.handle },
      })
    )
  );

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
    return p.variants.map((v) =>
      prisma.variant.upsert({
        where: { storeId_shopifyVariantId: { storeId, shopifyVariantId: String(v.id) } },
        update: {
          title: v.title,
          sku: v.sku ?? null,
          availableStock: v.inventory_quantity,
        },
        create: {
          storeId,
          productId,
          shopifyVariantId: String(v.id),
          title: v.title,
          sku: v.sku ?? null,
          availableStock: v.inventory_quantity,
        },
      })
    );
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
}

async function fetchCollectsPage(
  domain: string,
  token: string,
  cursor?: string
): Promise<{ collects: ShopifyCollect[]; nextCursor: string | undefined }> {
  const url = new URL(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/collects.json`);
  url.searchParams.set('limit', String(PAGE_SIZE));
  if (cursor) url.searchParams.set('page_info', cursor);

  const res = await fetchWithRetry(url.toString(), token);
  const data = (await res.json()) as { collects: ShopifyCollect[] };

  const linkHeader = res.headers.get('Link') ?? '';
  const nextMatch = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  const nextCursor = nextMatch?.[1];

  return { collects: data.collects ?? [], nextCursor };
}

async function syncCollects(storeId: string, domain: string, token: string): Promise<void> {
  let cursor: string | undefined;
  let page = 0;

  do {
    const { collects, nextCursor } = await fetchCollectsPage(domain, token, cursor);

    if (collects.length === 0) break;

    const shopifyProductIds = collects.map((c) => String(c.product_id));
    const shopifyCollectionIds = collects.map((c) => String(c.collection_id));

    const [products, collections] = await Promise.all([
      prisma.product.findMany({
        where: { storeId, shopifyProductId: { in: shopifyProductIds } },
        select: { id: true, shopifyProductId: true },
      }),
      prisma.collection.findMany({
        where: { storeId, shopifyCollectionId: { in: shopifyCollectionIds } },
        select: { id: true, shopifyCollectionId: true },
      }),
    ]);

    const productMap = new Map(products.map((p) => [p.shopifyProductId, p.id]));
    const collectionMap = new Map(collections.map((c) => [c.shopifyCollectionId, c.id]));

    const upsertOps = collects
      .map((c) => {
        const productId = productMap.get(String(c.product_id));
        const collectionId = collectionMap.get(String(c.collection_id));
        if (!productId || !collectionId) return null;
        return prisma.productCollection.upsert({
          where: { productId_collectionId: { productId, collectionId } },
          update: {},
          create: { productId, collectionId },
        });
      })
      .filter((op): op is NonNullable<typeof op> => op !== null);

    if (upsertOps.length > 0) {
      await prisma.$transaction(upsertOps);
    }

    cursor = nextCursor;
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
    // First batch: validate token, fetch total count, and reset state
    if (!store.syncCursor && store.syncStatus !== 'SYNCING') {
      await validateToken(domain, accessToken);
      const productCount = await fetchProductCount(domain, accessToken);
      await prisma.store.update({
        where: { id: storeId },
        data: { syncStatus: 'SYNCING', syncDone: 0, syncTotal: productCount, syncError: null, syncCursor: null },
      });
      store.syncTotal = productCount;
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

      await upsertProductsPage(storeId, products);
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

    // All products done — sync collections and collects
    console.log(`[sync] All products synced for ${domain} (${totalDone}), syncing collections...`);
    await syncCollections(storeId, domain, accessToken);
    await syncCollects(storeId, domain, accessToken);

    await prisma.store.update({
      where: { id: storeId },
      data: { syncStatus: 'COMPLETE', syncCursor: null, lastSyncedAt: new Date() },
    });

    console.log(`[sync] Sync complete for ${domain}: ${totalDone} products, collections synced`);
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

export type { ShopifyProduct, ShopifyVariant, ShopifyCollection, ShopifyCollect };
