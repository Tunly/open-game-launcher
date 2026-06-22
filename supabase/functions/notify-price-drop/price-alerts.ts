export type StoreProductPriceRow = {
  discount_percent: number | null;
  id: string;
  price_cents: number | null;
  slug: string | null;
  status: string | null;
  title: string | null;
  updated_at: string | null;
};

export type StorePriceAlertRow = {
  id: string;
  is_active: boolean | null;
  last_notified_at: string | null;
  product?: StoreProductPriceRow | StoreProductPriceRow[] | null;
  product_id: string;
  target_price_cents: number | null;
  updated_at: string | null;
  user_id: string;
};

export type PriceDropCandidate = {
  alertId: string;
  alertUpdatedAt: string | null;
  currentPriceCents: number;
  discountPercent: number;
  lastNotifiedAt: string | null;
  originalPriceCents: number;
  productId: string;
  productSlug: string | null;
  productTitle: string;
  productUpdatedAt: string | null;
  targetPriceCents: number;
  userId: string;
};

export type PriceAlertSkipReason =
  | "already_notified"
  | "inactive"
  | "invalid_product"
  | "invalid_target"
  | "not_met"
  | "unpublished_product";

export type PriceAlertScanResult = {
  candidates: PriceDropCandidate[];
  scanned: number;
  skipped: Record<PriceAlertSkipReason, number>;
};

export type FindTriggeredPriceAlertsOptions = {
  notificationVersionGraceMs?: number;
};

const DEFAULT_NOTIFICATION_VERSION_GRACE_MS = 2000;

function emptySkipped(): Record<PriceAlertSkipReason, number> {
  return {
    already_notified: 0,
    inactive: 0,
    invalid_product: 0,
    invalid_target: 0,
    not_met: 0,
    unpublished_product: 0,
  };
}

function clampDiscountPercent(value: number | null): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value ?? 0), 0), 100);
}

export function effectivePriceCents(
  product: Pick<StoreProductPriceRow, "discount_percent" | "price_cents">,
): number {
  const priceCents = Math.max(0, Math.round(product.price_cents ?? 0));
  const discountPercent = clampDiscountPercent(product.discount_percent);
  return Math.max(
    0,
    Math.round(priceCents * ((100 - discountPercent) / 100)),
  );
}

export function normalizeProductRelation(
  product: StorePriceAlertRow["product"],
): StoreProductPriceRow | null {
  const row = Array.isArray(product) ? product[0] : product;
  if (!row || typeof row !== "object") return null;
  if (!row.id || !Number.isFinite(row.price_cents ?? Number.NaN)) return null;
  return row;
}

export function shouldNotifyAlertVersion(
  alert: Pick<StorePriceAlertRow, "last_notified_at" | "updated_at">,
  product: Pick<StoreProductPriceRow, "updated_at">,
  graceMs = DEFAULT_NOTIFICATION_VERSION_GRACE_MS,
): boolean {
  if (!alert.last_notified_at) return true;

  const lastNotifiedAt = Date.parse(alert.last_notified_at);
  if (!Number.isFinite(lastNotifiedAt)) return true;

  const alertUpdatedAt = alert.updated_at ? Date.parse(alert.updated_at) : NaN;
  const productUpdatedAt = product.updated_at
    ? Date.parse(product.updated_at)
    : NaN;
  const minimumNewVersionAt = lastNotifiedAt + Math.max(0, graceMs);

  return (
    (Number.isFinite(alertUpdatedAt) &&
      alertUpdatedAt > minimumNewVersionAt) ||
    (Number.isFinite(productUpdatedAt) &&
      productUpdatedAt > minimumNewVersionAt)
  );
}

export function findTriggeredPriceAlerts(
  alerts: StorePriceAlertRow[],
  options: FindTriggeredPriceAlertsOptions = {},
): PriceAlertScanResult {
  const candidates: PriceDropCandidate[] = [];
  const skipped = emptySkipped();
  const graceMs = options.notificationVersionGraceMs ??
    DEFAULT_NOTIFICATION_VERSION_GRACE_MS;

  for (const alert of alerts) {
    if (!alert.is_active) {
      skipped.inactive += 1;
      continue;
    }

    const product = normalizeProductRelation(alert.product);
    if (!product) {
      skipped.invalid_product += 1;
      continue;
    }

    if (product.status !== "published") {
      skipped.unpublished_product += 1;
      continue;
    }

    const targetPriceCents = Math.round(alert.target_price_cents ?? 0);
    if (!Number.isFinite(targetPriceCents) || targetPriceCents <= 0) {
      skipped.invalid_target += 1;
      continue;
    }

    if (!shouldNotifyAlertVersion(alert, product, graceMs)) {
      skipped.already_notified += 1;
      continue;
    }

    const currentPriceCents = effectivePriceCents(product);
    if (currentPriceCents > targetPriceCents) {
      skipped.not_met += 1;
      continue;
    }

    candidates.push({
      alertId: alert.id,
      alertUpdatedAt: alert.updated_at,
      currentPriceCents,
      discountPercent: clampDiscountPercent(product.discount_percent),
      lastNotifiedAt: alert.last_notified_at,
      originalPriceCents: Math.max(0, Math.round(product.price_cents ?? 0)),
      productId: product.id,
      productSlug: product.slug,
      productTitle: product.title?.trim() || "Untitled store product",
      productUpdatedAt: product.updated_at,
      targetPriceCents,
      userId: alert.user_id,
    });
  }

  return {
    candidates,
    scanned: alerts.length,
    skipped,
  };
}
