import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGetServerSession = vi.fn();
const mockUpsert = vi.fn();
const mockEncrypt = vi.fn((text: string) => `encrypted:${text}`);

vi.mock('next-auth', () => ({ getServerSession: mockGetServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({
  prisma: { store: { upsert: mockUpsert } },
}));
vi.mock('@/lib/encrypt', () => ({ encrypt: mockEncrypt }));

// ── Helper ─────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/shopify/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/shopify/connect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 401 quando não autenticado', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/shopify/connect/route');

    const res = await POST(makeRequest({ shopifyDomain: 'test.myshopify.com', accessToken: 'tok' }));
    expect(res.status).toBe(401);
  });

  it('retorna 400 para body inválido', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    const { POST } = await import('@/app/api/shopify/connect/route');

    const res = await POST(makeRequest({ shopifyDomain: '' }));
    expect(res.status).toBe(400);
  });

  it('retorna 400 quando token Shopify é inválido (401 da Shopify)', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 })
    );
    const { POST } = await import('@/app/api/shopify/connect/route');

    const res = await POST(makeRequest({ shopifyDomain: 'test.myshopify.com', accessToken: 'bad-token' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Token ou domínio inválido');
  });

  it('retorna 400 quando domínio não existe (erro de rede)', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('fetch failed'));
    const { POST } = await import('@/app/api/shopify/connect/route');

    const res = await POST(makeRequest({ shopifyDomain: 'naoexiste.myshopify.com', accessToken: 'any' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Não foi possível conectar');
  });

  it('cria store e retorna 200 com token válido', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ shop: { id: 123, name: 'Test Store' } }), { status: 200 })
    );
    mockUpsert.mockResolvedValueOnce({
      id: 'store-id',
      shopifyDomain: 'test.myshopify.com',
      syncStatus: 'PENDING',
    });
    const { POST } = await import('@/app/api/shopify/connect/route');

    const res = await POST(makeRequest({ shopifyDomain: 'test.myshopify.com', accessToken: 'valid-token' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.store.shopifyDomain).toBe('test.myshopify.com');
    expect(json.store.syncStatus).toBe('PENDING');
    // token nunca deve aparecer na resposta
    expect(JSON.stringify(json)).not.toContain('valid-token');
  });

  it('normaliza domínio removendo https:// e trailing slash', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'user-1' } });
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ shop: {} }), { status: 200 })
    );
    mockUpsert.mockResolvedValueOnce({
      id: 'store-id',
      shopifyDomain: 'test.myshopify.com',
      syncStatus: 'PENDING',
    });
    const { POST } = await import('@/app/api/shopify/connect/route');

    await POST(makeRequest({ shopifyDomain: 'https://test.myshopify.com/', accessToken: 'tok' }));

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_shopifyDomain: { userId: 'user-1', shopifyDomain: 'test.myshopify.com' } },
      })
    );
  });
});
