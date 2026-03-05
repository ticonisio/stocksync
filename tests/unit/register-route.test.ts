import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Mock bcryptjs
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
  });

  it('returns 400 for invalid data', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const req = makeRequest({ email: 'invalid', password: '123' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 409 when email already exists', async () => {
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
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe('Email já cadastrado');
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
