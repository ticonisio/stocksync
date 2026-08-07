import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  storeFindMany: vi.fn(),
  calculateVelocity: vi.fn(),
  createNotifications: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { store: { findMany: mocks.storeFindMany } },
}));
vi.mock('@/services/velocity/calculateVelocity', () => ({
  calculateAndSaveVelocity: mocks.calculateVelocity,
}));
vi.mock('@/services/notifications/notification-service', () => ({
  checkAndCreateNotifications: mocks.createNotifications,
}));

import { GET } from '@/app/api/cron/velocity/route';

function request(authorization?: string) {
  return new Request('http://localhost/api/cron/velocity', {
    headers: authorization ? { authorization } : undefined,
  });
}

describe('GET /api/cron/velocity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
    mocks.storeFindMany.mockResolvedValue([]);
    mocks.calculateVelocity.mockResolvedValue(undefined);
    mocks.createNotifications.mockResolvedValue(0);
  });

  it('returns 503 instead of accepting an empty secret', async () => {
    const response = await GET(request('Bearer '));

    expect(response.status).toBe(503);
    expect(mocks.storeFindMany).not.toHaveBeenCalled();
  });

  it('returns 401 for an invalid configured secret', async () => {
    process.env.CRON_SECRET = 'correct-secret';

    const response = await GET(request('Bearer wrong-secret'));

    expect(response.status).toBe(401);
  });

  it('processes stores when the configured secret matches', async () => {
    process.env.CRON_SECRET = 'correct-secret';
    mocks.storeFindMany.mockResolvedValue([{ id: 'store-1', shopifyDomain: 'shop.test' }]);
    mocks.createNotifications.mockResolvedValue(2);

    const response = await GET(request('Bearer correct-secret'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      processed: 1,
      succeeded: 1,
      failed: 0,
      notifications: 2,
    });
    expect(mocks.calculateVelocity).toHaveBeenCalledWith('store-1');
  });
});
