import { getSupabaseClient } from "./client";
import type { Database } from "./database.types";
import type {
  BuildArch,
  BuildPlatform,
  DeveloperApplication,
  DevApplicationStatus,
  OrderStatus,
  StoreBuild,
  StoreBuildDownloadTicket,
  StoreCartItem,
  StoreInvoiceStatus,
  StoreLicense,
  StoreOrder,
  StoreOrderInvoice,
  StoreOrderItem,
  StorePriceAlert,
  StoreProduct,
  StoreProductStatus,
  StoreReview,
  StoreReviewReply,
  StoreReviewReplyInput,
  StoreReviewReport,
  StoreReviewReportInput,
  StoreReviewReportReason,
  StoreReviewReportStatus,
  StoreReviewInput,
  StoreRefundRequest,
  StoreRefundRequestInput,
  StoreRefundRequestStatus,
  StoreWishlistItem,
} from "../types/store";

type StoreProductRow = Database["public"]["Tables"]["store_products"]["Row"];
type StoreCartItemRow = Database["public"]["Tables"]["store_cart_items"]["Row"];
type StoreWishlistRow = Database["public"]["Tables"]["store_wishlist"]["Row"];
type StorePriceAlertRow = Database["public"]["Tables"]["store_price_alerts"]["Row"];
type StoreOrderRow = Database["public"]["Tables"]["store_orders"]["Row"];
type StoreOrderItemRow = Database["public"]["Tables"]["store_order_items"]["Row"];
type StoreRefundRequestRow = Database["public"]["Tables"]["store_order_refund_requests"]["Row"];
type StoreOrderInvoiceRow = Database["public"]["Tables"]["store_order_invoices"]["Row"];
type StoreBuildRow = Database["public"]["Tables"]["store_builds"]["Row"];
type StoreLicenseRow = Database["public"]["Tables"]["store_licenses"]["Row"];
type StoreReviewRow = Database["public"]["Tables"]["store_reviews"]["Row"];
type StoreReviewReportRow = Database["public"]["Tables"]["store_review_reports"]["Row"];
type StoreReviewReplyRow = Database["public"]["Tables"]["store_review_replies"]["Row"];
type DeveloperApplicationRow = Database["public"]["Tables"]["developer_applications"]["Row"];

export interface StorePriceDropNotificationRunEvidence {
  alertsMarkedCount: number;
  candidateCount: number;
  completedAt: string | null;
  dryRun: boolean;
  limit: number;
  notificationsRecordedCount: number;
  requestedAlertCount: number;
  requestedProductCount: number;
  requestedUserCount: number;
  runId: string;
  scannedCount: number;
  status: "dry_run" | "completed" | "failed" | string;
  triggerSource: "manual" | "scheduled" | "hosted_deploy_gate" | string;
}

type StorePriceDropNotificationRunsQuery = {
  select: (columns: string) => {
    order: (
      column: string,
      options: { ascending: boolean },
    ) => {
      limit: (count: number) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: { code?: string; message: string } | null;
        }>;
      };
    };
  };
};

interface StoreOrderSupportFunctionResponse {
  invoice?: StoreOrderInvoiceRow | null;
  order?: StoreOrderRow | null;
  refund_request?: StoreRefundRequestRow | null;
}

export interface StoreOrderSupportResult {
  invoice: StoreOrderInvoice | null;
  order: StoreOrder | null;
  refundRequest: StoreRefundRequest | null;
}

const PRODUCT_SELECT = `id, title, slug, description, short_description, developer_id, publisher,
  release_date, genres, tags, platforms, price_cents, discount_percent, cover_image_url,
  trailer_url, min_system_requirements, rec_system_requirements,
  rating, ratings_count, downloads_count, status, metadata, created_at, updated_at`;
const CART_SELECT = `id, user_id, product_id, quantity, added_at`;
const WISHLIST_SELECT = `id, user_id, product_id, added_at`;
const STORE_PRICE_ALERT_SELECT = `id, user_id, product_id, target_price_cents, is_active,
  last_notified_at, created_at, updated_at`;
const ORDER_SELECT = `id, user_id, stripe_session_id, stripe_payment_intent, subtotal_cents,
  tax_cents, total_cents, currency, status, payment_method, paid_at, created_at, updated_at`;
const ORDER_ITEM_SELECT = `id, order_id, product_id, title_snapshot, price_cents_snapshot, quantity`;
const REFUND_REQUEST_SELECT = `id, order_id, user_id, reason, details, status, requested_at,
  reviewed_at, processed_at, cancelled_at, provider, provider_refund_id,
  provider_refund_status, refund_amount_cents, failure_reason, metadata, created_at, updated_at`;
const ORDER_INVOICE_SELECT = `id, order_id, user_id, provider, provider_invoice_id,
  invoice_number, status, hosted_invoice_url, pdf_url, metadata, issued_at, created_at, updated_at`;
const BUILD_SELECT = `id, product_id, version, platform, arch, file_name, size_bytes,
  sha256, storage_path, changelog, is_latest, uploaded_at, created_at`;
const LICENSE_SELECT = `id, user_id, product_id, order_id, license_key, platform,
  device_id, activations_left, expires_at, is_revoked, created_at`;
const REVIEW_SELECT = `id, product_id, user_id, rating, title, body, is_published,
  is_hidden_by_reports, hidden_by_reports_at, created_at, updated_at`;
const REVIEW_REPORT_SELECT = `id, review_id, reporter_user_id, reason, details, status,
  created_at, updated_at`;
const REVIEW_REPLY_SELECT = `id, review_id, product_id, developer_user_id, body, created_at,
  updated_at`;
const DEVELOPER_APPLICATION_SELECT = `id, user_id, studio_name, website, description, status,
  reviewed_by_user_id, reviewed_at, created_at, updated_at`;
const publishedProductsCacheTtlMs = 5 * 60_000;
let publishedProductsCache: { data: StoreProduct[]; expiresAt: number } | null = null;
let publishedProductsRequest: Promise<StoreProduct[]> | null = null;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rowString(row: Record<string, unknown>, key: string, fallback = "") {
  const value = row[key];
  return typeof value === "string" ? value : fallback;
}

function rowNullableString(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function rowNumber(row: Record<string, unknown>, key: string, fallback = 0) {
  const value = row[key];
  return typeof value === "number" ? value : fallback;
}

function rowBoolean(row: Record<string, unknown>, key: string, fallback = false) {
  const value = row[key];
  return typeof value === "boolean" ? value : fallback;
}

function isMissingStoreSchemaError(error: { code?: string; message: string } | null) {
  if (!error) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    error.code === "42703" ||
    error.code === "42P01" ||
    error.code === "PGRST202"
  );
}

function isStoreProductStatus(value: string): value is StoreProductStatus {
  return ["draft", "review", "published", "delisted", "suspended"].includes(value);
}

function isOrderStatus(value: string): value is OrderStatus {
  return ["pending", "paid", "fulfilled", "refunded", "failed", "expired"].includes(value);
}

function isBuildPlatform(value: string): value is BuildPlatform {
  return ["windows", "macos", "linux"].includes(value);
}

function isBuildArch(value: string): value is BuildArch {
  return ["x86_64", "aarch64"].includes(value);
}

function isDevApplicationStatus(value: string): value is DevApplicationStatus {
  return ["pending", "approved", "rejected"].includes(value);
}

function isStoreReviewReportReason(value: string): value is StoreReviewReportReason {
  return [
    "spam",
    "harassment",
    "hate_or_abuse",
    "spoilers",
    "off_topic",
    "fraud",
    "other",
  ].includes(value);
}

function isStoreReviewReportStatus(value: string): value is StoreReviewReportStatus {
  return ["active", "dismissed", "withdrawn"].includes(value);
}

function isStoreRefundRequestStatus(value: string): value is StoreRefundRequestStatus {
  return ["requested", "reviewing", "approved", "rejected", "cancelled", "processed"].includes(
    value,
  );
}

function isStoreInvoiceStatus(value: string): value is StoreInvoiceStatus {
  return ["pending", "available", "unavailable", "void"].includes(value);
}

export function mapStoreProductRow(row: StoreProductRow): StoreProduct {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    shortDescription: row.short_description,
    developerId: row.developer_id,
    publisher: row.publisher,
    releaseDate: row.release_date,
    genres: row.genres ?? [],
    tags: row.tags ?? [],
    platforms: row.platforms ?? [],
    priceCents: row.price_cents,
    discountPercent: row.discount_percent,
    coverImageUrl: row.cover_image_url,
    trailerUrl: row.trailer_url,
    minSystemRequirements: asRecord(row.min_system_requirements),
    recSystemRequirements: asRecord(row.rec_system_requirements),
    rating: row.rating,
    ratingsCount: row.ratings_count,
    downloadsCount: row.downloads_count,
    status: isStoreProductStatus(row.status) ? row.status : "draft",
    metadata: asRecord(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapStoreCartItemRow(row: StoreCartItemRow): StoreCartItem {
  return {
    id: row.id,
    userId: row.user_id,
    productId: row.product_id,
    quantity: row.quantity,
    addedAt: row.added_at,
  };
}

export function mapStoreWishlistRow(row: StoreWishlistRow): StoreWishlistItem {
  return {
    id: row.id,
    userId: row.user_id,
    productId: row.product_id,
    addedAt: row.added_at,
  };
}

export function mapStorePriceAlertRow(row: StorePriceAlertRow): StorePriceAlert {
  return {
    id: row.id,
    userId: row.user_id,
    productId: row.product_id,
    targetPriceCents: row.target_price_cents,
    isActive: row.is_active,
    lastNotifiedAt: row.last_notified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStorePriceDropNotificationRunEvidence(
  row: Record<string, unknown>,
): StorePriceDropNotificationRunEvidence {
  return {
    alertsMarkedCount: rowNumber(row, "alerts_marked_count"),
    candidateCount: rowNumber(row, "candidate_count"),
    completedAt: rowNullableString(row, "completed_at"),
    dryRun: rowBoolean(row, "dry_run"),
    limit: rowNumber(row, "limit_count"),
    notificationsRecordedCount: rowNumber(row, "notifications_recorded_count"),
    requestedAlertCount: rowNumber(row, "requested_alert_count"),
    requestedProductCount: rowNumber(row, "requested_product_count"),
    requestedUserCount: rowNumber(row, "requested_user_count"),
    runId: rowString(row, "run_id"),
    scannedCount: rowNumber(row, "scanned_count"),
    status: rowString(row, "status", "failed"),
    triggerSource: rowString(row, "trigger_source", "manual"),
  };
}

export function mapStoreOrderRow(row: StoreOrderRow): StoreOrder {
  return {
    id: row.id,
    userId: row.user_id,
    stripeSessionId: row.stripe_session_id,
    stripePaymentIntent: row.stripe_payment_intent,
    subtotalCents: row.subtotal_cents,
    taxCents: row.tax_cents,
    totalCents: row.total_cents,
    currency: row.currency,
    status: isOrderStatus(row.status) ? row.status : "pending",
    paymentMethod: row.payment_method,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapStoreOrderItemRow(row: StoreOrderItemRow): StoreOrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    titleSnapshot: row.title_snapshot,
    priceCentsSnapshot: row.price_cents_snapshot,
    quantity: row.quantity,
  };
}

export function mapStoreRefundRequestRow(row: StoreRefundRequestRow): StoreRefundRequest {
  return {
    id: row.id,
    orderId: row.order_id,
    userId: row.user_id,
    reason: row.reason,
    details: row.details,
    status: isStoreRefundRequestStatus(row.status) ? row.status : "requested",
    provider: row.provider ?? "stripe",
    providerRefundId: row.provider_refund_id,
    providerRefundStatus: row.provider_refund_status,
    refundAmountCents: row.refund_amount_cents,
    failureReason: row.failure_reason,
    metadata: asRecord(row.metadata),
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at,
    processedAt: row.processed_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapStoreOrderInvoiceRow(row: StoreOrderInvoiceRow): StoreOrderInvoice {
  return {
    id: row.id,
    orderId: row.order_id,
    userId: row.user_id,
    provider: row.provider,
    providerInvoiceId: row.provider_invoice_id,
    invoiceNumber: row.invoice_number,
    status: isStoreInvoiceStatus(row.status) ? row.status : "pending",
    hostedInvoiceUrl: row.hosted_invoice_url,
    pdfUrl: row.pdf_url,
    metadata: asRecord(row.metadata),
    issuedAt: row.issued_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapStoreBuildRow(row: StoreBuildRow): StoreBuild {
  return {
    id: row.id,
    productId: row.product_id,
    version: row.version,
    platform: isBuildPlatform(row.platform) ? row.platform : "windows",
    arch: isBuildArch(row.arch) ? row.arch : "x86_64",
    fileName: row.file_name,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    storagePath: row.storage_path,
    changelog: row.changelog,
    isLatest: row.is_latest,
    uploadedAt: row.uploaded_at,
    createdAt: row.created_at,
  };
}

export function mapStoreLicenseRow(row: StoreLicenseRow): StoreLicense {
  return {
    id: row.id,
    userId: row.user_id,
    productId: row.product_id,
    orderId: row.order_id,
    licenseKey: row.license_key,
    platform: row.platform,
    deviceId: row.device_id,
    activationsLeft: row.activations_left,
    expiresAt: row.expires_at,
    isRevoked: row.is_revoked,
    createdAt: row.created_at,
  };
}

export function mapStoreReviewRow(row: StoreReviewRow): StoreReview {
  return {
    id: row.id,
    productId: row.product_id,
    userId: row.user_id,
    rating: row.rating,
    title: row.title,
    body: row.body,
    isPublished: row.is_published,
    isHiddenByReports: row.is_hidden_by_reports,
    hiddenByReportsAt: row.hidden_by_reports_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapStoreReviewReportRow(row: StoreReviewReportRow): StoreReviewReport {
  return {
    id: row.id,
    reviewId: row.review_id,
    reporterUserId: row.reporter_user_id,
    reason: isStoreReviewReportReason(row.reason) ? row.reason : "other",
    details: row.details,
    status: isStoreReviewReportStatus(row.status) ? row.status : "active",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapStoreReviewReplyRow(row: StoreReviewReplyRow): StoreReviewReply {
  return {
    id: row.id,
    reviewId: row.review_id,
    productId: row.product_id,
    developerUserId: row.developer_user_id,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDeveloperApplicationRow(row: DeveloperApplicationRow): DeveloperApplication {
  return {
    id: row.id,
    userId: row.user_id,
    studioName: row.studio_name,
    website: row.website,
    description: row.description,
    status: isDevApplicationStatus(row.status) ? row.status : "pending",
    reviewedByUserId: row.reviewed_by_user_id,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPublishedProducts(): Promise<StoreProduct[]> {
  if (publishedProductsCache && publishedProductsCache.expiresAt > Date.now()) {
    return publishedProductsCache.data;
  }
  if (publishedProductsRequest) {
    return publishedProductsRequest;
  }

  publishedProductsRequest = loadPublishedProducts();
  try {
    const data = await publishedProductsRequest;
    publishedProductsCache = {
      data,
      expiresAt: Date.now() + publishedProductsCacheTtlMs,
    };
    return data;
  } finally {
    publishedProductsRequest = null;
  }
}

async function loadPublishedProducts(): Promise<StoreProduct[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("store_products")
    .select(PRODUCT_SELECT)
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapStoreProductRow(row as StoreProductRow));
}

export async function getStoreProduct(slug: string): Promise<StoreProduct | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("store_products")
    .select(PRODUCT_SELECT)
    .eq("slug", slug)
    .single();
  if (error || !data) return null;
  return mapStoreProductRow(data as StoreProductRow);
}

export async function listDeveloperProducts(): Promise<StoreProduct[]> {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return [];
  const { data, error } = await client
    .from("store_products")
    .select(PRODUCT_SELECT)
    .eq("developer_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapStoreProductRow(row as StoreProductRow));
}

export async function createStoreProduct(
  title: string,
  slug: string,
): Promise<StoreProduct | null> {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client
    .from("store_products")
    .insert({ developer_id: user.id, title, slug, status: "draft" })
    .select(PRODUCT_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data ? mapStoreProductRow(data as StoreProductRow) : null;
}

export async function getCartItems(): Promise<StoreCartItem[]> {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return [];
  const { data, error } = await client
    .from("store_cart_items")
    .select(CART_SELECT)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapStoreCartItemRow(row as StoreCartItemRow));
}

export async function addToCart(productId: string, quantity = 1): Promise<void> {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return;
  const { error } = await client
    .from("store_cart_items")
    .upsert(
      { user_id: user.id, product_id: productId, quantity },
      { onConflict: "user_id,product_id" },
    );
  if (error) throw new Error(error.message);
}

export async function removeFromCart(productId: string): Promise<void> {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return;
  const { error } = await client
    .from("store_cart_items")
    .delete()
    .eq("user_id", user.id)
    .eq("product_id", productId);
  if (error) throw new Error(error.message);
}

export async function listMyStoreWishlist(): Promise<StoreWishlistItem[]> {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return [];
  const { data, error } = await client
    .from("store_wishlist")
    .select(WISHLIST_SELECT)
    .eq("user_id", user.id)
    .order("added_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapStoreWishlistRow(row as StoreWishlistRow));
}

export async function addToStoreWishlist(productId: string): Promise<void> {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return;
  const { error } = await client
    .from("store_wishlist")
    .upsert({ user_id: user.id, product_id: productId }, { onConflict: "user_id,product_id" });
  if (error) throw new Error(error.message);
}

export async function removeFromStoreWishlist(productId: string): Promise<void> {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return;
  const { error } = await client
    .from("store_wishlist")
    .delete()
    .eq("user_id", user.id)
    .eq("product_id", productId);
  if (error) throw new Error(error.message);
}

export async function listMyStorePriceAlerts(): Promise<StorePriceAlert[]> {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return [];
  const { data, error } = await client
    .from("store_price_alerts")
    .select(STORE_PRICE_ALERT_SELECT)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapStorePriceAlertRow(row as StorePriceAlertRow));
}

export async function getLatestStorePriceDropNotificationRunEvidence(): Promise<StorePriceDropNotificationRunEvidence | null> {
  const client = getSupabaseClient();
  const fromRuns = client.from as unknown as (
    table: "store_price_drop_notification_runs",
  ) => StorePriceDropNotificationRunsQuery;
  const { data, error } = await fromRuns("store_price_drop_notification_runs")
    .select(
      `run_id, trigger_source, dry_run, limit_count, requested_alert_count,
      requested_product_count, requested_user_count, scanned_count,
      candidate_count, notifications_recorded_count, alerts_marked_count,
      completed_at, status`,
    )
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (isMissingStoreSchemaError(error)) {
    return null;
  }
  if (error) {
    throw new Error(error.message);
  }

  return data ? mapStorePriceDropNotificationRunEvidence(data) : null;
}

export function isTrustedStorePriceDropNotificationRunEvidence(
  evidence: StorePriceDropNotificationRunEvidence | null,
  now: Date | number | string = Date.now(),
  freshnessWindowMs = 2 * 60 * 60 * 1000,
) {
  if (!evidence?.completedAt) {
    return false;
  }
  const completedAt = Date.parse(evidence.completedAt);
  const nowMs =
    now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.parse(now);
  if (!Number.isFinite(completedAt) || !Number.isFinite(nowMs)) {
    return false;
  }

  return (
    evidence.triggerSource === "scheduled" &&
    evidence.status === "completed" &&
    evidence.dryRun === false &&
    nowMs - completedAt >= 0 &&
    nowMs - completedAt <= freshnessWindowMs
  );
}

export async function upsertStorePriceAlert(
  productId: string,
  targetPriceCents: number,
): Promise<void> {
  const normalizedTarget = Math.round(targetPriceCents);
  if (!Number.isFinite(normalizedTarget) || normalizedTarget <= 0) {
    throw new Error("Price alert target must be greater than zero.");
  }

  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return;
  const { error } = await client.from("store_price_alerts").upsert(
    {
      user_id: user.id,
      product_id: productId,
      target_price_cents: normalizedTarget,
      is_active: true,
    },
    { onConflict: "user_id,product_id" },
  );
  if (error) throw new Error(error.message);
}

export async function removeStorePriceAlert(productId: string): Promise<void> {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return;
  const { error } = await client
    .from("store_price_alerts")
    .update({ is_active: false })
    .eq("user_id", user.id)
    .eq("product_id", productId);
  if (error) throw new Error(error.message);
}

export async function listMyOrders(): Promise<StoreOrder[]> {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return [];
  const { data, error } = await client
    .from("store_orders")
    .select(ORDER_SELECT)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapStoreOrderRow(row as StoreOrderRow));
}

export async function getMyOrderByStripeSession(
  stripeSessionId: string,
): Promise<StoreOrder | null> {
  const sessionId = stripeSessionId.trim();
  if (!sessionId) return null;

  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;

  const { data, error } = await client
    .from("store_orders")
    .select(ORDER_SELECT)
    .eq("user_id", user.id)
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapStoreOrderRow(data as StoreOrderRow) : null;
}

export async function listMyOrderItems(orderIds: string | string[]): Promise<StoreOrderItem[]> {
  const ids = Array.from(
    new Set((Array.isArray(orderIds) ? orderIds : [orderIds]).filter(Boolean)),
  );
  if (ids.length === 0) return [];

  const client = getSupabaseClient();
  const { data, error } = await client
    .from("store_order_items")
    .select(ORDER_ITEM_SELECT)
    .in("order_id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapStoreOrderItemRow(row as StoreOrderItemRow));
}

export async function listMyStoreRefundRequests(): Promise<StoreRefundRequest[]> {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return [];
  const { data, error } = await client
    .from("store_order_refund_requests")
    .select(REFUND_REQUEST_SELECT)
    .eq("user_id", user.id)
    .order("requested_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapStoreRefundRequestRow(row as StoreRefundRequestRow));
}

export async function requestStoreOrderRefund(
  orderId: string,
  input: StoreRefundRequestInput,
): Promise<StoreOrderSupportResult | null> {
  const reason = input.reason.trim();
  const details = input.details?.trim() || null;
  if (!reason) {
    throw new Error("Refund reason is required.");
  }

  const { data, error } =
    await getSupabaseClient().functions.invoke<StoreOrderSupportFunctionResponse>(
      "store-order-support",
      {
        body: {
          action: "execute_refund",
          order_id: orderId,
          reason,
          details,
        },
      },
    );
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    invoice: data.invoice ? mapStoreOrderInvoiceRow(data.invoice as StoreOrderInvoiceRow) : null,
    order: data.order ? mapStoreOrderRow(data.order as StoreOrderRow) : null,
    refundRequest: data.refund_request
      ? mapStoreRefundRequestRow(data.refund_request as StoreRefundRequestRow)
      : null,
  };
}

export async function listMyStoreOrderInvoices(): Promise<StoreOrderInvoice[]> {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return [];
  const { data, error } = await client
    .from("store_order_invoices")
    .select(ORDER_INVOICE_SELECT)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapStoreOrderInvoiceRow(row as StoreOrderInvoiceRow));
}

export async function syncStoreOrderInvoice(orderId: string): Promise<StoreOrderSupportResult> {
  const { data, error } =
    await getSupabaseClient().functions.invoke<StoreOrderSupportFunctionResponse>(
      "store-order-support",
      {
        body: {
          action: "sync_invoice",
          order_id: orderId,
        },
      },
    );

  if (error) throw new Error(error.message);
  return {
    invoice: data?.invoice ? mapStoreOrderInvoiceRow(data.invoice as StoreOrderInvoiceRow) : null,
    order: data?.order ? mapStoreOrderRow(data.order as StoreOrderRow) : null,
    refundRequest: data?.refund_request
      ? mapStoreRefundRequestRow(data.refund_request as StoreRefundRequestRow)
      : null,
  };
}

export async function getLatestBuild(
  productId: string,
  platform: string,
): Promise<StoreBuild | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("store_builds")
    .select(BUILD_SELECT)
    .eq("product_id", productId)
    .eq("platform", platform)
    .eq("is_latest", true)
    .single();
  if (error || !data) return null;
  return mapStoreBuildRow(data as StoreBuildRow);
}

export async function createStoreBuildDownloadTicket(
  productId: string,
  platform?: string | null,
  buildId?: string | null,
): Promise<StoreBuildDownloadTicket> {
  const { data, error } = await getSupabaseClient().functions.invoke<StoreBuildDownloadTicket>(
    "store-download-build",
    {
      body: {
        ...(buildId ? { build_id: buildId } : {}),
        product_id: productId,
        ...(platform ? { platform } : {}),
      },
    },
  );

  if (error) throw new Error(error.message);
  if (!data?.url || !data.build || !data.licenseId || !data.expiresAt) {
    throw new Error("Store download ticket was not returned.");
  }

  return data;
}

export async function getMyLicenses(): Promise<StoreLicense[]> {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return [];
  const { data, error } = await client
    .from("store_licenses")
    .select(LICENSE_SELECT)
    .eq("user_id", user.id)
    .eq("is_revoked", false);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapStoreLicenseRow(row as StoreLicenseRow));
}

export async function listStoreProductReviews(productId: string): Promise<StoreReview[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("store_reviews")
    .select(REVIEW_SELECT)
    .eq("product_id", productId)
    .eq("is_published", true)
    .eq("is_hidden_by_reports", false)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapStoreReviewRow(row as StoreReviewRow));
}

export async function getMyStoreReview(productId: string): Promise<StoreReview | null> {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;

  const { data, error } = await client
    .from("store_reviews")
    .select(REVIEW_SELECT)
    .eq("product_id", productId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapStoreReviewRow(data as StoreReviewRow) : null;
}

export async function listMyStoreReviewReports(reviewIds: string[]): Promise<StoreReviewReport[]> {
  const ids = [...new Set(reviewIds)].filter(Boolean);
  if (ids.length === 0) return [];

  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return [];

  const { data, error } = await client
    .from("store_review_reports")
    .select(REVIEW_REPORT_SELECT)
    .eq("reporter_user_id", user.id)
    .in("review_id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapStoreReviewReportRow(row as StoreReviewReportRow));
}

export async function listStoreReviewReplies(reviewIds: string[]): Promise<StoreReviewReply[]> {
  const ids = [...new Set(reviewIds)].filter(Boolean);
  if (ids.length === 0) return [];

  const client = getSupabaseClient();
  const { data, error } = await client
    .from("store_review_replies")
    .select(REVIEW_REPLY_SELECT)
    .in("review_id", ids)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapStoreReviewReplyRow(row as StoreReviewReplyRow));
}

export async function reportStoreReview(
  reviewId: string,
  input: StoreReviewReportInput,
): Promise<StoreReviewReport | null> {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;

  const reason = isStoreReviewReportReason(input.reason) ? input.reason : "other";
  const details = input.details?.trim() || null;

  const { data, error } = await client
    .from("store_review_reports")
    .insert({
      review_id: reviewId,
      reporter_user_id: user.id,
      reason,
      details,
      status: "active",
    })
    .select(REVIEW_REPORT_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data ? mapStoreReviewReportRow(data as StoreReviewReportRow) : null;
}

export async function upsertStoreReviewReply(
  reviewId: string,
  productId: string,
  input: StoreReviewReplyInput,
): Promise<StoreReviewReply | null> {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;

  const body = input.body.trim();
  if (!body) {
    throw new Error("Developer reply is required.");
  }
  if (body.length > 1000) {
    throw new Error("Developer reply must be 1000 characters or fewer.");
  }

  const { data, error } = await client
    .from("store_review_replies")
    .upsert(
      {
        review_id: reviewId,
        product_id: productId,
        developer_user_id: user.id,
        body,
      },
      { onConflict: "review_id" },
    )
    .select(REVIEW_REPLY_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data ? mapStoreReviewReplyRow(data as StoreReviewReplyRow) : null;
}

export async function upsertStoreReview(
  productId: string,
  input: StoreReviewInput,
): Promise<StoreReview | null> {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;

  const title = input.title?.trim() || null;
  const body = input.body?.trim() || null;
  const rating = Math.min(5, Math.max(1, Math.round(input.rating)));

  const { data, error } = await client
    .from("store_reviews")
    .upsert(
      {
        product_id: productId,
        user_id: user.id,
        rating,
        title,
        body,
        is_published: true,
      },
      { onConflict: "user_id,product_id" },
    )
    .select(REVIEW_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data ? mapStoreReviewRow(data as StoreReviewRow) : null;
}

export async function submitDeveloperApplication(
  studioName: string,
  website: string | null,
  description: string | null,
): Promise<DeveloperApplication | null> {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client
    .from("developer_applications")
    .insert({ user_id: user.id, studio_name: studioName, website, description })
    .select(DEVELOPER_APPLICATION_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data ? mapDeveloperApplicationRow(data as DeveloperApplicationRow) : null;
}

export async function getDeveloperApplication(): Promise<DeveloperApplication | null> {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client
    .from("developer_applications")
    .select(DEVELOPER_APPLICATION_SELECT)
    .eq("user_id", user.id)
    .single();
  if (error || !data) return null;
  return mapDeveloperApplicationRow(data as DeveloperApplicationRow);
}
