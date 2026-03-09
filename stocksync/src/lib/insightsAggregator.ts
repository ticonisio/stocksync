export interface ProductVelocityRollup {
  productId: string;
  title: string;
  velocityPerDay: number;
  totalAvailableStock: number;
  topVariantTitle: string;
}

export type SalesVelocityWithVariant = {
  velocityPerDay: number;
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
        totalAvailableStock: availableStock,
        topVariantTitle: variantTitle,
        topVelocity: sv.velocityPerDay,
      });
    } else {
      existing.velocityPerDay += sv.velocityPerDay;
      existing.totalAvailableStock += availableStock;
      if (sv.velocityPerDay > existing.topVelocity) {
        existing.topVelocity = sv.velocityPerDay;
        existing.topVariantTitle = variantTitle;
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return Array.from(map.values()).map(({ topVelocity: _top, ...rest }) => rest);
}
