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
      status: "available",
      stability: "unofficial",
    });
    expect(syncableAchievementGames([ubisoftGame])).toEqual([ubisoftGame]);
  });

  it("allows installed best-effort providers to try local sidecar imports", () => {
    const gogGame = game({
      id: "gog-game",
      title: "GOG Game",
      launcher: "gog",
    });

    expect(achievementProviderStatusForGame(gogGame)).toMatchObject({
      provider: "gog",
      status: "available",
      stability: "unofficial",
    });
    expect(achievementProviderStatusForGame(gogGame).message).toMatch(/sidecar/i);
    expect(syncableAchievementGames([gogGame])).toEqual([gogGame]);
  });

  it("keeps uninstalled best-effort providers unavailable until login or cache evidence exists", () => {
    const gogGame = game({
      id: "gog-game",
      title: "GOG Game",
      launcher: "gog",
      status: "not_installed",
    });

    expect(achievementProviderStatusForGame(gogGame)).toMatchObject({
      provider: "gog",
      status: "not_connected",
      stability: "unofficial",
    });
    expect(syncableAchievementGames([gogGame])).toEqual([]);

    window.localStorage.setItem(
      STORAGE_KEYS.GOG_OWNED_GAMES_CACHE,
      JSON.stringify([{ id: "gog-owned-1", title: "GOG Game" }]),
    );

    expect(achievementProviderStatusForGame(gogGame)).toMatchObject({
      provider: "gog",
      status: "available",
      stability: "unofficial",
    });
    expect(syncableAchievementGames([gogGame])).toEqual([gogGame]);
  });

  it("uses cached GOG library data as local best-effort evidence", () => {
    const gogGame = game({
      id: "gog-game",
      title: "GOG Game",
      launcher: "gog",
    });

    window.localStorage.setItem(
      STORAGE_KEYS.GOG_OWNED_GAMES_CACHE,
      JSON.stringify([{ id: "gog-owned-1", title: "GOG Game" }]),
    );

    expect(achievementProviderStatusForGame(gogGame)).toMatchObject({
      provider: "gog",
      status: "available",
      stability: "unofficial",
    });
    expect(syncableAchievementGames([gogGame])).toEqual([gogGame]);
  });

  it("distinguishes connected Epic from missing local achievement source data", () => {
    const epicGame = game({
      id: "epic-game",
      title: "Epic Game",
      launcher: "epic",
    });

    expect(achievementProviderStatusForGame(epicGame)).toMatchObject({
      provider: "epic",
      status: "available",
      stability: "unofficial",
    });

    window.localStorage.setItem(STORAGE_KEYS.EPIC_SESSION_MARKER, "Epic User");

    expect(achievementProviderStatusForGame(epicGame)).toMatchObject({
      provider: "epic",
      status: "available",
      stability: "unofficial",
    });
    expect(achievementProviderStatusForGame(epicGame).message).toMatch(/public Store fallback/i);
    expect(syncableAchievementGames([epicGame])).toEqual([epicGame]);
  });

  it("uses cached Epic library data as local best-effort evidence", () => {
    const epicGame = game({
      id: "epic-game",
      title: "Epic Game",
      launcher: "epic",
    });

    window.localStorage.setItem(
      STORAGE_KEYS.EPIC_OWNED_GAMES_CACHE,
      JSON.stringify([{ id: "epic-owned-game", title: "Epic Game" }]),
    );

    expect(achievementProviderStatusForGame(epicGame)).toMatchObject({
      provider: "epic",
      status: "available",
      stability: "unofficial",
    });
    expect(syncableAchievementGames([epicGame])).toEqual([epicGame]);
  });

  it("uses installed EA games for best-effort checks without trusting legacy token JSON", () => {
    const eaGame = game({
      id: "ea-game",
      title: "EA Game",
      launcher: "ea",
    });

    expect(achievementProviderStatusForGame(eaGame)).toMatchObject({
      provider: "ea",
      status: "available",
      stability: "unofficial",
    });

    expect(achievementProviderStatusForGame(eaGame)).toMatchObject({
      provider: "ea",
      status: "available",
      stability: "unofficial",
    });
    expect(syncableAchievementGames([eaGame])).toEqual([eaGame]);
  });

  it("does not treat legacy EA token JSON as achievement availability evidence", () => {
    const eaGame = game({
      id: "ea-game",
      title: "EA Game",
      launcher: "ea",
      status: "not_installed",
    });

    window.localStorage.setItem(STORAGE_KEYS.EA_TOKEN, JSON.stringify({ accessToken: "ea" }));

    expect(achievementProviderStatusForGame(eaGame)).toMatchObject({
      provider: "ea",
      status: "not_connected",
      stability: "unofficial",
    });
    expect(syncableAchievementGames([eaGame])).toEqual([]);
  });

  it("distinguishes Battle.net library cache from missing local source data", () => {
    const battlenetGame = game({
      id: "battlenet-game",
      title: "Battle.net Game",
      launcher: "battlenet",
    });

    expect(achievementProviderStatusForGame(battlenetGame)).toMatchObject({
      provider: "battlenet",
      status: "available",
      stability: "unofficial",
    });

    window.localStorage.setItem(
      STORAGE_KEYS.BATTLENET_GAMES_CACHE,
      JSON.stringify([{ id: "battlenet-game", title: "Battle.net Game" }]),
    );

    expect(achievementProviderStatusForGame(battlenetGame)).toMatchObject({
      provider: "battlenet",
      status: "available",
      stability: "unofficial",
    });
    expect(syncableAchievementGames([battlenetGame])).toEqual([battlenetGame]);
  });
});
