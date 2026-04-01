export interface ProductVelocityRollup {
  productId: string;
  title: string;
  velocityPerDay: number;
  unitsSold: number;
  totalAvailableStock: number;
  topVariantTitle: string;
  diasRestantes: number | null; // null = no velocity (infinite stock)
}

export type SalesVelocityWithVariant = {
  velocityPerDay: number;
  unitsSold: number;
  variant: {
    productId: string;
    title: string;
    availableStock: number;
    product: { title: string };
  };
};

export function aggregateVelocityByProduct(
  velocities: SalesVelocityWithVariant[]
): ProductVelocityRollup[] {
  const map = new Map<string, ProductVelocityRollup & { topVelocity: number }>();

  for (const sv of velocities) {
    const { productId, title: variantTitle, availableStock, product } = sv.variant;
    const existing = map.get(productId);

    if (!existing) {
      map.set(productId, {
        productId,
        title: product.title,
        velocityPerDay: sv.velocityPerDay,
        unitsSold: sv.unitsSold,
        totalAvailableStock: availableStock,
        topVariantTitle: variantTitle,
        topVelocity: sv.velocityPerDay,
        diasRestantes: null,
      });
    } else {
      existing.velocityPerDay += sv.velocityPerDay;
      existing.unitsSold += sv.unitsSold;
      existing.totalAvailableStock += availableStock;
      if (sv.velocityPerDay > existing.topVelocity) {
        existing.topVelocity = sv.velocityPerDay;
        existing.topVariantTitle = variantTitle;
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return Array.from(map.values()).map(({ topVelocity: _top, ...rest }) => {
    const diasRestantes =
      rest.velocityPerDay > 0
        ? Math.floor(rest.totalAvailableStock / rest.velocityPerDay)
        : null;
    return { ...rest, diasRestantes };
  });
}
