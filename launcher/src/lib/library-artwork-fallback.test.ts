import { describe, expect, it } from "vitest";
import { applyArtworkFallback, getSteamArtworkFallback } from "./library-artwork-fallback";
import type { Game } from "./types";

const game: Game = {
  id: "manual-1",
  title: "A Very Long Game Title",
  description: "",
  version: "",
  status: "installed",
  platform: "windows",
  launcher: "manual",
};

describe("applyArtworkFallback", () => {
  it("uses the official Steam CDN for a Steam game without artwork", () => {
    const steamGame = { ...game, id: "steam-730", launcher: "steam" as const };
    const result = applyArtworkFallback(steamGame);

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

  it("uses a remote image fallback for non-Steam games", () => {
    const result = applyArtworkFallback(game);
    expect(result.coverUrl).toMatch(/^https:\/\/placehold\.co\/600x338\//);
  });

  it("does not replace existing provider artwork", () => {
    const withArtwork = { ...game, coverUrl: "https://cdn.example/cover.jpg" };
    expect(applyArtworkFallback(withArtwork)).toMatchObject(withArtwork);
    expect(applyArtworkFallback(withArtwork).iconUrls).toHaveLength(1);
    expect(applyArtworkFallback(withArtwork).iconUrls?.[0]).toMatch(/^https:\/\/placehold\.co\//);
  });
});
