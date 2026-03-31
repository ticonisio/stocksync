import { describe, it, expect } from 'vitest';

// Pure function extracted from DashboardSummaryCards logic for testability
function calcAggregates(
  products: Array<{
    variants: Array<{
      availableStock: number;
      reservedStock: number;
      averageCost: number | null;
      price: number | null;
    }>;
  }>
) {
  let available = 0;
  let reserved = 0;
  let costSum = 0;
  let hasCost = false;
  let retailSum = 0;
  let hasRetail = false;

  for (const p of products) {
    for (const v of p.variants) {
      available += v.availableStock;
      reserved += v.reservedStock;
      if (v.averageCost != null) {
        costSum += v.availableStock * v.averageCost;
        hasCost = true;
      }
      if (v.price != null) {
        retailSum += v.availableStock * v.price;
        hasRetail = true;
      }
    }
  }

  return {
    availableStock: available,
    reservedStock: reserved,
    totalCostValue: hasCost ? costSum : null,
    totalRetailValue: hasRetail ? retailSum : null,
  };
}

describe('Dashboard Summary Cards — aggregate recalculation', () => {
  it('calculates totals from variants with cost and price', () => {
    const products = [
      {
        variants: [
          { availableStock: 10, reservedStock: 2, averageCost: 50, price: 100 },
          { availableStock: 5, reservedStock: 1, averageCost: 30, price: 80 },
        ],
      },
    ];
    const result = calcAggregates(products);
    expect(result.availableStock).toBe(15);
    expect(result.reservedStock).toBe(3);
    expect(result.totalCostValue).toBe(10 * 50 + 5 * 30); // 650
    expect(result.totalRetailValue).toBe(10 * 100 + 5 * 80); // 1400
  });

  it('returns null for cost/retail when no variants have those fields', () => {
    const products = [
      {
        variants: [
          { availableStock: 10, reservedStock: 0, averageCost: null, price: null },
        ],
      },
    ];
    const result = calcAggregates(products);
    expect(result.availableStock).toBe(10);
    expect(result.reservedStock).toBe(0);
    expect(result.totalCostValue).toBeNull();
    expect(result.totalRetailValue).toBeNull();
  });

  it('excludes variants without averageCost from cost sum (not zero)', () => {
    const products = [
      {
        variants: [
          { availableStock: 10, reservedStock: 0, averageCost: 50, price: 100 },
          { availableStock: 20, reservedStock: 0, averageCost: null, price: 200 },
        ],
      },
    ];
    const result = calcAggregates(products);
    // Only variant 1 contributes to cost
    expect(result.totalCostValue).toBe(10 * 50); // 500, NOT 500 + 0
    // Both contribute to retail
    expect(result.totalRetailValue).toBe(10 * 100 + 20 * 200); // 5000
  });

  it('handles multiple products correctly', () => {
    const products = [
      {
        variants: [
          { availableStock: 5, reservedStock: 1, averageCost: 10, price: 20 },
        ],
      },
      {
        variants: [
          { availableStock: 3, reservedStock: 0, averageCost: 15, price: 30 },
        ],
      },
    ];
    const result = calcAggregates(products);
    expect(result.availableStock).toBe(8);
    expect(result.reservedStock).toBe(1);
    expect(result.totalCostValue).toBe(5 * 10 + 3 * 15); // 95
    expect(result.totalRetailValue).toBe(5 * 20 + 3 * 30); // 190
  });

  it('returns null for empty products array', () => {
    const result = calcAggregates([]);
    expect(result.availableStock).toBe(0);
    expect(result.reservedStock).toBe(0);
    expect(result.totalCostValue).toBeNull();
    expect(result.totalRetailValue).toBeNull();
  });

  it('handles zero stock with averageCost correctly', () => {
    const products = [
      {
        variants: [
          { availableStock: 0, reservedStock: 0, averageCost: 50, price: 100 },
        ],
      },
    ];
    const result = calcAggregates(products);
    expect(result.availableStock).toBe(0);
    expect(result.totalCostValue).toBe(0); // 0 * 50 = 0, but hasCost is true
    expect(result.totalRetailValue).toBe(0);
  });
});
