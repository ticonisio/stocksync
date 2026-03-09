import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '@/hooks/useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna o valor inicial imediatamente', () => {
    const { result } = renderHook(() => useDebounce('inicial', 300));
    expect(result.current).toBe('inicial');
  });

  it('não atualiza antes do delay expirar', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'inicial' } }
    );

    rerender({ value: 'atualizado' });
    vi.advanceTimersByTime(299);
    expect(result.current).toBe('inicial');
  });

  it('atualiza após o delay expirar', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'inicial' } }
    );

    rerender({ value: 'atualizado' });
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe('atualizado');
  });

  it('cancela timer anterior ao receber novo valor', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'a' } }
    );

    rerender({ value: 'b' });
    vi.advanceTimersByTime(200);
    rerender({ value: 'c' });
    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current).toBe('c');
  });

  it('funciona com tipos genéricos (number)', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 100),
      { initialProps: { value: 1 } }
    );

    rerender({ value: 42 });
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe(42);
  });
});
