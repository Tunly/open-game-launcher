import { describe, expect, it } from "vitest";

import {
  GAME_PASS_CATALOG_CACHE_MAX_AGE_MS,
  GAME_PASS_CATALOG_RETRY_DELAY_MS,
  normalizeGamePassCatalogGames,
  readGamePassCatalogCache,
  serializeGamePassCatalogCache,
} from "../game-pass-catalog-cache";

function catalogGame(id = "9NBLGGH4R315", title = "Forza Horizon 5") {
  return {
    id: `gamepass-${id}`,
    externalId: id,
    title,
    description: "",
    coverUrl: "//store-images.example/cover",
    logoUrl: null,
    cloudGamingUrl: "https://www.xbox.com/play",
  };
}

describe("Game Pass catalog cache", () => {
  it("migrates legacy catalog rows to Xbox Store product IDs", () => {
    expect(normalizeGamePassCatalogGames([catalogGame()])).toEqual([
      expect.objectContaining({
        id: "xbox-9NBLGGH4R315",
        externalId: "9NBLGGH4R315",
        title: "Forza Horizon 5",
        catalogSource: "pc_game_pass",
        cloudGamingUrl: null,
      }),
    ]);
  });

  it("drops malformed rows and deduplicates product IDs case-insensitively", () => {
    const games = normalizeGamePassCatalogGames([
      null,
      {},
      catalogGame("bad", "Invalid"),
      catalogGame(),
      { ...catalogGame(), externalId: "9nblggh4r315", title: "Duplicate" },
    ]);

    expect(games).toHaveLength(1);
    expect(games[0].title).toBe("Forza Horizon 5");
  });

  it("treats a versioned recent cache as fresh", () => {
    const now = 2_000_000;
    const raw = serializeGamePassCatalogCache(
      { games: normalizeGamePassCatalogGames([catalogGame()]), fetchedAt: now - 1_000 },
      now - 1_000,
    );

    expect(readGamePassCatalogCache(raw, now)).toMatchObject({
      isFresh: true,
      shouldRefresh: false,
      fetchedAt: now - 1_000,
      lastAttemptedAt: now - 1_000,
    });
  });

  it("refreshes legacy arrays and stale versioned caches", () => {
    const now = GAME_PASS_CATALOG_CACHE_MAX_AGE_MS + 10_000;
    expect(readGamePassCatalogCache(JSON.stringify([catalogGame()]), now)).toMatchObject({
      games: [expect.objectContaining({ id: "xbox-9NBLGGH4R315" })],
      isFresh: false,
      shouldRefresh: true,
    });

    const stale = serializeGamePassCatalogCache(
      { games: normalizeGamePassCatalogGames([catalogGame()]), fetchedAt: 1 },
      1,
    );
    expect(readGamePassCatalogCache(stale, now).shouldRefresh).toBe(true);
  });

  it("backs off briefly after a failed refresh attempt", () => {
    const now = 5_000_000;
    const raw = serializeGamePassCatalogCache({ games: [], fetchedAt: null }, now - 1_000);
    const waiting = readGamePassCatalogCache(raw, now);
    expect(waiting.isFresh).toBe(false);
    expect(waiting.shouldRefresh).toBe(false);

    expect(
      readGamePassCatalogCache(raw, now + GAME_PASS_CATALOG_RETRY_DELAY_MS).shouldRefresh,
    ).toBe(true);
  });
});
