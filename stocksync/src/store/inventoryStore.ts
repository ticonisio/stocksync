import { create } from 'zustand';

export interface VariantWithStock {
  id: string;
  title: string;
  sku: string | null;
  availableStock: number;
  reservedStock: number;
  committedStock: number;
  averageCost: number | null;
  price: number | null;
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
  priceRollup: number | null;
}

type VariantPatch = Partial<Pick<VariantWithStock, 'availableStock' | 'reservedStock' | 'committedStock' | 'averageCost' | 'price'>>;

/** Incremental deltas applied over SSR initial values — works regardless of pagination */
export interface SummaryDeltas {
  availableDelta: number;
  reservedDelta: number;
  costDelta: number;
  retailDelta: number;
}

interface InventoryState {
  products: ProductWithRollup[];
  total: number;
  updatedVariantIds: Set<string>;
  deltas: SummaryDeltas;
  setProducts: (products: ProductWithRollup[], total: number) => void;
  updateVariant: (variantId: string, patch: VariantPatch) => void;
  /** Apply raw deltas for variants NOT in the current page (e.g. from realtime old→new diff) */
  applyDelta: (delta: Partial<SummaryDeltas>) => void;
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

  const withPrice = variants.filter((v) => v.price != null);
  const priceRollup =
    withPrice.length > 0
      ? withPrice.reduce((s, v) => s + v.availableStock * v.price!, 0)
      : null;

  return {
    availableRollup: variants.reduce((s, v) => s + v.availableStock, 0),
    reservedRollup: variants.reduce((s, v) => s + v.reservedStock, 0),
    committedRollup: variants.reduce((s, v) => s + v.committedStock, 0),
    costRollup,
    avgCostRollup,
    priceRollup,
  };
}

export const useInventoryStore = create<InventoryState>((set) => ({
  products: [],
  total: 0,
  updatedVariantIds: new Set(),
  deltas: { availableDelta: 0, reservedDelta: 0, costDelta: 0, retailDelta: 0 },

  setProducts: (products, total) => set({ products, total }),

  updateVariant: (variantId, patch) =>
    set((state) => {
      // Calculate deltas from the old variant values
      let dAvailable = 0;
      let dReserved = 0;
      let dCost = 0;
      let dRetail = 0;

      const products = state.products.map((p) => {
        const variants = p.variants.map((v) => {
          if (v.id !== variantId) return v;

          const oldAvail = v.availableStock;
          const newAvail = patch.availableStock ?? oldAvail;
          dAvailable += newAvail - oldAvail;

          const oldReserved = v.reservedStock;
          const newReserved = patch.reservedStock ?? oldReserved;
          dReserved += newReserved - oldReserved;

          const oldCost = (v.averageCost ?? 0) * oldAvail;
          const newCostUnit = patch.averageCost !== undefined ? patch.averageCost : v.averageCost;
          const newCost = (newCostUnit ?? 0) * newAvail;
          dCost += newCost - oldCost;

          const oldRetail = (v.price ?? 0) * oldAvail;
          const newPriceUnit = patch.price !== undefined ? patch.price : v.price;
          const newRetail = (newPriceUnit ?? 0) * newAvail;
          dRetail += newRetail - oldRetail;

          return { ...v, ...patch };
        });
        return { ...p, variants, ...calcRollup(variants) };
      });

      return {
        products,
        deltas: {
          availableDelta: state.deltas.availableDelta + dAvailable,
          reservedDelta: state.deltas.reservedDelta + dReserved,
          costDelta: state.deltas.costDelta + dCost,
          retailDelta: state.deltas.retailDelta + dRetail,
        },
      };
    }),

  applyDelta: (delta) =>
    set((state) => ({
      deltas: {
        availableDelta: state.deltas.availableDelta + (delta.availableDelta ?? 0),
        reservedDelta: state.deltas.reservedDelta + (delta.reservedDelta ?? 0),
        costDelta: state.deltas.costDelta + (delta.costDelta ?? 0),
        retailDelta: state.deltas.retailDelta + (delta.retailDelta ?? 0),
      },
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
