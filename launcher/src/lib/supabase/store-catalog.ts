import { getSupabaseClient } from "./client";
import type { StoreProduct } from "../types/store";

export interface StoreCatalogRow {
  id: string;
  external_id: string;
  source: string;
  title: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  publisher: string | null;
  release_date: string | null;
  genres: string[] | null;
  tags: string[] | null;
  platforms: string[] | null;
  price_cents: number;
  discount_percent: number;
  cover_image_url: string | null;
  rating: number | null;
  ratings_count: number;
  downloads_count: number;
  metadata: unknown;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

const STORE_CATALOG_SELECT = `id, external_id, source, title, slug, description, short_description,
  publisher, release_date, genres, tags, platforms, price_cents, discount_percent,
  cover_image_url, rating, ratings_count, downloads_count, metadata, last_synced_at,
  created_at, updated_at`;

const STORE_CATALOG_CACHE_TTL_MS = 5 * 60_000;
let storeCatalogCache: { data: StoreProduct[]; expiresAt: number } | null = null;
let storeCatalogRequest: Promise<StoreProduct[]> | null = null;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function mapStoreCatalogRow(row: StoreCatalogRow): StoreProduct {
  return {
    id: row.external_id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    shortDescription: row.short_description,
    developerId: "store-catalog",
    publisher: row.publisher,
    releaseDate: row.release_date,
    genres: row.genres ?? [],
    tags: row.tags ?? [],
    platforms: row.platforms ?? [],
    priceCents: row.price_cents,
    discountPercent: row.discount_percent,
    coverImageUrl: row.cover_image_url,
    trailerUrl: null,
    minSystemRequirements: {},
    recSystemRequirements: {},
    rating: row.rating,
    ratingsCount: row.ratings_count,
    downloadsCount: row.downloads_count,
    status: "published",
    metadata: asRecord(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function clearStoreCatalogCache() {
  storeCatalogCache = null;
  storeCatalogRequest = null;
}

export async function listStoreCatalog(): Promise<StoreProduct[]> {
  if (storeCatalogCache && storeCatalogCache.expiresAt > Date.now()) return storeCatalogCache.data;
  if (storeCatalogRequest) return storeCatalogRequest;

  storeCatalogRequest = loadStoreCatalog();
  try {
    const products = await storeCatalogRequest;
    storeCatalogCache = { data: products, expiresAt: Date.now() + STORE_CATALOG_CACHE_TTL_MS };
    return products;
  } finally {
    storeCatalogRequest = null;
  }
}

async function loadStoreCatalog(): Promise<StoreProduct[]> {
  const { data, error } = await getSupabaseClient()
    .from("store_catalog")
    .select(STORE_CATALOG_SELECT)
    .order("downloads_count", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as StoreCatalogRow[]).map(mapStoreCatalogRow);
}

export interface StoreCatalogPageQuery {
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

export async function listStoreCatalogPage(query: StoreCatalogPageQuery): Promise<StoreProduct[]> {
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
  let request = getSupabaseClient().from("store_catalog").select(STORE_CATALOG_SELECT);
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
  if (query.tags?.length) request = request.contains("tags", query.tags);
  const { data, error } = await request
    .order(sortColumn, { ascending, nullsFirst: false })
    .order("external_id", { ascending: true })
    .range(from, from + safePageSize - 1);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as StoreCatalogRow[]).map(mapStoreCatalogRow);
}
