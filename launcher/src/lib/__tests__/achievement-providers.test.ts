import { describe, expect, it, beforeEach } from "vitest";

import {
  achievementProviderStatusForGame,
  getXboxTitleHint,
  syncableAchievementGames,
} from "../achievement-providers";
import { STORAGE_KEYS } from "../storage-keys";
import type { Game } from "../types";

function game(overrides: Partial<Game>): Game {
  return {
    id: "game-1",
    title: "Test Game",
    description: "",
    version: "1.0.0",
    launcher: "manual",
    status: "installed",
    platform: "windows",
    achievements: [],
    saveFiles: [],
    friendsPlaying: [],
    ...overrides,
  };
}

describe("achievement providers", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("allows Xbox achievement sync with a local non-numeric identity hint", () => {
    const xboxGame = game({
      id: "xbox-microsoft.forzahorizon5_8wekyb3d8bbwe",
      title: "Forza Horizon 5",
      launcher: "xbox",
      externalId: "forza-horizon-5",
    });

    expect(getXboxTitleHint(xboxGame)).toBe("forza-horizon-5");
    expect(achievementProviderStatusForGame(xboxGame)).toMatchObject({
      provider: "xbox",
      status: "available",
      stability: "official",
    });
    expect(syncableAchievementGames([xboxGame])).toEqual([xboxGame]);
  });

  it("keeps Steam unavailable until a Steam account is connected", () => {
    const steamGame = game({
      id: "steam-123",
      title: "Steam Game",
      launcher: "steam",
      externalId: "123",
    });

    expect(achievementProviderStatusForGame(steamGame)).toMatchObject({
      provider: "steam",
      status: "not_connected",
    });
    expect(syncableAchievementGames([steamGame])).toEqual([]);

    window.localStorage.setItem(STORAGE_KEYS.STEAM_ID, JSON.stringify("76561198000000000"));

    expect(achievementProviderStatusForGame(steamGame)).toMatchObject({
      provider: "steam",
      status: "available",
    });
    expect(syncableAchievementGames([steamGame])).toEqual([steamGame]);
  });

  it("marks unofficial providers as visible best-effort statuses", () => {
    const ubisoftGame = game({
      id: "ubisoft-game",
      title: "Ubisoft Game",
      launcher: "ubisoft",
    });

    expect(achievementProviderStatusForGame(ubisoftGame)).toMatchObject({
      provider: "ubisoft",
      status: "no_api",
      stability: "unofficial",
    });
    expect(syncableAchievementGames([ubisoftGame])).toEqual([]);
  });
});
