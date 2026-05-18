import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockCheckRateLimit = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/ratelimit', () => ({
  checkRateLimit: mockCheckRateLimit,
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed_password'),
    compare: vi.fn(),
  },
}));

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
  });

  it('returns 400 for invalid data', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const req = makeRequest({ email: 'invalid', password: '123' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate limit blocks registration', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { POST } = await import('@/app/api/auth/register/route');
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });

    const req = makeRequest({
      name: 'User',
      email: 'user@example.com',
      password: 'password123',
    });
    const res = await POST(req);

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns 200 with a generic message when email already exists', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { POST } = await import('@/app/api/auth/register/route');

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: '1',
      email: 'existing@example.com',
    } as never);

    const req = makeRequest({
      name: 'User',
      email: 'existing@example.com',
      password: 'password123',
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toContain('conta foi criada');
  });

  it('returns 201 with user data (no passwordHash) on success', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { POST } = await import('@/app/api/auth/register/route');

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.create).mockResolvedValueOnce({
      id: 'new-user-id',
      name: 'New User',
      email: 'new@example.com',
      passwordHash: 'hashed_password',
    } as never);

    const req = makeRequest({
      name: 'New User',
      email: 'new@example.com',
      password: 'password123',
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.id).toBe('new-user-id');
    expect(data.email).toBe('new@example.com');
    expect(data.passwordHash).toBeUndefined();
  });
});
