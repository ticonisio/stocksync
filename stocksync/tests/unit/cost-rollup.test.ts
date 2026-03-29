import { describe, it, expect } from 'vitest';

// Replicate the cost rollup logic from dashboard for unit testing
function calcCostRollup(variants: { availableStock: number; averageCost: number | null }[]) {
  const withCost = variants.filter((v) => v.averageCost != null);
  const costRollup =
    withCost.length > 0
      ? withCost.reduce((s, v) => s + v.availableStock * v.averageCost!, 0)
      : null;
  const totalQtyWithCost = withCost.reduce((s, v) => s + v.availableStock, 0);
  const avgCostRollup =
    costRollup != null && totalQtyWithCost > 0 ? costRollup / totalQtyWithCost : null;

  return { costRollup, avgCostRollup };
}

describe('calcCostRollup', () => {
  it('calculates cost rollup for variants with averageCost', () => {
    const variants = [
      { availableStock: 10, averageCost: 5.0 },
      { availableStock: 20, averageCost: 8.0 },
    ];
    const { costRollup, avgCostRollup } = calcCostRollup(variants);
    // costRollup = 10*5 + 20*8 = 50 + 160 = 210
    expect(costRollup).toBe(210);
    // avgCostRollup = 210 / 30 = 7.0
    expect(avgCostRollup).toBe(7.0);
  });

  it('ignores variants without averageCost', () => {
    const variants = [
      { availableStock: 10, averageCost: 5.0 },
      { availableStock: 20, averageCost: null },
    ];
    const { costRollup, avgCostRollup } = calcCostRollup(variants);
    // costRollup = 10*5 = 50 (variant with null ignored)
    expect(costRollup).toBe(50);
    // avgCostRollup = 50 / 10 = 5.0
    expect(avgCostRollup).toBe(5.0);
  });

  it('returns null when no variants have averageCost', () => {
    const variants = [
      { availableStock: 10, averageCost: null },
      { availableStock: 20, averageCost: null },
    ];
    const { costRollup, avgCostRollup } = calcCostRollup(variants);
    expect(costRollup).toBeNull();
    expect(avgCostRollup).toBeNull();
  });

  it('returns null avgCostRollup when all variants with cost have zero stock', () => {
    const variants = [
      { availableStock: 0, averageCost: 10.0 },
    ];
    const { costRollup, avgCostRollup } = calcCostRollup(variants);
    // costRollup = 0*10 = 0
    expect(costRollup).toBe(0);
    // avgCostRollup = 0/0 → null (division by zero protection)
    expect(avgCostRollup).toBeNull();
  });

  it('handles single variant correctly', () => {
    const variants = [{ availableStock: 100, averageCost: 12.5 }];
    const { costRollup, avgCostRollup } = calcCostRollup(variants);
    expect(costRollup).toBe(1250);
    expect(avgCostRollup).toBe(12.5);
  });
});
