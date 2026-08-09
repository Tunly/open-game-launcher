import { describe, expect, it } from "vitest";

import {
  filterSupportedPlatforms,
  isKeyResellerName,
  normalizeSupportedPlatform,
} from "./store-api";
import type { StoreProduct } from "./types/store";

function makeProduct(platforms: string[]): StoreProduct {
  return {
    id: "product-1",
    title: "Test Game",
    slug: "test-game",
    description: null,
    shortDescription: null,
    developerId: "developer-1",
    publisher: null,
    releaseDate: null,
    genres: [],
    tags: [],
    platforms,
    priceCents: 0,
    discountPercent: 0,
    coverImageUrl: null,
    trailerUrl: null,
    minSystemRequirements: {},
    recSystemRequirements: {},
    rating: null,
    ratingsCount: 0,
    downloadsCount: 0,
    status: "published",
    metadata: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("store platform helpers", () => {
  it("normalizes supported platform aliases", () => {
    expect(normalizeSupportedPlatform("steam store")).toBe("Steam");
    expect(normalizeSupportedPlatform("battle-net")).toBe("Battle.net");
    expect(normalizeSupportedPlatform("PlayStation")).toBeNull();
  });

  it("filters unsupported platforms", () => {
    const filtered = filterSupportedPlatforms(makeProduct(["Steam", "PlayStation", "Nintendo"]));
    expect(filtered).not.toBeNull();
    expect(filtered?.platforms).toEqual(["Steam"]);
    expect(filterSupportedPlatforms(makeProduct(["PlayStation", "Nintendo"]))).toBeNull();
  });

  it("identifies key reseller names", () => {
    expect(isKeyResellerName("https://www.g2a.com/example")).toBe(true);
    expect(isKeyResellerName("Steam Store")).toBe(false);
  });
});
