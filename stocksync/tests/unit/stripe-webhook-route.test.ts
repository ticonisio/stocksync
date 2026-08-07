import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getStripe: vi.fn(),
  constructEvent: vi.fn(),
  retrieveSubscription: vi.fn(),
  subscriptionUpsert: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  getStripe: mocks.getStripe,
  getPlanFromPriceId: vi.fn(() => 'PRO'),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: { subscription: { upsert: mocks.subscriptionUpsert } },
}));

import { POST } from '@/app/api/stripe/webhook/route';

function request() {
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    body: '{}',
    headers: { 'stripe-signature': 'valid-signature' },
  });
}

describe('POST /api/stripe/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.STRIPE_WEBHOOK_SECRET;
    mocks.getStripe.mockReturnValue({
      webhooks: { constructEvent: mocks.constructEvent },
      subscriptions: { retrieve: mocks.retrieveSubscription },
    });
  });

  it('returns 503 when the webhook secret is missing', async () => {
    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.getStripe).not.toHaveBeenCalled();
  });

  it('returns 500 so Stripe retries a transient processing failure', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'webhook-secret';
    mocks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { mode: 'subscription', subscription: 'sub-1' } },
    });
    mocks.retrieveSubscription.mockRejectedValue(new Error('Database unavailable'));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Webhook processing failed' });
  });

  it('acknowledges a successfully processed event', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'webhook-secret';
    mocks.constructEvent.mockReturnValue({
      type: 'customer.created',
      data: { object: {} },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });

  it('replaces the Stripe subscription ID for an existing store subscription', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'webhook-secret';
    mocks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { mode: 'subscription', subscription: 'sub-new' } },
    });
    mocks.retrieveSubscription.mockResolvedValue({
      id: 'sub-new',
      metadata: { storeId: 'store-1' },
      status: 'active',
      cancel_at_period_end: false,
      items: {
        data: [
          {
            price: { id: 'price-pro' },
            current_period_end: 1_800_000_000,
          },
        ],
      },
    });
    mocks.subscriptionUpsert.mockResolvedValue({});

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.subscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId: 'store-1' },
        update: expect.objectContaining({ stripeSubscriptionId: 'sub-new' }),
      })
    );
  });
});
