import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// ── Mocks (hoisted) ───────────────────────────────────────────────────────

const {
  mockUpdateVariant,
  mockMarkUpdated,
  mockClearUpdated,
  mockSetProducts,
  mockChannelFn,
  mockOnFn,
  mockSubscribeFn,
  mockUnsubscribeFn,
  mockToastError,
} = vi.hoisted(() => ({
  mockUpdateVariant: vi.fn(),
  mockMarkUpdated: vi.fn(),
  mockClearUpdated: vi.fn(),
  mockSetProducts: vi.fn(),
  mockChannelFn: vi.fn(),
  mockOnFn: vi.fn(),
  mockSubscribeFn: vi.fn(),
  mockUnsubscribeFn: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { channel: mockChannelFn },
}));

vi.mock('sonner', () => ({
  toast: { error: mockToastError },
}));

vi.mock('@/store/inventoryStore', () => ({
  useInventoryStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      updateVariant: mockUpdateVariant,
      markUpdated: mockMarkUpdated,
      clearUpdated: mockClearUpdated,
      setProducts: mockSetProducts,
    };
    return selector(state);
  },
}));

// ── Import after mocks ─────────────────────────────────────────────────────

import { useInventoryRealtime } from '@/hooks/useInventoryRealtime';

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useInventoryRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnsubscribeFn.mockResolvedValue(undefined);
    mockSubscribeFn.mockReturnValue({ unsubscribe: mockUnsubscribeFn });
    mockOnFn.mockReturnValue({ subscribe: mockSubscribeFn });
    mockChannelFn.mockReturnValue({ on: mockOnFn });
  });

  it('subscreve ao canal correto ao montar', () => {
    renderHook(() => useInventoryRealtime('store-1'));
    expect(mockChannelFn).toHaveBeenCalledWith('inventory:store-1');
  });

  it('registra handler de postgres_changes para UPDATE em variants', () => {
    renderHook(() => useInventoryRealtime('store-1'));
    expect(mockOnFn).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'UPDATE',
        schema: 'public',
        table: 'variants',
        filter: 'storeId=eq.store-1',
      }),
      expect.any(Function)
    );
  });

  it('chama subscribe ao montar', () => {
    renderHook(() => useInventoryRealtime('store-1'));
    expect(mockSubscribeFn).toHaveBeenCalled();
  });

  it('chama unsubscribe ao desmontar', () => {
    const { unmount } = renderHook(() => useInventoryRealtime('store-1'));
    unmount();
    expect(mockUnsubscribeFn).toHaveBeenCalled();
  });

  it('re-subscreve quando storeId muda', () => {
    const { rerender } = renderHook(({ id }) => useInventoryRealtime(id), {
      initialProps: { id: 'store-1' },
    });
    rerender({ id: 'store-2' });
    expect(mockChannelFn).toHaveBeenCalledWith('inventory:store-1');
    expect(mockChannelFn).toHaveBeenCalledWith('inventory:store-2');
  });

  it('chama updateVariant e markUpdated ao receber evento UPDATE', () => {
    renderHook(() => useInventoryRealtime('store-1'));

    // Captura o callback passado ao .on('postgres_changes', config, callback)
    const updateCallback = mockOnFn.mock.calls[0][2] as (payload: unknown) => void;

    updateCallback({
      new: { id: 'var-1', availableStock: 20, reservedStock: 5, committedStock: 3 },
    });

    expect(mockUpdateVariant).toHaveBeenCalledWith('var-1', {
      availableStock: 20,
      reservedStock: 5,
      committedStock: 3,
    });
    expect(mockMarkUpdated).toHaveBeenCalledWith('var-1');
  });
});
