import { describe, expect, it } from "vitest";
import {
  effectivePrice,
  extractProductScreenshots,
  formatPlatformDisplayName,
  getAllPlatformPurchaseUrls,
  isGameInLibrary,
  mapProductToGame,
} from "./storeHelpers";
import type { StoreProduct } from "../../lib/types/store";
import type { Game } from "../../lib/types";

function makeProduct(overrides: Partial<StoreProduct> = {}): StoreProduct {
  return {
    id: "prod-1",
    title: "Cyber Samurai",
    slug: "cyber-samurai",
    description: "A fast-paced katana action game.",
    shortDescription: "Action Hack-and-Slash",
    developerId: "dev-1",
    publisher: "Cyber Corp",
    releaseDate: "2026-06-15",
    genres: ["Action", "Cyberpunk"],
    tags: ["Singleplayer", "Difficult"],
    platforms: ["Steam", "GOG", "Epic Games"],
    priceCents: 2999,
    discountPercent: 20,
    coverImageUrl: "https://example.com/cover.jpg",
    trailerUrl: null,
    minSystemRequirements: { OS: "Windows 10", Memory: "8 GB" },
    recSystemRequirements: { OS: "Windows 11", Memory: "16 GB" },
    rating: 4.8,
    ratingsCount: 450,
    downloadsCount: 12000,
    status: "published",
    metadata: {
      screenshots: ["https://example.com/screen1.jpg", "https://example.com/screen2.jpg"],
      platformUrls: {
        Steam: "https://store.steampowered.com/app/12345",
        GOG: "https://www.gog.com/game/cyber_samurai",
      },
    },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("storeHelpers", () => {
  it("calculates effective price taking discount into account", () => {
    const product = makeProduct({ priceCents: 2000, discountPercent: 25 });
    expect(effectivePrice(product)).toBe(15);
  });

  it("formats platform display names nicely", () => {
    expect(formatPlatformDisplayName("steam")).toBe("Steam");
    expect(formatPlatformDisplayName("gog")).toBe("GOG");
    expect(formatPlatformDisplayName("epic games")).toBe("Epic Games");
    expect(formatPlatformDisplayName("battle.net")).toBe("Battle.net");
  });

  it("extracts all valid platform purchase links", () => {
    const product = makeProduct();
    const links = getAllPlatformPurchaseUrls(product);

    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links.some((l) => l.platform === "steam" && l.url.includes("steampowered"))).toBe(true);
    expect(links.some((l) => l.platform === "gog" && l.url.includes("gog.com"))).toBe(true);
  });

  it("extracts screenshots from metadata and falls back to cover image", () => {
    const product = makeProduct();
    const shots = extractProductScreenshots(product);
    expect(shots).toHaveLength(2);
    expect(shots[0]).toBe("https://example.com/screen1.jpg");

    const fallbackProduct = makeProduct({ metadata: {} });
    const fallbackShots = extractProductScreenshots(fallbackProduct);
    expect(fallbackShots).toHaveLength(1);
    expect(fallbackShots[0]).toBe("https://example.com/cover.jpg");
  });

  it("detects when a game is in the installed library", () => {
    const installedGames: Game[] = [
      {
        id: "steam-12345",
        title: "Cyber Samurai",
        platform: "Steam",
        description: "",
        version: "",
        status: "installed",
      },
    ];

    const product = makeProduct();
    expect(isGameInLibrary(product, installedGames)).toBe(true);

    const game = mapProductToGame(product);
    expect(isGameInLibrary(game, installedGames)).toBe(true);

    const notInstalled = makeProduct({ title: "Unrelated Racing 2026" });
    expect(isGameInLibrary(notInstalled, installedGames)).toBe(false);
  });
});
