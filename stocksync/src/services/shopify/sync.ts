import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encrypt';
import type { ShopifyProduct, ShopifyVariant, ShopifyCollection, ShopifyCollect } from '@/types/shopify';

const SHOPIFY_API_VERSION = '2026-01';
const PAGE_SIZE = 250;
const REQUEST_DELAY_MS = 500;
const MAX_RETRIES = 3;
const MAX_PAGES = 100; // Safety: max 25,000 products (100 * 250)

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, token: string, attempt = 0): Promise<Response> {
  const res = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': token },
    signal: AbortSignal.timeout(15000),
  });

  if (res.status === 429 && attempt < MAX_RETRIES) {
    const retryAfterSec = parseInt(res.headers.get('Retry-After') ?? '2', 10);
    const waitMs = (retryAfterSec + attempt) * 1000 * Math.pow(2, attempt);
    await delay(waitMs);
    return fetchWithRetry(url, token, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`Shopify API error: ${res.status} ${url}`);
  }

  return res;
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
  // Batch upserts in a single transaction for performance
  await prisma.$transaction(
    products.map((p) =>
      prisma.product.upsert({
        where: { storeId_shopifyProductId: { storeId, shopifyProductId: String(p.id) } },
        update: { title: p.title, handle: p.handle },
        create: { storeId, shopifyProductId: String(p.id), title: p.title, handle: p.handle },
      })
    )
  );

  // Fetch all products from this page to get their IDs for variant association
  const productRecords = await prisma.product.findMany({
    where: {
      storeId,
      shopifyProductId: { in: products.map((p) => String(p.id)) },
    },
    select: { id: true, shopifyProductId: true },
  });
  const productIdMap = new Map(productRecords.map((r) => [r.shopifyProductId, r.id]));

  // Batch all variant upserts in a single transaction
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

  // Process variants in chunks of 50 to avoid transaction size limits
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

  // Batch all collection upserts in a single transaction
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

    // Pre-fetch all products and collections for this batch to avoid N+1 queries
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

export async function syncStore(storeId: string): Promise<void> {
  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
  const accessToken = decrypt(store.accessTokenEncrypted);
  const domain = store.shopifyDomain;

  try {
    await prisma.store.update({
      where: { id: storeId },
      data: { syncStatus: 'SYNCING', syncDone: 0, syncTotal: null },
    });

    let cursor: string | undefined;
    let totalUpserted = 0;
    let page = 0;

    do {
      const { products, nextCursor } = await fetchProductsPage(domain, accessToken, cursor);

      if (products.length === 0) break;

      await upsertProductsPage(storeId, products);
      totalUpserted += products.length;
      await prisma.store.update({ where: { id: storeId }, data: { syncDone: totalUpserted } });
      cursor = nextCursor;
      page++;
      if (cursor) await delay(REQUEST_DELAY_MS);
    } while (cursor && page < MAX_PAGES);

    await syncCollections(storeId, domain, accessToken);
    await syncCollects(storeId, domain, accessToken);

    await prisma.store.update({
      where: { id: storeId },
      data: { syncStatus: 'COMPLETE', lastSyncedAt: new Date() },
    });
  } catch (err) {
    await prisma.store.update({
      where: { id: storeId },
      data: { syncStatus: 'ERROR' },
    }).catch(() => {
      // If even this fails (DB down), there's nothing more we can do
    });
    throw err;
  }
}

export type { ShopifyProduct, ShopifyVariant, ShopifyCollection, ShopifyCollect };
