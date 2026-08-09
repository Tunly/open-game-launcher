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
