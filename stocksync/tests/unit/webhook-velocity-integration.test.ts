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

// ── Helpers ────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = 'test-secret';

function makeHmac(body: string): string {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(Buffer.from(body)).digest('base64');
}

async function callWebhook(body: string, topic: string) {
  process.env.SHOPIFY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  vi.resetModules();
  const { POST } = await import('@/app/api/shopify/webhooks/route');
  const req = new Request('http://localhost/api/shopify/webhooks', {
    method: 'POST',
    body,
    headers: {
      'X-Shopify-Hmac-Sha256': makeHmac(body),
      'X-Shopify-Topic': topic,
      'X-Shopify-Shop-Domain': 'test.myshopify.com',
      'X-Shopify-Webhook-Id': `delivery-${topic}`,
    },
  });
  return POST(req);
}

function makePayload(variantId: number, qty: number) {
  return JSON.stringify({ id: 12345, line_items: [{ variant_id: variantId, quantity: qty }] });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Webhook orders/paid — velocity integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreFindFirst.mockResolvedValue({ id: 'store-1', shopifyDomain: 'test.myshopify.com' });
    mockWebhookEventFindUnique.mockResolvedValue(null);
    mockWebhookEventCreate.mockResolvedValue({ id: 'event-1' });
    mockWebhookEventDelete.mockResolvedValue({});
    mockOrderFindUnique.mockResolvedValue(null);
    mockOrderCreate.mockResolvedValue({ id: 'order-1' });
    mockOrderUpdateMany.mockResolvedValue({ count: 1 });
    mockVariantFindUnique.mockResolvedValue({ id: 'variant-internal-1', availableStock: 10 });
    mockVariantFindMany.mockResolvedValue([{ id: 'variant-internal-1' }]);
    mockOrderItemFindFirst.mockResolvedValue(null);
    mockOrderItemCreate.mockResolvedValue({});
    mockVariantUpdate.mockResolvedValue({});
    mockExecuteRaw.mockResolvedValue(1);
    mockCalculateAndSaveVelocity.mockResolvedValue(undefined);
    mockCheckAndCreateNotifications.mockResolvedValue(0);
  });

  it('chama calculateAndSaveVelocity com variantIds internos corretos após orders/paid', async () => {
    const body = makePayload(999, 3);
    const res = await callWebhook(body, 'orders/paid');

    expect(res.status).toBe(200);
    expect(mockVariantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: 'store-1',
          shopifyVariantId: { in: ['999'] },
        }),
      })
    );
    expect(mockCalculateAndSaveVelocity).toHaveBeenCalledWith('store-1', ['variant-internal-1']);
  });

  it('recalcula velocity para orders/cancelled porque a venda deixa de contar', async () => {
    mockOrderFindUnique.mockResolvedValue({ id: 'order-1', status: 'PAID', items: [] });
    const body = makePayload(999, 1);
    const res = await callWebhook(body, 'orders/cancelled');

    expect(res.status).toBe(200);
    expect(mockCalculateAndSaveVelocity).toHaveBeenCalledWith(
      'store-1',
      ['variant-internal-1']
    );
  });

  it('falha no calculateAndSaveVelocity não retorna 500 — webhook retorna ok', async () => {
    mockCalculateAndSaveVelocity.mockRejectedValueOnce(new Error('DB error'));
    const body = makePayload(999, 1);
    const res = await callWebhook(body, 'orders/paid');

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('não chama calculateAndSaveVelocity quando nenhuma variante interna é encontrada', async () => {
    mockVariantFindMany.mockResolvedValueOnce([]); // shopifyVariantId não mapeado
    const body = makePayload(999, 1);
    await callWebhook(body, 'orders/paid');

    expect(mockCalculateAndSaveVelocity).not.toHaveBeenCalled();
  });
});
