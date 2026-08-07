const SHOPIFY_API_VERSION = '2026-01';
const PAGE_SIZE = 250;

export type OrderSyncMode = 'incremental' | 'history';
export type OrderHistoryPeriod = '30d' | '90d' | '365d' | 'all';

export function getHistoryStartDate(
  period: OrderHistoryPeriod,
  now = new Date()
): Date | null {
  if (period === 'all') return null;

  const days = Number.parseInt(period, 10);
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function buildOrdersUrl({
  shopifyDomain,
  pageInfo,
  mode,
  period,
  lastOrderSyncAt,
  now,
}: {
  shopifyDomain: string;
  pageInfo: string | null;
  mode: OrderSyncMode;
  period: OrderHistoryPeriod;
  lastOrderSyncAt: Date | null;
  now?: Date;
}): string {
  const url = new URL(
    `https://${shopifyDomain}/admin/api/${SHOPIFY_API_VERSION}/orders.json`
  );
  url.searchParams.set('limit', String(PAGE_SIZE));

  // Shopify cursor requests must only include the page cursor and limit.
  if (pageInfo) {
    url.searchParams.set('page_info', pageInfo);
    return url.toString();
  }

  url.searchParams.set('status', 'any');
  const createdAtMin =
    mode === 'history' ? getHistoryStartDate(period, now) : lastOrderSyncAt;
  if (createdAtMin) {
    url.searchParams.set('created_at_min', createdAtMin.toISOString());
  }

  return url.toString();
}
