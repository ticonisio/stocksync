import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/velocity/recalculate/route';

// ── Mocks (hoisted) ────────────────────────────────────────────────────────

const {
  mockGetServerSession,
  mockStoreFindFirst,
  mockCalculateAndSaveVelocity,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockStoreFindFirst: vi.fn(),
  mockCalculateAndSaveVelocity: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    store: { findFirst: mockStoreFindFirst },
  },
}));
vi.mock('@/services/velocity/calculateVelocity', () => ({
  calculateAndSaveVelocity: mockCalculateAndSaveVelocity,
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(): Request {
  return new Request('http://localhost/api/velocity/recalculate', { method: 'POST' });
}

const fakeStore = { id: 'store-1', userId: 'user-1' };

// ── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/velocity/recalculate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCalculateAndSaveVelocity.mockResolvedValue(undefined);
  });

  it('retorna 401 quando não autenticado', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await POST();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('retorna 404 quando store não encontrada', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(null);
    const res = await POST();
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Store not found');
  });

  it('retorna 200 e chama calculateAndSaveVelocity com storeId', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);

    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    expect(mockCalculateAndSaveVelocity).toHaveBeenCalledWith('store-1');
    expect(mockCalculateAndSaveVelocity).toHaveBeenCalledTimes(1);
  });

  it('não passa variantIds — recálculo total da store', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    mockStoreFindFirst.mockResolvedValueOnce(fakeStore);

    await POST();

    // deve ser chamado com apenas 1 argumento (storeId), sem variantIds
    const [call] = mockCalculateAndSaveVelocity.mock.calls;
    expect(call).toHaveLength(1);
    expect(call[0]).toBe('store-1');
  });
});
