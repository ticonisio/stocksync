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
const mockVariantFindMany = vi.fn();
const mockVariantUpdate = vi.fn();
const mockCalculateAndSaveVelocity = vi.fn();

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
      findMany: mockVariantFindMany,
      update: mockVariantUpdate,
    },
  },
}));

vi.mock('@/services/velocity/calculateVelocity', () => ({
  calculateAndSaveVelocity: mockCalculateAndSaveVelocity,
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
      'X-Shopify-Order-Id': '12345',
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
    mockWebhookEventCreate.mockResolvedValue({});
    mockOrderUpsert.mockResolvedValue({ id: 'order-1' });
    mockVariantFindUnique.mockResolvedValue({ id: 'variant-internal-1', availableStock: 10 });
    mockVariantFindMany.mockResolvedValue([{ id: 'variant-internal-1' }]);
    mockOrderItemFindFirst.mockResolvedValue(null);
    mockOrderItemCreate.mockResolvedValue({});
    mockVariantUpdate.mockResolvedValue({});
    mockCalculateAndSaveVelocity.mockResolvedValue(undefined);
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

  it('não chama calculateAndSaveVelocity para orders/cancelled', async () => {
    mockOrderFindUnique.mockResolvedValue({ id: 'order-1', items: [] });
    const body = makePayload(999, 1);
    const res = await callWebhook(body, 'orders/cancelled');

    expect(res.status).toBe(200);
    expect(mockCalculateAndSaveVelocity).not.toHaveBeenCalled();
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
