import { describe, it, expect, beforeEach } from 'vitest';
import { useInventoryStore, type ProductWithRollup } from '@/store/inventoryStore';

// ── Fixtures ──────────────────────────────────────────────────────────────

const fakeProducts: ProductWithRollup[] = [
  {
    id: 'prod-1',
    title: 'Produto A',
    variants: [
      { id: 'var-1', title: 'P', sku: 'SKU-P', availableStock: 10, reservedStock: 2, committedStock: 1 },
      { id: 'var-2', title: 'M', sku: 'SKU-M', availableStock: 5, reservedStock: 0, committedStock: 3 },
    ],
    availableRollup: 15,
    reservedRollup: 2,
    committedRollup: 4,
  },
  {
    id: 'prod-2',
    title: 'Produto B',
    variants: [
      { id: 'var-3', title: 'Único', sku: null, availableStock: 0, reservedStock: 0, committedStock: 0 },
    ],
    availableRollup: 0,
    reservedRollup: 0,
    committedRollup: 0,
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────

describe('useInventoryStore', () => {
  beforeEach(() => {
    useInventoryStore.setState({ products: [], total: 0, updatedVariantIds: new Set() });
  });

  it('setProducts armazena produtos e total', () => {
    useInventoryStore.getState().setProducts(fakeProducts, 42);
    expect(useInventoryStore.getState().products).toHaveLength(2);
    expect(useInventoryStore.getState().total).toBe(42);
  });

  it('updateVariant atualiza campos da variante e recalcula rollup', () => {
    useInventoryStore.getState().setProducts(fakeProducts, 2);
    useInventoryStore.getState().updateVariant('var-1', { availableStock: 20 });

    const product = useInventoryStore.getState().products[0];
    expect(product.variants[0].availableStock).toBe(20);
    expect(product.availableRollup).toBe(25); // 20 + 5
  });

  it('updateVariant recalcula reservedRollup e committedRollup', () => {
    useInventoryStore.getState().setProducts(fakeProducts, 2);
    useInventoryStore.getState().updateVariant('var-2', { reservedStock: 8, committedStock: 2 });

    const product = useInventoryStore.getState().products[0];
    expect(product.reservedRollup).toBe(10); // 2 + 8
    expect(product.committedRollup).toBe(3);  // 1 + 2
  });

  it('updateVariant não afeta outros produtos', () => {
    useInventoryStore.getState().setProducts(fakeProducts, 2);
    useInventoryStore.getState().updateVariant('var-1', { availableStock: 100 });

    const prodB = useInventoryStore.getState().products[1];
    expect(prodB.availableRollup).toBe(0);
  });

  it('markUpdated adiciona variantId a updatedVariantIds', () => {
    useInventoryStore.getState().markUpdated('var-1');
    expect(useInventoryStore.getState().updatedVariantIds.has('var-1')).toBe(true);
  });

  it('markUpdated acumula múltiplos IDs', () => {
    useInventoryStore.getState().markUpdated('var-1');
    useInventoryStore.getState().markUpdated('var-2');
    const ids = useInventoryStore.getState().updatedVariantIds;
    expect(ids.has('var-1')).toBe(true);
    expect(ids.has('var-2')).toBe(true);
  });

  it('clearUpdated remove variantId de updatedVariantIds', () => {
    useInventoryStore.getState().markUpdated('var-1');
    useInventoryStore.getState().markUpdated('var-2');
    useInventoryStore.getState().clearUpdated('var-1');

    const ids = useInventoryStore.getState().updatedVariantIds;
    expect(ids.has('var-1')).toBe(false);
    expect(ids.has('var-2')).toBe(true);
  });
});
