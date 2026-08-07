import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  storeFindFirst: vi.fn(),
  storeUpdate: vi.fn(),
  orderUpsert: vi.fn(),
  variantFindUnique: vi.fn(),
  orderItemFindFirst: vi.fn(),
  orderItemCreate: vi.fn(),
  orderItemUpdate: vi.fn(),
  calculateVelocity: vi.fn(),
  createNotifications: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/encrypt', () => ({ decrypt: vi.fn(() => 'decrypted-token') }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    store: {
      findFirst: (...args: unknown[]) => mocks.storeFindFirst(...args),
      update: (...args: unknown[]) => mocks.storeUpdate(...args),
    },
    order: { upsert: (...args: unknown[]) => mocks.orderUpsert(...args) },
    variant: {
      findUnique: (...args: unknown[]) => mocks.variantFindUnique(...args),
    },
    orderItem: {
      findFirst: (...args: unknown[]) => mocks.orderItemFindFirst(...args),
      create: (...args: unknown[]) => mocks.orderItemCreate(...args),
      update: (...args: unknown[]) => mocks.orderItemUpdate(...args),
    },
  },
}));
vi.mock('@/services/velocity/calculateVelocity', () => ({
  calculateAndSaveVelocity: (...args: unknown[]) => mocks.calculateVelocity(...args),
}));
vi.mock('@/services/notifications/notification-service', () => ({
  checkAndCreateNotifications: (...args: unknown[]) => mocks.createNotifications(...args),
}));

import { POST } from '@/app/api/orders/sync/route';
import {
  buildOrdersUrl,
  getHistoryStartDate,
} from '@/services/shopify/order-history';

describe('importação de histórico de pedidos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerSession.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.storeFindFirst.mockResolvedValue({
      id: 'store-1',
      shopifyDomain: 'example.myshopify.com',
      accessTokenEncrypted: 'encrypted-token',
      lastOrderSyncAt: new Date('2026-07-01T12:00:00.000Z'),
    });
    mocks.storeUpdate.mockResolvedValue({});
    mocks.orderUpsert.mockResolvedValue({ id: 'order-1' });
    mocks.variantFindUnique.mockResolvedValue({ id: 'variant-1' });
    mocks.orderItemFindFirst.mockResolvedValue(null);
    mocks.orderItemCreate.mockResolvedValue({ id: 'item-1' });
    mocks.orderItemUpdate.mockResolvedValue({ id: 'item-1' });
    mocks.calculateVelocity.mockResolvedValue(undefined);
    mocks.createNotifications.mockResolvedValue(2);
  });

  it('calcula corretamente o início do período histórico', () => {
    const now = new Date('2026-07-31T12:00:00.000Z');

    expect(getHistoryStartDate('30d', now)?.toISOString()).toBe(
      '2026-07-01T12:00:00.000Z'
    );
    expect(getHistoryStartDate('90d', now)?.toISOString()).toBe(
      '2026-05-02T12:00:00.000Z'
    );
    expect(getHistoryStartDate('all', now)).toBeNull();
  });

  it('ignora a última sincronização ao montar uma importação histórica', () => {
    const url = new URL(
      buildOrdersUrl({
        shopifyDomain: 'example.myshopify.com',
        pageInfo: null,
        mode: 'history',
        period: '90d',
        lastOrderSyncAt: new Date('2026-07-30T00:00:00.000Z'),
        now: new Date('2026-07-31T12:00:00.000Z'),
      })
    );

    expect(url.searchParams.get('created_at_min')).toBe('2026-05-02T12:00:00.000Z');
    expect(url.searchParams.get('status')).toBe('any');
    expect(url.searchParams.get('limit')).toBe('250');
  });

  it('usa somente cursor e limite nas páginas seguintes da Shopify', () => {
    const url = new URL(
      buildOrdersUrl({
        shopifyDomain: 'example.myshopify.com',
        pageInfo: 'next-cursor',
        mode: 'history',
        period: 'all',
        lastOrderSyncAt: null,
      })
    );

    expect(url.searchParams.get('page_info')).toBe('next-cursor');
    expect(url.searchParams.get('limit')).toBe('250');
    expect(url.searchParams.has('status')).toBe(false);
    expect(url.searchParams.has('created_at_min')).toBe(false);
  });

  it('rejeita opções de período inválidas', async () => {
    const req = new Request('http://localhost/api/orders/sync', {
      method: 'POST',
      body: JSON.stringify({ mode: 'history', period: 'invalid' }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(mocks.storeFindFirst).not.toHaveBeenCalled();
  });

  it('importa pedidos históricos e atualiza insights sem alterar estoque', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          orders: [
            {
              id: 123,
              financial_status: 'paid',
              created_at: '2026-06-10T10:00:00.000Z',
              line_items: [{ variant_id: 456, quantity: 3 }],
            },
          ],
        }),
        { status: 200 }
      )
    );

    const req = new Request('http://localhost/api/orders/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'history', period: '90d' }),
    });

    const res = await POST(req);
    const streamText = await res.text();

    expect(res.status).toBe(200);
    expect(mocks.orderUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storeId_shopifyOrderId: { storeId: 'store-1', shopifyOrderId: '123' },
        },
        create: expect.objectContaining({ status: 'PAID' }),
      })
    );
    expect(mocks.orderItemCreate).toHaveBeenCalledWith({
      data: { orderId: 'order-1', variantId: 'variant-1', quantity: 3 },
    });
    expect(mocks.calculateVelocity).toHaveBeenCalledWith(
      'store-1',
      undefined,
      expect.any(Function)
    );
    expect(mocks.createNotifications).toHaveBeenCalledWith('store-1');
    expect(mocks.storeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'store-1' },
        data: { lastOrderSyncAt: expect.any(Date) },
      })
    );
    expect(streamText).toContain('"phase":"complete"');
    expect(streamText).toContain('"notifications":2');
  });
});
