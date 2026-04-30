import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();
const mockRedirect = vi.fn();
const mockIsSubscriptionActive = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: {
      findUnique: mockFindUnique,
    },
  },
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

vi.mock('@/lib/subscription', () => ({
  isSubscriptionActive: mockIsSubscriptionActive,
}));

const { requireActiveSubscription } = await import('@/lib/require-subscription');

describe('requireActiveSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows stores without a subscription record to navigate', async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    await requireActiveSubscription('store-1');

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockIsSubscriptionActive).not.toHaveBeenCalled();
  });

  it('allows active subscriptions', async () => {
    const subscription = { id: 'sub-1' };
    mockFindUnique.mockResolvedValueOnce(subscription);
    mockIsSubscriptionActive.mockReturnValueOnce(true);

    await requireActiveSubscription('store-1');

    expect(mockIsSubscriptionActive).toHaveBeenCalledWith(subscription);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('redirects known inactive subscriptions to settings', async () => {
    const subscription = { id: 'sub-1' };
    mockFindUnique.mockResolvedValueOnce(subscription);
    mockIsSubscriptionActive.mockReturnValueOnce(false);

    await requireActiveSubscription('store-1');

    expect(mockRedirect).toHaveBeenCalledWith('/settings');
  });
});
