import { isTauri } from "@tauri-apps/api/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  normalizeGamePassCatalogGames,
  serializeGamePassCatalogCache,
} from "../../../lib/game-pass-catalog-cache";
import { groupGames } from "../../../lib/game-groups";
import { STORAGE_KEYS } from "../../../lib/storage-keys";
import type { Game } from "../../../lib/types";
import { mergeGamePassCatalog } from "../gamepass";
import type { MergeContext } from "../types";

const fetchGamePassCatalog = vi.fn();

vi.mock("../../../lib/launcher", () => ({
  fetchGamePassCatalog: (...args: unknown[]) => fetchGamePassCatalog(...args),
}));

function makeContext(overrides: Partial<MergeContext> = {}): MergeContext {
  return {
    forceRefresh: false,
    setStatusMessage: vi.fn(),
    shouldApplyResult: () => true,
    ...overrides,
  };
}

function ownedCatalogGame(overrides: Record<string, unknown> = {}) {
  return {
    id: "xbox-9NBLGGH4R315",
    externalId: "9NBLGGH4R315",
    title: "Forza Horizon 5",
    description: "PC Game Pass catalog",
    coverUrl: "https://store-images.example/forza.jpg",
    logoUrl: "https://store-images.example/forza-logo.png",
    iconUrl: null,
    playtimeMinutes: null,
    lastPlayedAt: null,
    cloudGamingUrl: null,
    ...overrides,
  };
}

function installedXboxGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "xbox-Forza Horizon 5",
    title: "Forza Horizon 5 (PC)",
    description: "",
    version: "1.0",
    status: "installed",
    platform: "windows",
    launcher: "xbox",
    ...overrides,
  } as Game;
}

describe("mergeGamePassCatalog", () => {
  beforeEach(() => {
    window.localStorage.clear();
    fetchGamePassCatalog.mockReset();
    vi.mocked(isTauri).mockReturnValue(false);
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("merges a fresh cache as installable Xbox games without a network call", async () => {
    const now = Date.now();
    localStorage.setItem(
      STORAGE_KEYS.GAME_PASS_CATALOG_CACHE,
      serializeGamePassCatalogCache(
        { games: normalizeGamePassCatalogGames([ownedCatalogGame()]), fetchedAt: now },
        now,
      ),
    );

    const result = await mergeGamePassCatalog([], makeContext());

    expect(fetchGamePassCatalog).not.toHaveBeenCalled();
    expect(result.games).toEqual([
      expect.objectContaining({
        id: "xbox-9NBLGGH4R315",
        externalId: "9NBLGGH4R315",
        catalogSource: "pc_game_pass",
        launcher: "xbox",
        productCategory: "game",
        status: "not_installed",
      }),
    ]);
  });

  it("fetches and versions a missing cache in the desktop app", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    fetchGamePassCatalog.mockResolvedValueOnce([ownedCatalogGame()]);

    const result = await mergeGamePassCatalog([], makeContext());

    expect(result.games).toHaveLength(1);
    const cached = JSON.parse(localStorage.getItem(STORAGE_KEYS.GAME_PASS_CATALOG_CACHE) ?? "null");
    expect(cached).toMatchObject({ version: 1, games: [expect.any(Object)] });
  });

  it("keeps fetched catalog games when local cache persistence fails", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    fetchGamePassCatalog.mockResolvedValueOnce([ownedCatalogGame()]);
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    const result = await mergeGamePassCatalog([], makeContext());

    expect(result.games).toHaveLength(1);
    expect(result.warnings).toContainEqual(expect.stringContaining("quota exceeded"));
  });

  it("uses stale catalog data when refresh fails", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    localStorage.setItem(
      STORAGE_KEYS.GAME_PASS_CATALOG_CACHE,
      JSON.stringify([ownedCatalogGame()]),
    );
    fetchGamePassCatalog.mockRejectedValueOnce(new Error("offline"));

    const result = await mergeGamePassCatalog([], makeContext());

    expect(result.games).toHaveLength(1);
    expect(result.warnings[0]).toContain("offline");
    expect(result.statusMessage).toBeNull();
  });

  it("reports an unavailable catalog without hiding installed games", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    fetchGamePassCatalog.mockRejectedValueOnce(new Error("offline"));
    const installed = installedXboxGame({ id: "xbox-installed" });

    const result = await mergeGamePassCatalog([installed], makeContext());

    expect(result.games).toEqual([installed]);
    expect(result.statusMessage).toContain("catalog is unavailable");
  });

  it("deduplicates installed titles while filling their missing catalog artwork", async () => {
    localStorage.setItem(
      STORAGE_KEYS.GAME_PASS_CATALOG_CACHE,
      JSON.stringify([ownedCatalogGame()]),
    );
    const installed = installedXboxGame();

    const result = await mergeGamePassCatalog([installed], makeContext());

    expect(result.games).toHaveLength(1);
    expect(result.games[0]).toMatchObject({
      id: installed.id,
      status: "installed",
      catalogSource: "pc_game_pass",
      coverUrl: "https://store-images.example/forza.jpg",
      logoUrl: "https://store-images.example/forza-logo.png",
      productCategory: "game",
    });
  });

  it("keeps an installed Xbox product category while adding catalog membership", async () => {
    localStorage.setItem(
      STORAGE_KEYS.GAME_PASS_CATALOG_CACHE,
      JSON.stringify([ownedCatalogGame()]),
    );
    const installed = installedXboxGame({ productCategory: "software" });

    const result = await mergeGamePassCatalog([installed], makeContext());

    expect(result.games[0]).toMatchObject({
      catalogSource: "pc_game_pass",
      productCategory: "software",
    });
  });

  it("classifies catalog rows as games so same-title store variants group together", async () => {
    localStorage.setItem(
      STORAGE_KEYS.GAME_PASS_CATALOG_CACHE,
      JSON.stringify([ownedCatalogGame()]),
    );
    const steamVariant = installedXboxGame({
      id: "steam-1551360",
      launcher: "steam",
      productCategory: "game",
      title: "Forza Horizon 5",
    });

    const result = await mergeGamePassCatalog([steamVariant], makeContext());
    const groups = groupGames(result.games);

    expect(groups).toHaveLength(1);
    expect(groups[0].variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "steam-1551360" }),
        expect.objectContaining({
          catalogSource: "pc_game_pass",
          id: "xbox-9NBLGGH4R315",
          productCategory: "game",
        }),
      ]),
    );
  });

  it("keeps the first catalog ProductId when legacy cache rows share a title", async () => {
    localStorage.setItem(
      STORAGE_KEYS.GAME_PASS_CATALOG_CACHE,
      JSON.stringify([
        ownedCatalogGame({
          externalId: "9MXMZ39GVHPG",
          id: "xbox-9MXMZ39GVHPG",
          title: "Brawlhalla",
        }),
        ownedCatalogGame({
          externalId: "C3B1V55CDL0C",
          id: "xbox-C3B1V55CDL0C",
          title: "Brawlhalla",
        }),
      ]),
    );

    const result = await mergeGamePassCatalog([], makeContext());

    expect(result.games).toEqual([
      expect.objectContaining({
        id: "xbox-9MXMZ39GVHPG",
        title: "Brawlhalla",
      }),
    ]);
  });

  it("does not persist or apply a fetch after the caller is cancelled", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    fetchGamePassCatalog.mockResolvedValueOnce([ownedCatalogGame()]);

    const result = await mergeGamePassCatalog([], makeContext({ shouldApplyResult: () => false }));

    expect(result.games).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEYS.GAME_PASS_CATALOG_CACHE)).toBeNull();
  });
});
