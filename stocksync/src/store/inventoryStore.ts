import { create } from 'zustand';

export interface VariantWithStock {
  id: string;
  title: string;
  sku: string | null;
  availableStock: number;
  reservedStock: number;
  committedStock: number;
  averageCost: number | null;
}

export interface ProductWithRollup {
  id: string;
  title: string;
  variants: VariantWithStock[];
  availableRollup: number;
  reservedRollup: number;
  committedRollup: number;
  costRollup: number | null;
  avgCostRollup: number | null;
}

type VariantPatch = Partial<Pick<VariantWithStock, 'availableStock' | 'reservedStock' | 'committedStock'>>;

interface InventoryState {
  products: ProductWithRollup[];
  total: number;
  updatedVariantIds: Set<string>;
  setProducts: (products: ProductWithRollup[], total: number) => void;
  updateVariant: (variantId: string, patch: VariantPatch) => void;
  markUpdated: (variantId: string) => void;
  clearUpdated: (variantId: string) => void;
}

function calcRollup(variants: VariantWithStock[]) {
  const withCost = variants.filter((v) => v.averageCost != null);
  const costRollup =
    withCost.length > 0
      ? withCost.reduce((s, v) => s + v.availableStock * v.averageCost!, 0)
      : null;
  const totalQtyWithCost = withCost.reduce((s, v) => s + v.availableStock, 0);
  const avgCostRollup =
    costRollup != null && totalQtyWithCost > 0 ? costRollup / totalQtyWithCost : null;

  return {
    availableRollup: variants.reduce((s, v) => s + v.availableStock, 0),
    reservedRollup: variants.reduce((s, v) => s + v.reservedStock, 0),
    committedRollup: variants.reduce((s, v) => s + v.committedStock, 0),
    costRollup,
    avgCostRollup,
  };
}

export const useInventoryStore = create<InventoryState>((set) => ({
  products: [],
  total: 0,
  updatedVariantIds: new Set(),

  setProducts: (products, total) => set({ products, total }),

  updateVariant: (variantId, patch) =>
    set((state) => ({
      products: state.products.map((p) => {
        const variants = p.variants.map((v) =>
          v.id === variantId ? { ...v, ...patch } : v
        );
        return { ...p, variants, ...calcRollup(variants) };
      }),
    })),

  markUpdated: (variantId) =>
    set((state) => ({
      updatedVariantIds: new Set([...state.updatedVariantIds, variantId]),
    })),

  clearUpdated: (variantId) =>
    set((state) => {
      const next = new Set(state.updatedVariantIds);
      next.delete(variantId);
      return { updatedVariantIds: next };
    }),
}));
