import { describe, expect, it } from "vitest";

import { ownedGameToGame } from "../library-providers";

describe("ownedGameToGame", () => {
  it("does not attach a launch URI to uninstalled Ubisoft owned games", () => {
    const game = ownedGameToGame({
      id: "ubisoft-owned-635",
      externalId: "635",
      title: "Rainbow Six Siege",
      description: "Ubisoft Connect game (Owned). ID: 635",
      coverUrl: null,
      logoUrl: null,
      playtimeMinutes: 0,
      lastPlayedAt: null,
    });

    expect(game.launcher).toBe("ubisoft");
    expect(game.status).toBe("not_installed");
    expect(game.launchUri).toBeUndefined();
  });
});
