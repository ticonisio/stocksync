import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockStoreFindFirst = vi.fn();
const mockWebhookEventFindUnique = vi.fn();
const mockWebhookEventCreate = vi.fn();
const mockWebhookEventDelete = vi.fn();
const mockOrderFindUnique = vi.fn();
const mockOrderCreate = vi.fn();
const mockOrderUpdate = vi.fn();
const mockOrderUpdateMany = vi.fn();
const mockOrderItemFindFirst = vi.fn();
const mockOrderItemCreate = vi.fn();
const mockVariantFindUnique = vi.fn();
const mockVariantFindMany = vi.fn();
const mockVariantUpdate = vi.fn();
const mockExecuteRaw = vi.fn();
const mockCalculateAndSaveVelocity = vi.fn();
const mockCheckAndCreateNotifications = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: (() => {
    const transactionClient = {
      order: {
        findUnique: mockOrderFindUnique,
        create: mockOrderCreate,
        update: mockOrderUpdate,
        updateMany: mockOrderUpdateMany,
      },
      orderItem: {
        findFirst: mockOrderItemFindFirst,
        create: mockOrderItemCreate,
      },
      variant: {
        findUnique: mockVariantFindUnique,
        findMany: mockVariantFindMany,
        update: mockVariantUpdate,
      },
      $executeRaw: mockExecuteRaw,
    };

    return {
    store: { findFirst: mockStoreFindFirst },
    webhookEvent: {
      findUnique: mockWebhookEventFindUnique,
      create: mockWebhookEventCreate,
      delete: mockWebhookEventDelete,
    },
      ...transactionClient,
      $transaction: (callback: (tx: typeof transactionClient) => unknown) =>
        callback(transactionClient),
    };
  })(),
}));

vi.mock('@/services/velocity/calculateVelocity', () => ({
  calculateAndSaveVelocity: mockCalculateAndSaveVelocity,
}));

vi.mock('@/services/notifications/notification-service', () => ({
  checkAndCreateNotifications: mockCheckAndCreateNotifications,
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
  webhookId: string | null = 'delivery-1'
) {
  process.env.SHOPIFY_WEBHOOK_SECRET = WEBHOOK_SECRET;

  const { POST } = await import('@/app/api/shopify/webhooks/route');
  const headers: Record<string, string> = {
    'X-Shopify-Hmac-Sha256': hmac,
    'X-Shopify-Topic': topic,
    'X-Shopify-Shop-Domain': shopDomain,
  };
  if (webhookId) headers['X-Shopify-Webhook-Id'] = webhookId;

  const req = new Request('http://localhost/api/shopify/webhooks', {
    method: 'POST',
    body,
    headers,
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
    mockWebhookEventCreate.mockResolvedValue({ id: 'event-1' });
    mockWebhookEventDelete.mockResolvedValue({});
    mockOrderFindUnique.mockResolvedValue(null);
    mockOrderCreate.mockResolvedValue({ id: 'order-1' });
    mockOrderUpdateMany.mockResolvedValue({ count: 1 });
    mockOrderItemFindFirst.mockResolvedValue(null);
    mockOrderItemCreate.mockResolvedValue({});
    mockVariantFindMany.mockResolvedValue([]);
    mockVariantUpdate.mockResolvedValue({});
    mockExecuteRaw.mockResolvedValue(1);
    mockCalculateAndSaveVelocity.mockResolvedValue(undefined);
    mockCheckAndCreateNotifications.mockResolvedValue(0);
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
    expect(mockOrderCreate).not.toHaveBeenCalled();
  });

  it('returns 400 when Shopify delivery ID is missing', async () => {
    const body = makeOrderPayload();
    const res = await callRoute(body, 'orders/paid', makeHmac(body), undefined, null);
    expect(res.status).toBe(400);
    expect(mockWebhookEventCreate).not.toHaveBeenCalled();
  });

  it('returns 400 for signed invalid JSON', async () => {
    const body = '{invalid';
    const res = await callRoute(body, 'orders/paid', makeHmac(body));
    expect(res.status).toBe(400);
  });

  it('uses X-Shopify-Webhook-Id as the idempotency key', async () => {
    const body = makeOrderPayload(9876);
    await callRoute(body, 'orders/paid', makeHmac(body), undefined, 'delivery-9876');

    expect(mockWebhookEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ shopifyOrderId: 'delivery-9876' }),
      })
    );
  });

  it('decrements availableStock on orders/paid', async () => {
    mockVariantFindUnique.mockResolvedValue({ id: 'variant-1', availableStock: 10 });
    const body = makeOrderPayload(2001, [{ id: 999, qty: 3 }]);
    const res = await callRoute(body, 'orders/paid', makeHmac(body));
    expect(res.status).toBe(200);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw.mock.calls[0][1]).toBe(3);
    expect(mockExecuteRaw.mock.calls[0][2]).toBe('variant-1');
  });

  it('uses an atomic clamp so paid orders cannot make stock negative', async () => {
    mockVariantFindUnique.mockResolvedValue({ id: 'variant-1', availableStock: 2 });
    const body = makeOrderPayload(3001, [{ id: 999, qty: 10 }]);
    const res = await callRoute(body, 'orders/paid', makeHmac(body));
    expect(res.status).toBe(200);
    const sql = Array.from(mockExecuteRaw.mock.calls[0][0] as TemplateStringsArray).join('?');
    expect(sql).toContain('GREATEST(0, "availableStock" - ?');
  });

  it('increments availableStock on orders/cancelled', async () => {
    mockOrderFindUnique.mockResolvedValue({
      id: 'order-1',
      status: 'PAID',
      items: [{ variantId: 'variant-1', quantity: 5 }],
    });
    const body = makeOrderPayload(4001);
    const res = await callRoute(body, 'orders/cancelled', makeHmac(body));
    expect(res.status).toBe(200);
    expect(mockVariantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { availableStock: { increment: 5 } } })
    );
  });

  it('does not restore stock twice for an already cancelled order', async () => {
    mockOrderFindUnique.mockResolvedValue({
      id: 'order-1',
      status: 'CANCELLED',
      items: [{ variantId: 'variant-1', quantity: 5 }],
    });
    const body = makeOrderPayload(4001);
    const res = await callRoute(body, 'orders/refunded', makeHmac(body));

    expect(res.status).toBe(200);
    expect(mockVariantUpdate).not.toHaveBeenCalled();
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it('skips variant not found without throwing', async () => {
    mockVariantFindUnique.mockResolvedValue(null); // variant not in DB
    const body = makeOrderPayload(5001, [{ id: 404, qty: 2 }]);
    const res = await callRoute(body, 'orders/paid', makeHmac(body));
    expect(res.status).toBe(200);
    expect(mockVariantUpdate).not.toHaveBeenCalled();
  });

  it('releases the delivery lock when inventory processing fails', async () => {
    mockOrderCreate.mockRejectedValueOnce(new Error('DB unavailable'));
    const body = makeOrderPayload(6001);
    const res = await callRoute(body, 'orders/paid', makeHmac(body));

    expect(res.status).toBe(500);
    expect(mockWebhookEventDelete).toHaveBeenCalledWith({ where: { id: 'event-1' } });
  });
});
