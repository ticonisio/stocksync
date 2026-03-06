import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockStoreFindFirst = vi.fn();
const mockWebhookEventFindUnique = vi.fn();
const mockWebhookEventCreate = vi.fn();
const mockOrderUpsert = vi.fn();
const mockOrderFindUnique = vi.fn();
const mockOrderUpdate = vi.fn();
const mockOrderItemFindFirst = vi.fn();
const mockOrderItemCreate = vi.fn();
const mockVariantFindUnique = vi.fn();
const mockVariantUpdate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    store: { findFirst: mockStoreFindFirst },
    webhookEvent: {
      findUnique: mockWebhookEventFindUnique,
      create: mockWebhookEventCreate,
    },
    order: {
      upsert: mockOrderUpsert,
      findUnique: mockOrderFindUnique,
      update: mockOrderUpdate,
    },
    orderItem: {
      findFirst: mockOrderItemFindFirst,
      create: mockOrderItemCreate,
    },
    variant: {
      findUnique: mockVariantFindUnique,
      update: mockVariantUpdate,
    },
  },
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = 'test-webhook-secret';

function makeHmac(body: string): string {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(Buffer.from(body)).digest('base64');
}

function makeOrderPayload(orderId = 1001, variants: Array<{ id: number; qty: number }> = []) {
  return JSON.stringify({
    id: orderId,
    line_items: variants.map((v) => ({ variant_id: v.id, quantity: v.qty })),
  });
}

async function callRoute(
  body: string,
  topic: string,
  hmac: string,
  shopDomain = 'test.myshopify.com',
  orderId = '1001'
) {
  process.env.SHOPIFY_WEBHOOK_SECRET = WEBHOOK_SECRET;

  const { POST } = await import('@/app/api/shopify/webhooks/route');
  const req = new Request('http://localhost/api/shopify/webhooks', {
    method: 'POST',
    body,
    headers: {
      'X-Shopify-Hmac-Sha256': hmac,
      'X-Shopify-Topic': topic,
      'X-Shopify-Shop-Domain': shopDomain,
      'X-Shopify-Order-Id': orderId,
    },
  });
  return POST(req);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/shopify/webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockStoreFindFirst.mockResolvedValue({ id: 'store-1', shopifyDomain: 'test.myshopify.com' });
    mockWebhookEventFindUnique.mockResolvedValue(null);
    mockWebhookEventCreate.mockResolvedValue({});
    mockOrderUpsert.mockResolvedValue({ id: 'order-1' });
    mockOrderItemFindFirst.mockResolvedValue(null);
    mockOrderItemCreate.mockResolvedValue({});
    mockVariantUpdate.mockResolvedValue({});
  });

  it('returns 401 for invalid HMAC', async () => {
    const body = makeOrderPayload();
    const res = await callRoute(body, 'orders/paid', 'invalid-hmac');
    expect(res.status).toBe(401);
  });

  it('returns 200 and skips processing for duplicate event', async () => {
    mockWebhookEventFindUnique.mockResolvedValue({ id: 'existing-event' });
    const body = makeOrderPayload();
    const res = await callRoute(body, 'orders/paid', makeHmac(body));
    expect(res.status).toBe(200);
    expect(mockOrderUpsert).not.toHaveBeenCalled();
  });

  it('decrements availableStock on orders/paid', async () => {
    mockVariantFindUnique.mockResolvedValue({ id: 'variant-1', availableStock: 10 });
    const body = makeOrderPayload(2001, [{ id: 999, qty: 3 }]);
    const res = await callRoute(body, 'orders/paid', makeHmac(body));
    expect(res.status).toBe(200);
    expect(mockVariantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { availableStock: 7 } })
    );
  });

  it('does not go below 0 on orders/paid (Math.max)', async () => {
    mockVariantFindUnique.mockResolvedValue({ id: 'variant-1', availableStock: 2 });
    const body = makeOrderPayload(3001, [{ id: 999, qty: 10 }]);
    const res = await callRoute(body, 'orders/paid', makeHmac(body));
    expect(res.status).toBe(200);
    expect(mockVariantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { availableStock: 0 } })
    );
  });

  it('increments availableStock on orders/cancelled', async () => {
    mockOrderFindUnique.mockResolvedValue({
      id: 'order-1',
      items: [{ variantId: 'variant-1', quantity: 5 }],
    });
    const body = makeOrderPayload(4001);
    const res = await callRoute(body, 'orders/cancelled', makeHmac(body));
    expect(res.status).toBe(200);
    expect(mockVariantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { availableStock: { increment: 5 } } })
    );
  });

  it('skips variant not found without throwing', async () => {
    mockVariantFindUnique.mockResolvedValue(null); // variant not in DB
    const body = makeOrderPayload(5001, [{ id: 404, qty: 2 }]);
    const res = await callRoute(body, 'orders/paid', makeHmac(body));
    expect(res.status).toBe(200);
    expect(mockVariantUpdate).not.toHaveBeenCalled();
  });
});
