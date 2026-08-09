export interface StoreProductRecord {
  id: string;
  title: string;
  platforms: string[] | null;
  price_cents: number;
  discount_percent: number;
}

export function effectivePriceCents(product: StoreProductRecord): number {
  const discountPercent = Math.min(
    Math.max(product.discount_percent ?? 0, 0),
    100,
  );
  return Math.max(
    0,
    Math.round(product.price_cents * ((100 - discountPercent) / 100)),
  );
}
