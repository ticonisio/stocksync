import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();
const mockCompare = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
    },
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
    compare: mockCompare,
  },
}));

const { authOptions } = await import('@/lib/auth');

// In NextAuth v4, CredentialsProvider stores the real authorize in options.authorize
// The top-level authorize is just a () => null default
type AuthorizeCredentials = { email: string; password: string };
type ProviderWithOptions = {
  options: {
    authorize: (credentials: AuthorizeCredentials | undefined, req: unknown) => Promise<unknown>;
  };
};
const provider = authOptions.providers[0] as unknown as ProviderWithOptions;
const authorize = provider.options.authorize;

describe('NextAuth authOptions providers', () => {
  it('includes Google provider', () => {
    const googleProvider = authOptions.providers.find(
      (p) => (p as any).id === 'google'
    );
    expect(googleProvider).toBeDefined();
  });

  it('has newUser page configured', () => {
    expect(authOptions.pages?.newUser).toBe('/onboarding/connect-shopify');
  });
});

describe('NextAuth Credentials authorize()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when credentials are missing', async () => {
    const result = await authorize({ email: '', password: '' }, {});
    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('returns null when user is not found', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const result = await authorize(
      { email: 'notfound@example.com', password: 'password123' },
      {}
    );
    expect(result).toBeNull();
  });

  it('returns null when user has no passwordHash (OAuth user)', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: '1',
      email: 'user@example.com',
      name: 'User',
      passwordHash: null,
    });
    const result = await authorize(
      { email: 'user@example.com', password: 'password123' },
      {}
    );
    expect(result).toBeNull();
  });

  it('returns null when password is invalid', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: '1',
      email: 'user@example.com',
      name: 'User',
      passwordHash: '$2b$12$somehash',
    });
    mockCompare.mockResolvedValueOnce(false);
    const result = await authorize(
      { email: 'user@example.com', password: 'wrongpassword' },
      {}
    );
    expect(result).toBeNull();
  });

  it('returns user object when credentials are valid', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 'user-id-123',
      email: 'user@example.com',
      name: 'Test User',
      passwordHash: '$2b$12$somehash',
    });
    mockCompare.mockResolvedValueOnce(true);

    const result = await authorize(
      { email: 'user@example.com', password: 'correctpassword' },
      {}
    );

    expect(result).toEqual({
      id: 'user-id-123',
      email: 'user@example.com',
      name: 'Test User',
    });
  });
});
