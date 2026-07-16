import { invoke, isTauri } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Game } from "../types";
import { moveGame, stopGame, syncGameAchievements, syncGameSaves } from "./games";

describe("native game command bindings", () => {
  beforeEach(() => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockClear();
  });

  it("passes the exact game id to the safe native stop command", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      gameId: "manual-neon",
      message: "Neon was stopped.",
      pid: 4242,
      success: true,
    });

    await expect(stopGame("manual-neon")).resolves.toMatchObject({
      gameId: "manual-neon",
      pid: 4242,
      success: true,
    });
    expect(invoke).toHaveBeenCalledWith("stop_game", { gameId: "manual-neon" });
  });

  it("keeps move and save sync behind their native commands", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await moveGame({ gameId: "manual-neon", newPath: "C:\\Games" });
    await syncGameSaves("manual-neon");

    expect(invoke).toHaveBeenNthCalledWith(1, "move_game", {
      input: { gameId: "manual-neon", newPath: "C:\\Games" },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "sync_game_saves", {
      gameId: "manual-neon",
    });
  });

  it("routes Steam achievements through the native authenticated-session command", async () => {
    const game: Game = {
      achievements: [],
      description: "",
      externalId: "440",
      id: "steam-owned-440",
      launcher: "steam",
      platform: "windows",
      status: "not_installed",
      title: "Team Fortress 2",
      version: "1.0.0",
    };
    vi.mocked(invoke).mockResolvedValueOnce({
      achievementSource: "steam_authenticated_session",
      game,
      gameId: game.id,
      message: "Steam session sync complete.",
      success: true,
      syncedAchievements: 1,
      unlockedAchievements: 1,
    });

    await syncGameAchievements(game, "76561198000000000");

    expect(invoke).toHaveBeenCalledWith("sync_steam_session_achievements", {
      fallbackGame: game,
      gameId: game.id,
      steamId: "76561198000000000",
    });
    expect(JSON.stringify(vi.mocked(invoke).mock.calls)).not.toMatch(
      /api[_-]?key|steam[_-]?web[_-]?api[_-]?key/i,
    );
  });
});
