import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Game } from "./types";

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => tauriMocks);

import { syncGameAchievements } from "./games";

describe("syncGameAchievements", () => {
  beforeEach(() => {
    tauriMocks.invoke.mockReset();
    tauriMocks.invoke.mockResolvedValue(undefined);
  });

  it("passes an Epic account game to native sync when it is absent from the installed cache", async () => {
    const game: Game = {
      achievements: [],
      description: "",
      externalId: "catalog-app",
      id: "epic-owned-catalog-app",
      launcher: "epic",
      platform: "windows",
      status: "not_installed",
      title: "Epic Account Game",
      version: "",
    };

    await syncGameAchievements(game);

    expect(tauriMocks.invoke).toHaveBeenCalledWith("sync_local_game_achievements", {
      fallbackGame: game,
      gameId: game.id,
      provider: "epic",
    });
  });
});
