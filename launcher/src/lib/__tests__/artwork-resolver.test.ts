import { describe, expect, it } from "vitest";

import {
  applyArtworkFallback,
  getKnownProviderArtworkCandidates,
  getSteamArtworkFallback,
  getSteamArtworkFallbacks,
  resolveGameArtwork,
} from "../artwork-resolver";
import { STEAM_APP_IDS_BY_TITLE } from "../artwork-title-map";
import { steamArtworkUrl, steamArtworkUrls } from "../steam-artwork-urls";
import type { Game } from "../types";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "manual-1",
    title: "Test Game",
    description: "",
    version: "",
    status: "installed",
    platform: "windows",
    launcher: "manual",
    ...overrides,
  } as Game;
}

describe("steamArtworkUrl / steamArtworkUrls", () => {
  it("builds a single URL for a kind", () => {
    expect(steamArtworkUrl("440", "header")).toBe(
      "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/440/header.jpg",
    );
  });

  it("keeps header first in the candidate list", () => {
    const urls = steamArtworkUrls("440");
    expect(urls[0]).toBe(steamArtworkUrl("440", "header"));
    expect(urls).toHaveLength(8);
  });

  it("rejects non-numeric ids", () => {
    expect(getSteamArtworkFallbacks({ id: "steam-abc", launcher: "steam" })).toEqual([]);
  });
});

describe("getSteamArtworkFallbacks", () => {
  it("uses the official Steam CDN for a Steam game without artwork", () => {
    const result = applyArtworkFallback({ ...makeGame({ id: "steam-730", launcher: "steam" }) });
    expect(result.coverUrl).toBe(
      "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/730/header.jpg",
    );
    expect(result.iconUrl).toBe(result.coverUrl);
  });

  it("derives the Steam app id from the external id", () => {
    expect(
      getSteamArtworkFallback({ id: "steam-owned-x", launcher: "steam", externalId: "440" }),
    ).toBe("https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/440/header.jpg");
  });

  it("returns nothing for non-Steam games", () => {
    expect(getSteamArtworkFallbacks(makeGame())).toEqual([]);
  });
});

describe("applyArtworkFallback", () => {
  it("uses a remote image fallback for non-Steam games", () => {
    const result = applyArtworkFallback(makeGame());
    expect(result.coverUrl).toMatch(/^https:\/\/placehold\.co\/600x338\//);
  });

  it("does not replace existing provider artwork", () => {
    const withArtwork = { ...makeGame(), coverUrl: "https://cdn.example/cover.jpg" };
    expect(applyArtworkFallback(withArtwork)).toMatchObject(withArtwork);
    expect(applyArtworkFallback(withArtwork).iconUrls).toHaveLength(1);
    expect(applyArtworkFallback(withArtwork).iconUrls?.[0]).toMatch(/^https:\/\/placehold\.co\//);
  });
});

describe("getKnownProviderArtworkCandidates", () => {
  it("looks up the title map as data", () => {
    expect(STEAM_APP_IDS_BY_TITLE["portal 2"]).toBe("620");
    const candidates = getKnownProviderArtworkCandidates({ title: "Portal 2" });
    expect(candidates[0]).toBe(
      "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/620/header.jpg",
    );
  });

  it("matches prefixes for decorated titles", () => {
    const candidates = getKnownProviderArtworkCandidates({ title: "Call of Duty®" });
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("returns nothing for unknown titles", () => {
    expect(getKnownProviderArtworkCandidates({ title: "Totally Unknown Game 12345" })).toEqual([]);
  });
});

describe("resolveGameArtwork strategy order", () => {
  const titleMapGame = makeGame({ title: "Portal 2", launcher: "epic", id: "epic-portal-2" });

  it("custom override beats IGDB beats title map", () => {
    const result = resolveGameArtwork(titleMapGame, {
      custom: { coverUrl: "https://cdn.example/custom.jpg" },
      igdb: { coverUrl: "https://cdn.example/igdb.jpg" },
    });
    expect(result.coverUrl).toBe("https://cdn.example/custom.jpg");
  });

  it("IGDB fills gaps when no custom override exists", () => {
    const result = resolveGameArtwork(titleMapGame, {
      igdb: { coverUrl: "https://cdn.example/igdb.jpg" },
    });
    expect(result.coverUrl).toBe("https://cdn.example/igdb.jpg");
  });

  it("title map fills gaps when neither custom nor IGDB exist", () => {
    const result = resolveGameArtwork(titleMapGame);
    expect(result.coverUrl).toBe(
      "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/620/header.jpg",
    );
  });

  it("falls back to placeholder for unknown titles without sources", () => {
    const result = resolveGameArtwork(makeGame());
    expect(result.coverUrl).toMatch(/^https:\/\/placehold\.co\//);
  });

  it("id-derived Steam wins over placeholder for Steam games", () => {
    const result = resolveGameArtwork(makeGame({ id: "steam-440", launcher: "steam" }));
    expect(result.coverUrl).toBe(
      "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/440/header.jpg",
    );
  });

  it("keeps existing artwork untouched when all sources are empty", () => {
    const withArtwork = { ...titleMapGame, coverUrl: "https://cdn.example/existing.jpg" };
    const result = resolveGameArtwork(withArtwork);
    expect(result.coverUrl).toBe("https://cdn.example/existing.jpg");
  });
});
