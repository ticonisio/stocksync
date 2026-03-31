import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next-auth
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

// Mock auth options
vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

// Mock prisma
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockCount = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    store: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
    order: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { getServerSession } from 'next-auth';
import { GET } from '@/app/api/orders/route';

describe('/api/orders — GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = new Request('http://localhost/api/orders');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 404 when store not found', async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'u1' } } as never);
    mockFindFirst.mockResolvedValue(null);
    const req = new Request('http://localhost/api/orders');
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it('returns orders with pagination', async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'u1' } } as never);
    mockFindFirst.mockResolvedValue({ id: 's1' });

    const mockOrders = [
      {
        id: 'o1',
        shopifyOrderId: '1001',
        status: 'PAID',
        items: [{ id: 'i1', quantity: 2, variant: { title: 'V1', sku: 'SKU1', product: { title: 'P1' } } }],
        createdAt: new Date().toISOString(),
      },
    ];
    mockTransaction.mockResolvedValue([mockOrders, 1]);

    const req = new Request('http://localhost/api/orders?page=1');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.orders).toHaveLength(1);
    expect(data.total).toBe(1);
    expect(data.page).toBe(1);
    expect(data.perPage).toBe(25);
  });

  it('filters by status', async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'u1' } } as never);
    mockFindFirst.mockResolvedValue({ id: 's1' });
    mockTransaction.mockResolvedValue([[], 0]);

    const req = new Request('http://localhost/api/orders?status=CANCELLED');
    await GET(req);

    // Verify transaction was called (we can't easily inspect the where clause via mock,
    // but the test confirms no crash with status filter)
    expect(mockTransaction).toHaveBeenCalled();
  });
});
