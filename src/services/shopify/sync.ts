import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encrypt';
import type { ShopifyProduct, ShopifyVariant, ShopifyCollection, ShopifyCollect } from '@/types/shopify';

const SHOPIFY_API_VERSION = '2024-01';
const PAGE_SIZE = 250;
const REQUEST_DELAY_MS = 500;
const MAX_RETRIES = 3;

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

  return { products: data.products, nextCursor };
}

async function upsertProductsPage(storeId: string, products: ShopifyProduct[]): Promise<void> {
  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { storeId_shopifyProductId: { storeId, shopifyProductId: String(p.id) } },
      update: { title: p.title, handle: p.handle },
      create: { storeId, shopifyProductId: String(p.id), title: p.title, handle: p.handle },
    });

    for (const v of p.variants) {
      await prisma.variant.upsert({
        where: { storeId_shopifyVariantId: { storeId, shopifyVariantId: String(v.id) } },
        update: {
          title: v.title,
          sku: v.sku ?? null,
          availableStock: v.inventory_quantity,
        },
        create: {
          storeId,
          productId: product.id,
          shopifyVariantId: String(v.id),
          title: v.title,
          sku: v.sku ?? null,
          availableStock: v.inventory_quantity,
        },
      });
    }
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

  for (const c of collections) {
    await prisma.collection.upsert({
      where: { storeId_shopifyCollectionId: { storeId, shopifyCollectionId: String(c.id) } },
      update: { title: c.title, handle: c.handle },
      create: {
        storeId,
        shopifyCollectionId: String(c.id),
        title: c.title,
        handle: c.handle,
      },
    });
  }
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

  return { collects: data.collects, nextCursor };
}

async function syncCollects(storeId: string, domain: string, token: string): Promise<void> {
  let cursor: string | undefined;

  do {
    const { collects, nextCursor } = await fetchCollectsPage(domain, token, cursor);

    for (const c of collects) {
      const product = await prisma.product.findUnique({
        where: {
          storeId_shopifyProductId: { storeId, shopifyProductId: String(c.product_id) },
        },
        select: { id: true },
      });
      const collection = await prisma.collection.findUnique({
        where: {
          storeId_shopifyCollectionId: {
            storeId,
            shopifyCollectionId: String(c.collection_id),
          },
        },
        select: { id: true },
      });

      if (!product || !collection) continue;

      await prisma.productCollection.upsert({
        where: {
          productId_collectionId: {
            productId: product.id,
            collectionId: collection.id,
          },
        },
        update: {},
        create: { productId: product.id, collectionId: collection.id },
      });
    }

    cursor = nextCursor;
    if (cursor) await delay(REQUEST_DELAY_MS);
  } while (cursor);
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

    do {
      const { products, nextCursor } = await fetchProductsPage(domain, accessToken, cursor);
      await upsertProductsPage(storeId, products);
      totalUpserted += products.length;
      await prisma.store.update({ where: { id: storeId }, data: { syncDone: totalUpserted } });
      cursor = nextCursor;
      if (cursor) await delay(REQUEST_DELAY_MS);
    } while (cursor);

    await syncCollections(storeId, domain, accessToken);
    await syncCollects(storeId, domain, accessToken);

    await prisma.store.update({
      where: { id: storeId },
      data: { syncStatus: 'COMPLETE', lastSyncedAt: new Date() },
    });
  } catch (err) {
    await prisma.store.update({ where: { id: storeId }, data: { syncStatus: 'ERROR' } });
    throw err;
  }
}

export type { ShopifyProduct, ShopifyVariant, ShopifyCollection, ShopifyCollect };
