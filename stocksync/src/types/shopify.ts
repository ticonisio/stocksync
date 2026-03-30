export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  variants: ShopifyVariant[];
}

export interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  sku: string | null;
  price: string;
  inventory_quantity: number;
  inventory_item_id: number;
}

export interface ShopifyInventoryItem {
  id: number;
  cost: string | null;
}

export interface ShopifyCollection {
  id: number;
  title: string;
  handle: string;
}

export interface ShopifyCollect {
  id: number;
  product_id: number;
  collection_id: number;
}
