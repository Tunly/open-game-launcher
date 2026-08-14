/**
 * Deep module: unified store catalog querying.
 *
 * The store page previously paged two sources in lockstep (published
 * store_products + the redirect-only store_catalog) with two copy-paste
 * query builders and a batch-local dedup (`a.findIndex`) that could
 * duplicate products across pages. This module owns the whole path once:
 *
 *   queryStorePageCore() in store-query-core.ts — one paginated query
 *     core for either source table
 *   queryCatalogPage() — merges both sources, dedups across batches,
 *     and decides hasMore correctly
 */

import { mapStoreCatalogRow, type StoreCatalogRow } from "./store-catalog";
import { mapStoreProductRow } from "./store";
import { queryStorePageCore, type StorePageQuery, type StoreSourceSpec } from "./store-query-core";
import { filterSupportedPlatforms, isKeyResellerName } from "../store-api";
import type { StoreProduct } from "../types/store";

export type { StorePageQuery } from "./store-query-core";

/** Same semantics as storeHelpers.keepNonKeyshopPlatforms: drop key-reseller
 * listings and products whose only platforms are unsupported. Kept local so
 * the visibility rules live in the query module, not in the page. */
function keepNonKeyshopPlatforms(product: StoreProduct): StoreProduct | null {
  const metadataLinks = [
    product.metadata.purchaseUrl,
    product.metadata.storeUrl,
    product.metadata.platformUrl,
    product.metadata.buyUrl,
  ];
  const platformLinks = [
    product.metadata.platformUrls,
    product.metadata.storeUrls,
    product.metadata.storeLinks,
    product.metadata.platformLinks,
    product.metadata.urls,
  ].flatMap((v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.values(v) : []));
  const storeDetails = [
    product.publisher,
    product.shortDescription,
    ...metadataLinks,
    ...platformLinks,
  ].filter((v): v is string => typeof v === "string");
  if (storeDetails.some(isKeyResellerName)) return null;
  return filterSupportedPlatforms(product);
}

export interface CatalogPageResult {
  /** New (cross-batch-deduped) products for this page. */
  products: StoreProduct[];
  /** True when at least one source still has more rows to offer. */
  hasMore: boolean;
  /** True when both sources failed; the page should show an error. */
  bothFailed: boolean;
  /** Rows returned by each source before dedup (for diagnostics). */
  hostedCount: number;
  catalogCount: number;
}

const CATALOG_SELECT = `id, external_id, source, title, slug, description, short_description,
  publisher, release_date, genres, tags, platforms, price_cents, discount_percent,
  cover_image_url, rating, ratings_count, downloads_count, metadata, last_synced_at,
  created_at, updated_at`;

const PRODUCT_SELECT = `id, title, slug, description, short_description, developer_id, publisher,
  release_date, genres, tags, platforms, price_cents, discount_percent, cover_image_url,
  trailer_url, min_system_requirements, rec_system_requirements,
  rating, ratings_count, downloads_count, status, metadata, created_at, updated_at`;

const SOURCES: StoreSourceSpec[] = [
  {
    table: "store_products",
    select: PRODUCT_SELECT,
    idColumn: "id",
    status: "published",
    map: (row) => mapStoreProductRow(row as Parameters<typeof mapStoreProductRow>[0]),
  },
  {
    table: "store_catalog",
    select: CATALOG_SELECT,
    idColumn: "external_id",
    map: (row) => mapStoreCatalogRow(row as StoreCatalogRow),
  },
];

/**
 * Fetch one merged catalog page from both sources.
 *
 * `seenIds` accumulates every product id already handed to the caller
 * (across previous pages), so a product present in both sources can never
 * be returned twice — the batch-local dedup bug this replaces. The caller
 * owns the Set and must keep passing the same one for the whole session.
 *
 * `hasMore` is true only while at least one source still returns a full
 * page; the page body decides whether that row was already seen.
 */
export async function queryCatalogPage(
  query: StorePageQuery,
  seenIds: Set<string>,
): Promise<CatalogPageResult> {
  const pageSize = Math.max(1, Math.floor(query.pageSize));
  const [hosted, catalog] = await Promise.allSettled(
    SOURCES.map((spec) => queryStorePageCore(spec, query)),
  );

  const hostedP = hosted.status === "fulfilled" ? hosted.value : [];
  const catalogP = catalog.status === "fulfilled" ? catalog.value : [];

  // Visibility filtering lives here: hide key-reseller listings and
  // products whose only platforms are unsupported (previously done by the
  // page's keepNonKeyshopPlatforms on each batch).
  const visible = [...hostedP, ...catalogP]
    .map((product) => keepNonKeyshopPlatforms(product))
    .filter((product): product is StoreProduct => product !== null);

  const products: StoreProduct[] = [];
  for (const product of visible) {
    if (seenIds.has(product.id)) continue;
    seenIds.add(product.id);
    products.push(product);
  }

  const hostedFull = hostedP.length === pageSize;
  const catalogFull = catalogP.length === pageSize;

  return {
    products,
    hasMore: hostedFull || catalogFull,
    bothFailed: hosted.status === "rejected" && catalog.status === "rejected",
    hostedCount: hostedP.length,
    catalogCount: catalogP.length,
  };
}
