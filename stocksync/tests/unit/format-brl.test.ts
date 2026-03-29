import { describe, it, expect } from 'vitest';
import { formatBRL } from '@/lib/format';

describe('formatBRL', () => {
  it('formats a positive number as BRL currency', () => {
    const result = formatBRL(1234.56);
    // Intl may use non-breaking space; normalize
    const normalized = result.replace(/\s/g, ' ');
    expect(normalized).toBe('R$ 1.234,56');
  });

  it('formats zero as R$ 0,00', () => {
    const result = formatBRL(0);
    const normalized = result.replace(/\s/g, ' ');
    expect(normalized).toBe('R$ 0,00');
  });

  it('returns "—" for null', () => {
    expect(formatBRL(null)).toBe('—');
  });

  it('returns "—" for undefined', () => {
    expect(formatBRL(undefined)).toBe('—');
  });

  it('formats small values correctly', () => {
    const result = formatBRL(0.5);
    const normalized = result.replace(/\s/g, ' ');
    expect(normalized).toBe('R$ 0,50');
  });

  it('formats large values with thousands separator', () => {
    const result = formatBRL(99999.99);
    const normalized = result.replace(/\s/g, ' ');
    expect(normalized).toBe('R$ 99.999,99');
  });
});
