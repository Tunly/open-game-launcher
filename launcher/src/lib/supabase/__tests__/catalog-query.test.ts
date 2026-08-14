import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("../client", () => ({
  getCurrentSessionUserId: () => null,
  getSupabaseClient: () => ({ from: mocks.from }),
  isSupabaseConfigured: true,
}));

import { queryCatalogPage } from "../catalog-query";
import type { StoreProduct } from "../../types/store";

function makeStoreProduct(overrides: Partial<StoreProduct>): StoreProduct {
  return {
    id: overrides.id ?? "product-1",
    title: "Game",
    slug: "game",
    description: null,
    shortDescription: null,
    developerId: "dev-1",
    publisher: null,
    releaseDate: null,
    genres: [],
    tags: [],
    platforms: ["steam"],
    priceCents: 1999,
    discountPercent: 0,
    coverImageUrl: null,
    trailerUrl: null,
    minSystemRequirements: {},
    recSystemRequirements: {},
    rating: null,
    ratingsCount: 0,
    downloadsCount: 10,
    status: "published",
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Builds a Supabase chain mock that resolves the given data per table. */
function makeChain(
  dataByTable: Record<string, unknown[]>,
  errorByTable: Record<string, { message: string }> = {},
) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    or: vi.fn(),
    contains: vi.fn(),
    lte: vi.fn(),
    gt: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.or.mockReturnValue(chain);
  chain.contains.mockReturnValue(chain);
  chain.lte.mockReturnValue(chain);
  chain.gt.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.range.mockImplementation(() => Promise.resolve({ data: null, error: null }));

  mocks.from.mockImplementation((table: string) => {
    const chainForTable = { ...chain };
    const error = errorByTable[table];
    chainForTable.range.mockResolvedValue(
      error ? { data: null, error } : { data: dataByTable[table] ?? [], error: null },
    );
    return chainForTable;
  });
  return chain;
}

function makeCatalogRow(id: string, title: string) {
  return {
    id: `row-${id}`,
    external_id: id,
    source: "itad",
    title,
    slug: title.toLowerCase().replace(/\s+/g, "-"),
    description: null,
    short_description: null,
    publisher: null,
    release_date: null,
    genres: null,
    tags: null,
    platforms: ["steam"],
    price_cents: 1999,
    discount_percent: 0,
    cover_image_url: null,
    rating: null,
    ratings_count: 0,
    downloads_count: 10,
    metadata: {},
    last_synced_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

const baseQuery = { page: 0, pageSize: 10 };

beforeEach(() => {
  mocks.from.mockReset();
});

describe("queryCatalogPage", () => {
  it("merges both sources and dedups within a batch", async () => {
    const shared = makeStoreProduct({ id: "shared-1", title: "Shared Game" });
    const hostedOnly = makeStoreProduct({ id: "hosted-1", title: "Hosted Game" });
    makeChain({
      store_products: [shared, hostedOnly],
      store_catalog: [
        makeCatalogRow("shared-1", "Shared Game"),
        makeCatalogRow("catalog-1", "Catalog Game"),
      ],
    });

    const seen = new Set<string>();
    const result = await queryCatalogPage(baseQuery, seen);

    expect(result.products.map((p) => p.id)).toEqual(["shared-1", "hosted-1", "catalog-1"]);
    expect(seen.size).toBe(3);
    expect(result.hostedCount).toBe(2);
    expect(result.catalogCount).toBe(2);
    expect(result.bothFailed).toBe(false);
  });

  it("never returns the same product twice across pages (cross-batch dedup)", async () => {
    // Page 0: product in both sources.
    const dup = makeStoreProduct({ id: "dup-1", title: "Dup Game" });
    const other = makeStoreProduct({ id: "other-1", title: "Other Game" });
    makeChain({
      store_products: [dup],
      store_catalog: [makeCatalogRow("dup-1", "Dup Game")],
    });

    const seen = new Set<string>();
    const page0 = await queryCatalogPage(baseQuery, seen);
    expect(page0.products.map((p) => p.id)).toEqual(["dup-1"]);

    // Page 1: the same product surfaces again from the catalog source.
    makeChain({
      store_products: [other],
      store_catalog: [makeCatalogRow("dup-1", "Dup Game")],
    });
    const page1 = await queryCatalogPage({ ...baseQuery, page: 1 }, seen);

    // The dup is already seen -> only the new product is returned.
    expect(page1.products.map((p) => p.id)).toEqual(["other-1"]);
    expect(seen.size).toBe(2);
  });

  it("reports hasMore while any source returns a full page", async () => {
    const full = Array.from({ length: 10 }, (_, i) => makeStoreProduct({ id: `full-${i}` }));
    makeChain({
      store_products: full,
      store_catalog: [],
    });

    const seen = new Set<string>();
    const result = await queryCatalogPage(baseQuery, seen);
    expect(result.hasMore).toBe(true);
  });

  it("reports bothFailed when both sources reject", async () => {
    makeChain(
      {
        store_products: [],
        store_catalog: [],
      },
      {
        store_products: { message: "boom" },
        store_catalog: { message: "boom" },
      },
    );

    const seen = new Set<string>();
    const result = await queryCatalogPage(baseQuery, seen);
    expect(result.products).toEqual([]);
    expect(result.bothFailed).toBe(true);
  });
});
