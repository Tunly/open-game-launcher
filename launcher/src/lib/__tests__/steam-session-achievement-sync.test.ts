import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Game } from "../types";

const mocks = vi.hoisted(() => ({
  sessionSync: vi.fn(),
}));

vi.mock("../launcher", () => ({
  syncGameAchievements: mocks.sessionSync,
}));

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

describe("Steam session achievement synchronization", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("launcher.steamId", JSON.stringify("76561198000000000"));
    mocks.sessionSync.mockReset();
  });

  it("uses the connected Steam identity with the native session bridge", async () => {
    const response = {
      achievementSource: "steam_authenticated_session",
      game: { ...game, achievements: [{ id: "ACH_FIRST_WIN", name: "First Win" }] },
      gameId: game.id,
      message: "Authenticated Steam session sync complete.",
      success: true,
      syncedAchievements: 1,
      unlockedAchievements: 1,
    };
    mocks.sessionSync.mockResolvedValue(response);

    const { achievementProviderForGame } = await import("../achievement-providers");
    await expect(achievementProviderForGame(game).sync(game)).resolves.toEqual(response);
    expect(mocks.sessionSync).toHaveBeenCalledWith(game, "76561198000000000");
  });

  it("surfaces the native result without attempting a hosted Steam relay", async () => {
    mocks.sessionSync.mockRejectedValue(
      new Error("Steam session and keyless Community fallback are unavailable."),
    );

    const { achievementProviderForGame } = await import("../achievement-providers");
    await expect(achievementProviderForGame(game).sync(game)).rejects.toThrow(
      "Steam session and keyless Community fallback are unavailable.",
    );
    expect(mocks.sessionSync).toHaveBeenCalledTimes(1);
  });
});
