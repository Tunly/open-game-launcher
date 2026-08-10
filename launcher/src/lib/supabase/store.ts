import { getCurrentSupabaseUser, getSupabaseClient } from "./client";
import type { Database } from "./database.types";
import type {
  DeveloperApplication,
  DevApplicationStatus,
  StorePriceAlert,
  StoreProduct,
  StoreProductStatus,
  StoreReview,
  StoreReviewInput,
  StoreReviewReply,
  StoreReviewReplyInput,
  StoreReviewReport,
  StoreReviewReportInput,
  StoreReviewReportReason,
  StoreReviewReportStatus,
  StoreWishlistItem,
} from "../types/store";

type StoreProductRow = Database["public"]["Tables"]["store_products"]["Row"];
type StoreWishlistRow = Database["public"]["Tables"]["store_wishlist"]["Row"];
type StorePriceAlertRow = Database["public"]["Tables"]["store_price_alerts"]["Row"];
type StoreReviewRow = Database["public"]["Tables"]["store_reviews"]["Row"];
type StoreReviewReportRow = Database["public"]["Tables"]["store_review_reports"]["Row"];
type StoreReviewReplyRow = Database["public"]["Tables"]["store_review_replies"]["Row"];
type DeveloperApplicationRow = Database["public"]["Tables"]["developer_applications"]["Row"];

const PRODUCT_SELECT = `id, title, slug, description, short_description, developer_id, publisher,
  release_date, genres, tags, platforms, price_cents, discount_percent, cover_image_url,
  trailer_url, min_system_requirements, rec_system_requirements,
  rating, ratings_count, downloads_count, status, metadata, created_at, updated_at`;
const WISHLIST_SELECT = `id, user_id, product_id, added_at`;
const PRICE_ALERT_SELECT = `id, user_id, product_id, target_price_cents, is_active,
  last_notified_at, created_at, updated_at`;
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

function isStoreProductStatus(value: string): value is StoreProductStatus {
  return ["draft", "review", "published", "delisted", "suspended"].includes(value);
}

function isDevApplicationStatus(value: string): value is DevApplicationStatus {
  return ["pending", "approved", "rejected"].includes(value);
}

function isReviewReason(value: string): value is StoreReviewReportReason {
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

function isReviewStatus(value: string): value is StoreReviewReportStatus {
  return ["active", "dismissed", "withdrawn"].includes(value);
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

export function mapStoreWishlistRow(row: StoreWishlistRow): StoreWishlistItem {
  return { id: row.id, userId: row.user_id, productId: row.product_id, addedAt: row.added_at };
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
    reason: isReviewReason(row.reason) ? row.reason : "other",
    details: row.details,
    status: isReviewStatus(row.status) ? row.status : "active",
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
  if (publishedProductsCache && publishedProductsCache.expiresAt > Date.now())
    return publishedProductsCache.data;
  if (publishedProductsRequest) return publishedProductsRequest;
  publishedProductsRequest = loadPublishedProducts();
  try {
    const data = await publishedProductsRequest;
    publishedProductsCache = { data, expiresAt: Date.now() + publishedProductsCacheTtlMs };
    return data;
  } finally {
    publishedProductsRequest = null;
  }
}

async function loadPublishedProducts(): Promise<StoreProduct[]> {
  const { data, error } = await getSupabaseClient()
    .from("store_products")
    .select(PRODUCT_SELECT)
    .eq("status", "published")
    .order("downloads_count", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapStoreProductRow(row as StoreProductRow));
}

export interface StoreProductPageQuery {
  page: number;
  pageSize: number;
  search?: string;
  platform?: string;
  maxPrice?: number;
  freeOnly?: boolean;
  discountsOnly?: boolean;
  tags?: string[];
  sortBy?: "relevance" | "release" | "price-low" | "price-high" | "name";
}

export async function listPublishedProductsPage(
  query: StoreProductPageQuery,
): Promise<StoreProduct[]> {
  const safePage = Math.max(0, Math.floor(query.page));
  const safePageSize = Math.max(1, Math.floor(query.pageSize));
  const from = safePage * safePageSize;
  const sortBy = query.sortBy ?? "relevance";
  const sortColumn =
    sortBy === "release"
      ? "release_date"
      : sortBy === "name"
        ? "title"
        : sortBy === "price-low" || sortBy === "price-high"
          ? "price_cents"
          : "downloads_count";
  const ascending = sortBy === "price-low" || sortBy === "name";
  let request = getSupabaseClient()
    .from("store_products")
    .select(PRODUCT_SELECT)
    .eq("status", "published");
  if (query.search?.trim()) {
    const term = query.search.trim().replace(/[%,()]/g, " ");
    request = request.or(
      `title.ilike.%${term}%,description.ilike.%${term}%,publisher.ilike.%${term}%`,
    );
  }
  if (query.platform && query.platform !== "all")
    request = request.contains("platforms", [query.platform]);
  if (query.maxPrice !== undefined && Number.isFinite(query.maxPrice))
    request = request.lte("price_cents", Math.round(query.maxPrice * 100));
  if (query.freeOnly) request = request.eq("price_cents", 0);
  if (query.discountsOnly) request = request.gt("discount_percent", 0);
  const { data, error } = await request
    .order(sortColumn, { ascending, nullsFirst: false })
    .order("id", { ascending: true })
    .range(from, from + safePageSize - 1);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapStoreProductRow(row as StoreProductRow));
}
export async function getStoreProduct(slug: string): Promise<StoreProduct | null> {
  const { data, error } = await getSupabaseClient()
    .from("store_products")
    .select(PRODUCT_SELECT)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapStoreProductRow(data as StoreProductRow) : null;
}

export async function listDeveloperProducts(): Promise<StoreProduct[]> {
  const user = await getCurrentSupabaseUser();
  if (!user) return [];
  const { data, error } = await getSupabaseClient()
    .from("store_products")
    .select(PRODUCT_SELECT)
    .eq("developer_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapStoreProductRow(row as StoreProductRow));
}

export async function createStoreProduct(
  input: Partial<StoreProduct>,
): Promise<StoreProduct | null> {
  const user = await getCurrentSupabaseUser();
  if (!user) return null;
  const { data, error } = await getSupabaseClient()
    .from("store_products")
    .insert({
      developer_id: user.id,
      title: input.title ?? "Untitled Product",
      slug: input.slug ?? `product-${crypto.randomUUID()}`,
      description: input.description ?? null,
      short_description: input.shortDescription ?? null,
      publisher: input.publisher ?? null,
      release_date: input.releaseDate ?? null,
      genres: input.genres ?? [],
      tags: input.tags ?? [],
      platforms: input.platforms ?? [],
      price_cents: input.priceCents ?? 0,
      discount_percent: input.discountPercent ?? 0,
      cover_image_url: input.coverImageUrl ?? null,
      trailer_url: input.trailerUrl ?? null,
      min_system_requirements: (input.minSystemRequirements ??
        {}) as unknown as Database["public"]["Tables"]["store_products"]["Insert"]["min_system_requirements"],
      rec_system_requirements: (input.recSystemRequirements ??
        {}) as unknown as Database["public"]["Tables"]["store_products"]["Insert"]["rec_system_requirements"],
      metadata: (input.metadata ??
        {}) as unknown as Database["public"]["Tables"]["store_products"]["Insert"]["metadata"],
    })
    .select(PRODUCT_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data ? mapStoreProductRow(data as StoreProductRow) : null;
}

export async function listMyStoreWishlist(): Promise<StoreWishlistItem[]> {
  const user = await getCurrentSupabaseUser();
  if (!user) return [];
  const { data, error } = await getSupabaseClient()
    .from("store_wishlist")
    .select(WISHLIST_SELECT)
    .eq("user_id", user.id)
    .order("added_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapStoreWishlistRow(row as StoreWishlistRow));
}

export async function addToStoreWishlist(productId: string): Promise<void> {
  const {
    data: { user },
  } = await getSupabaseClient().auth.getUser();
  if (!user) return;
  const { error } = await getSupabaseClient()
    .from("store_wishlist")
    .upsert({ user_id: user.id, product_id: productId }, { onConflict: "user_id,product_id" });
  if (error) throw new Error(error.message);
}

export async function removeFromStoreWishlist(productId: string): Promise<void> {
  const {
    data: { user },
  } = await getSupabaseClient().auth.getUser();
  if (!user) return;
  const { error } = await getSupabaseClient()
    .from("store_wishlist")
    .delete()
    .eq("user_id", user.id)
    .eq("product_id", productId);
  if (error) throw new Error(error.message);
}

export async function listMyStorePriceAlerts(): Promise<StorePriceAlert[]> {
  const {
    data: { user },
  } = await getSupabaseClient().auth.getUser();
  if (!user) return [];
  const { data, error } = await getSupabaseClient()
    .from("store_price_alerts")
    .select(PRICE_ALERT_SELECT)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapStorePriceAlertRow(row as StorePriceAlertRow));
}

export async function upsertStorePriceAlert(
  productId: string,
  targetPriceCents: number,
): Promise<void> {
  if (!Number.isFinite(targetPriceCents) || targetPriceCents <= 0)
    throw new Error("Price alert target must be greater than zero.");
  const {
    data: { user },
  } = await getSupabaseClient().auth.getUser();
  if (!user) return;
  const { error } = await getSupabaseClient()
    .from("store_price_alerts")
    .upsert(
      {
        user_id: user.id,
        product_id: productId,
        target_price_cents: Math.round(targetPriceCents),
        is_active: true,
      },
      { onConflict: "user_id,product_id" },
    );
  if (error) throw new Error(error.message);
}

export async function removeStorePriceAlert(productId: string): Promise<void> {
  const {
    data: { user },
  } = await getSupabaseClient().auth.getUser();
  if (!user) return;
  const { error } = await getSupabaseClient()
    .from("store_price_alerts")
    .update({ is_active: false })
    .eq("user_id", user.id)
    .eq("product_id", productId);
  if (error) throw new Error(error.message);
}

export async function listStoreProductReviews(productId: string): Promise<StoreReview[]> {
  const { data, error } = await getSupabaseClient()
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
  const {
    data: { user },
  } = await getSupabaseClient().auth.getUser();
  if (!user) return null;
  const { data, error } = await getSupabaseClient()
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
  const {
    data: { user },
  } = await getSupabaseClient().auth.getUser();
  if (!user) return [];
  const { data, error } = await getSupabaseClient()
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
  const { data, error } = await getSupabaseClient()
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
  const {
    data: { user },
  } = await getSupabaseClient().auth.getUser();
  if (!user) return null;
  const { data, error } = await getSupabaseClient()
    .from("store_review_reports")
    .upsert(
      {
        reporter_user_id: user.id,
        review_id: reviewId,
        reason: input.reason,
        details: input.details?.trim() || null,
      },
      { onConflict: "review_id,reporter_user_id" },
    )
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
  const body = input.body.trim();
  if (!body) throw new Error("Developer reply requires a message.");
  const {
    data: { user },
  } = await getSupabaseClient().auth.getUser();
  if (!user) return null;
  const { data, error } = await getSupabaseClient()
    .from("store_review_replies")
    .upsert(
      { review_id: reviewId, product_id: productId, developer_user_id: user.id, body },
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
  const {
    data: { user },
  } = await getSupabaseClient().auth.getUser();
  if (!user) return null;
  const { data, error } = await getSupabaseClient()
    .from("store_reviews")
    .upsert(
      {
        product_id: productId,
        user_id: user.id,
        rating: Math.max(1, Math.min(5, Math.round(input.rating))),
        title: input.title?.trim() || null,
        body: input.body?.trim() || null,
      },
      { onConflict: "product_id,user_id" },
    )
    .select(REVIEW_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data ? mapStoreReviewRow(data as StoreReviewRow) : null;
}

export async function submitDeveloperApplication(input: {
  studioName: string;
  website?: string | null;
  description?: string | null;
}): Promise<DeveloperApplication | null> {
  const {
    data: { user },
  } = await getSupabaseClient().auth.getUser();
  if (!user) return null;
  const { data, error } = await getSupabaseClient()
    .from("developer_applications")
    .upsert(
      {
        user_id: user.id,
        studio_name: input.studioName.trim(),
        website: input.website?.trim() || null,
        description: input.description?.trim() || null,
      },
      { onConflict: "user_id" },
    )
    .select(DEVELOPER_APPLICATION_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data ? mapDeveloperApplicationRow(data as DeveloperApplicationRow) : null;
}

export async function getDeveloperApplication(): Promise<DeveloperApplication | null> {
  const {
    data: { user },
  } = await getSupabaseClient().auth.getUser();
  if (!user) return null;
  const { data, error } = await getSupabaseClient()
    .from("developer_applications")
    .select(DEVELOPER_APPLICATION_SELECT)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapDeveloperApplicationRow(data as DeveloperApplicationRow) : null;
}
