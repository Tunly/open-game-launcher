import { beforeEach, describe, expect, it } from "vitest";

import { STORAGE_KEYS } from "./storage-keys";
import {
  activateSteamAccount,
  cacheSteamOwnedGameAchievements,
  clearSteamAccount,
  readSteamOwnedGamesCache,
  writeSteamOwnedGamesCache,
} from "./steam-owned-games-cache";

describe("Steam owned-games cache", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists the active account immediately and isolates cached games by Steam ID", () => {
    sessionStorage.setItem(STORAGE_KEYS.STARTUP_LIBRARY_RESCAN_DONE, "true");
    localStorage.setItem(
      STORAGE_KEYS.LIBRARY_SNAPSHOT,
      JSON.stringify([
        { id: "steam-owned-10", title: "Old account game" },
        { id: "steam-440", title: "Installed game" },
      ]),
    );
    activateSteamAccount("76561198000000001");
    writeSteamOwnedGamesCache("76561198000000001", [{ appid: 10 }]);

    expect(localStorage.getItem(STORAGE_KEYS.STEAM_ID)).toBe(JSON.stringify("76561198000000001"));
    expect(readSteamOwnedGamesCache("76561198000000001")).toBe(JSON.stringify([{ appid: 10 }]));
    expect(readSteamOwnedGamesCache("76561198000000002")).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.LIBRARY_SNAPSHOT)).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEYS.STARTUP_LIBRARY_RESCAN_DONE)).toBeNull();

    localStorage.setItem(
      STORAGE_KEYS.LIBRARY_SNAPSHOT,
      JSON.stringify([{ id: "steam-440", title: "Installed game" }]),
    );
    sessionStorage.setItem(STORAGE_KEYS.STARTUP_LIBRARY_RESCAN_DONE, "true");
    activateSteamAccount("76561198000000002");
    expect(readSteamOwnedGamesCache("76561198000000002")).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.LIBRARY_SNAPSHOT)).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEYS.STARTUP_LIBRARY_RESCAN_DONE)).toBeNull();
  });

  it("clears account identity and cache together on disconnect", () => {
    activateSteamAccount("76561198000000001");
    writeSteamOwnedGamesCache("76561198000000001", []);

    clearSteamAccount();

    expect(localStorage.getItem(STORAGE_KEYS.STEAM_ID)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE_ACCOUNT)).toBeNull();
  });

  it("persists synced achievements and preserves them across owned-game refreshes", () => {
    const steamId = "76561198000000001";
    activateSteamAccount(steamId);
    writeSteamOwnedGamesCache(steamId, [{ appid: 10, name: "Counter-Strike" }]);

    expect(
      cacheSteamOwnedGameAchievements({
        achievements: [
          {
            id: "first-win",
            name: "First Win",
            source: "steam",
            unlockedAt: "2026-07-10T10:00:00.000Z",
          },
        ],
        achievementsSyncedAt: "2026-07-10T10:05:00.000Z",
        description: "",
        id: "steam-owned-10",
        launcher: "steam",
        platform: "windows",
        status: "not_installed",
        title: "Counter-Strike",
        version: "",
      }),
    ).toBe(true);

    writeSteamOwnedGamesCache(steamId, [
      { appid: 10, name: "Counter-Strike", playtimeMinutes: 120 },
    ]);
    const cached = JSON.parse(readSteamOwnedGamesCache(steamId) ?? "[]");

    expect(cached[0]).toMatchObject({
      achievements: [{ id: "first-win", name: "First Win" }],
      achievementsSyncedAt: "2026-07-10T10:05:00.000Z",
      playtimeMinutes: 120,
    });
  });

  it("preserves a Steam achievement summary when a later inventory response omits it", () => {
    const steamId = "76561198000000001";
    activateSteamAccount(steamId);
    writeSteamOwnedGamesCache(steamId, [
      {
        achievementSummary: {
          unlocked: 31,
          total: 31,
          isPerfect: true,
          source: "steam",
        },
        appid: 10,
      },
    ]);

    writeSteamOwnedGamesCache(steamId, [{ appid: 10, name: "Counter-Strike" }]);

    const cached = JSON.parse(readSteamOwnedGamesCache(steamId) ?? "[]");
    expect(cached[0]?.achievementSummary).toEqual({
      unlocked: 31,
      total: 31,
      isPerfect: true,
      source: "steam",
    });
  });
});
