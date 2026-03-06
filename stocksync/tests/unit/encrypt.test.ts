import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const VALID_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

describe('encrypt / decrypt', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = VALID_KEY;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
    vi.resetModules();
  });

  it('roundtrip: decrypt(encrypt(text)) === text', async () => {
    const { encrypt, decrypt } = await import('@/lib/encrypt');
    const plaintext = 'shpat_test_access_token_12345';
    const ciphertext = encrypt(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it('produces distinct ciphertexts for the same plaintext (random IV)', async () => {
    const { encrypt } = await import('@/lib/encrypt');
    const plaintext = 'same-token';
    const c1 = encrypt(plaintext);
    const c2 = encrypt(plaintext);
    expect(c1).not.toBe(c2);
  });

  it('ciphertext format is iv:authTag:ciphertext (3 hex parts)', async () => {
    const { encrypt } = await import('@/lib/encrypt');
    const parts = encrypt('test').split(':');
    expect(parts).toHaveLength(3);
    // IV = 12 bytes = 24 hex chars
    expect(parts[0]).toHaveLength(24);
    // authTag = 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32);
  });

  it('throws when ENCRYPTION_KEY is missing', async () => {
    delete process.env.ENCRYPTION_KEY;
    vi.resetModules();
    const { encrypt } = await import('@/lib/encrypt');
    expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY env var is required');
  });

  it('throws when ENCRYPTION_KEY has wrong length', async () => {
    process.env.ENCRYPTION_KEY = 'tooshort';
    vi.resetModules();
    const { encrypt } = await import('@/lib/encrypt');
    expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY must be 32 bytes');
  });
});
