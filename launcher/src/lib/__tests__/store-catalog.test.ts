import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoreProduct } from "../types/store";

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
}));

vi.mock("../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: supabaseMocks.from,
  }),
}));

import {
  listStoreCatalog,
  mapStoreCatalogRow,
  clearStoreCatalogCache,
} from "../supabase/store-catalog";

type CatalogRow = Parameters<typeof mapStoreCatalogRow>[0];

function makeRow(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    id: "catalog-row-1",
    external_id: "rawg-123",
    source: "rawg",
    title: "Catalog Game",
    slug: "catalog-game",
    description: "A catalog game.",
    short_description: "Action",
    publisher: "RAWG Katalog",
    release_date: "2026-01-15T00:00:00Z",
    genres: ["Action"],
    tags: ["RAWG"],
    platforms: ["Steam", "GOG"],
    price_cents: 1999,
    discount_percent: 25,
    cover_image_url: "https://example.com/cover.jpg",
    rating: 4.5,
    ratings_count: 100,
    downloads_count: 1000,
    metadata: { priceUnavailable: false },
    last_synced_at: "2026-01-15T00:00:00Z",
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-01-15T00:00:00Z",
    ...overrides,
  };
}

describe("store catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearStoreCatalogCache();
    supabaseMocks.order.mockResolvedValue({ data: [], error: null });
    supabaseMocks.select.mockReturnValue({ order: supabaseMocks.order });
    supabaseMocks.from.mockReturnValue({ select: supabaseMocks.select });
  });

  it("maps a catalog row to StoreProduct", () => {
    const product = mapStoreCatalogRow(makeRow());

    expect(product).toMatchObject<Partial<StoreProduct>>({
      id: "rawg-123",
      title: "Catalog Game",
      developerId: "store-catalog",
      platforms: ["Steam", "GOG"],
      priceCents: 1999,
      discountPercent: 25,
      status: "published",
      trailerUrl: null,
      minSystemRequirements: {},
      recSystemRequirements: {},
    });
  });

  it("loads and maps catalog rows from Supabase", async () => {
    supabaseMocks.order.mockResolvedValueOnce({ data: [makeRow()], error: null });

    const products = await listStoreCatalog();

    expect(products).toHaveLength(1);
    expect(products[0].id).toBe("rawg-123");
    expect(supabaseMocks.from).toHaveBeenCalledWith("store_catalog");
    expect(supabaseMocks.order).toHaveBeenCalledWith("downloads_count", { ascending: false });
  });

  it("caches the second request", async () => {
    const first = makeRow();
    supabaseMocks.order.mockResolvedValueOnce({ data: [first], error: null });

    const firstResult = await listStoreCatalog();
    const secondResult = await listStoreCatalog();

    expect(secondResult).toBe(firstResult);
    expect(supabaseMocks.from).toHaveBeenCalledTimes(1);
  });

  it("returns an empty array for an empty catalog", async () => {
    const products = await listStoreCatalog();

    expect(products).toEqual([]);
  });
});
