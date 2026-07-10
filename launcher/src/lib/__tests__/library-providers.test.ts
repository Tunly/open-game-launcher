import { describe, expect, it } from "vitest";

import { ownedGameToGame } from "../library-providers";

describe("ownedGameToGame", () => {
  it("does not attach a launch URI to uninstalled Ubisoft owned games", () => {
    const game = ownedGameToGame({
      id: "ubisoft-owned-635",
      externalId: "635",
      title: "Rainbow Six Siege",
      description: "",
      coverUrl: null,
      logoUrl: null,
      lastPlayedAt: null,
    });

    expect(game.launcher).toBe("ubisoft");
    expect(game.status).toBe("not_installed");
    expect(game.launchUri).toBeUndefined();
    expect(game.playtimeMinutes).toBeUndefined();
  });

  it("preserves provider-proven zero playtime", () => {
    const game = ownedGameToGame({
      id: "steam-owned-10",
      externalId: "10",
      title: "Counter-Strike",
      description: "",
      coverUrl: null,
      logoUrl: null,
      playtimeMinutes: 0,
    });

    expect(game.playtimeMinutes).toBe(0);
    expect(game.productCategory).toBe("game");
  });

  it("restores cached achievements for uninstalled Steam-owned games", () => {
    const game = ownedGameToGame({
      achievements: [{ id: "first-win", name: "First Win", source: "steam" }],
      achievementsSyncedAt: "2026-07-10T10:05:00.000Z",
      coverUrl: null,
      description: "",
      externalId: "10",
      id: "steam-owned-10",
      logoUrl: null,
      title: "Counter-Strike",
    });

    expect(game.achievements).toEqual([{ id: "first-win", name: "First Win", source: "steam" }]);
    expect(game.achievementsSyncedAt).toBe("2026-07-10T10:05:00.000Z");
  });
});
