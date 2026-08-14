/**
 * Shared paginated query core for store source tables.
 *
 * Both the published store_products table and the redirect-only
 * store_catalog table are paged with identical filter/sort/range logic;
 * they used to be two copy-paste builders. This module owns that logic
 * once. The row mapper is passed in per source so this core stays free of
 * imports from store.ts / store-catalog.ts (no module cycle).
 *
 * The typed Supabase builder rejects a dynamic table name (the two tables
 * have different row shapes), so the core narrows it to the shared
 * filter/sort surface via a minimal structural type. It only ever touches
 * columns both tables have.
 */

import { getSupabaseClient } from "./client";
import type { StoreProduct } from "../types/store";

export interface StorePageQuery {
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

export interface StoreSourceSpec {
  table: "store_products" | "store_catalog";
  select: string;
  /** Column used for the stable id tie-break after the sort column. */
  idColumn: string;
  /** Optional status filter (store_products only). */
  status?: string;
  map: (row: unknown) => StoreProduct;
}

/** Minimal builder surface shared by both store tables. */
interface FilterableQuery {
  eq(column: string, value: unknown): FilterableQuery;
  or(filter: string): FilterableQuery;
  contains(column: string, value: unknown[]): FilterableQuery;
  lte(column: string, value: number): FilterableQuery;
  gt(column: string, value: number): FilterableQuery;
  order(column: string, options: { ascending: boolean; nullsFirst: boolean }): FilterableQuery;
  range(from: number, to: number): FilterableQuery;
}

type QueryResult = Promise<{ data: unknown[] | null; error: { message: string } | null }>;

export async function queryStorePageCore(
  spec: StoreSourceSpec,
  query: StorePageQuery,
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
    .from(spec.table)
    .select(spec.select) as unknown as FilterableQuery;
  if (spec.status) request = request.eq("status", spec.status);
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

  const result = await (request
    .order(sortColumn, { ascending, nullsFirst: false })
    .order(spec.idColumn, { ascending: true, nullsFirst: false })
    .range(from, from + safePageSize - 1) as unknown as QueryResult);
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []).map(spec.map);
}
