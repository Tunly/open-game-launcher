import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_KEYS, STEAM_OWNED_GAMES_CACHE_VERSION } from "../../../lib/storage-keys";
import { mergeSteamOwned } from "../steam";
import { type MergeContext } from "../types";
import type { Game } from "../../../lib/types";

function makeContext(overrides: Partial<MergeContext> = {}): MergeContext {
  return {
    forceRefresh: false,
    setStatusMessage: vi.fn(),
    shouldApplyResult: () => true,
    ...overrides,
  };
}

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "steam-440",
    title: "Team Fortress 2",
    description: "",
    version: "1.0",
    status: "installed",
    platform: "windows",
    playtimeMinutes: 0,
    ...overrides,
  } as Game;
}

const fetchSteamOwnedGames = vi.fn();
const openSteamScraperWindow = vi.fn();

vi.mock("../../../lib/launcher", () => ({
  fetchSteamOwnedGames: (...args: unknown[]) => fetchSteamOwnedGames(...args),
  normalizeSteamOwnedGames: (raw: unknown) => {
    if (!Array.isArray(raw)) return [];
    return raw.map((entry) => ({
      id: `steam-owned-${entry.appid}`,
      title: entry.title,
      description: "",
      coverUrl: null,
      logoUrl: null,
      achievementSummary: entry.achievementSummary,
    }));
  },
  openSteamScraperWindow: (...args: unknown[]) => openSteamScraperWindow(...args),
}));

describe("mergeSteamOwned", () => {
  beforeEach(() => {
    window.localStorage.clear();
    fetchSteamOwnedGames.mockReset();
    openSteamScraperWindow.mockReset();
    openSteamScraperWindow.mockResolvedValue(undefined);
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("returns games unchanged when no Steam ID is configured", async () => {
    const ctx = makeContext();
    const games: Game[] = [makeGame()];
    const result = await mergeSteamOwned(games, ctx);
    expect(result.games).toBe(games);
    expect(result.warnings).toEqual([]);
    expect(result.statusMessage).toBeNull();
    expect(fetchSteamOwnedGames).not.toHaveBeenCalled();
  });

  it("merges Steam-owned games that are not already installed", async () => {
    window.localStorage.setItem(STORAGE_KEYS.STEAM_ID, JSON.stringify("steamid-123"));
    fetchSteamOwnedGames.mockResolvedValueOnce([
      { appid: "440", title: "Team Fortress 2" },
      { appid: "730", title: "Counter-Strike 2" },
    ]);

    const installed = makeGame({ id: "steam-440", title: "Team Fortress 2" });
    const ctx = makeContext();
    const result = await mergeSteamOwned([installed], ctx);

    expect(result.games).toHaveLength(2);
    expect(result.games[0]).toBe(installed);
    expect(result.games[1].id).toBe("steam-owned-730");
    expect(result.warnings).toEqual([]);
  });

  it("adds Steam achievement progress to an installed copy", async () => {
    window.localStorage.setItem(STORAGE_KEYS.STEAM_ID, JSON.stringify("steamid-123"));
    fetchSteamOwnedGames.mockResolvedValueOnce([
      {
        achievementSummary: {
          unlocked: 31,
          total: 31,
          isPerfect: true,
          source: "steam",
        },
        appid: "440",
        title: "Team Fortress 2",
      },
    ]);

    const installed = makeGame({ id: "steam-440", title: "Team Fortress 2" });
    const result = await mergeSteamOwned([installed], makeContext());

    expect(result.games).toHaveLength(1);
    expect(result.games[0].achievementSummary).toEqual({
      unlocked: 31,
      total: 31,
      isPerfect: true,
      source: "steam",
    });
  });

  it("caches the Steam-owned games for subsequent runs", async () => {
    window.localStorage.setItem(STORAGE_KEYS.STEAM_ID, JSON.stringify("steamid-123"));
    fetchSteamOwnedGames.mockResolvedValueOnce([{ appid: "440", title: "Team Fortress 2" }]);

    await mergeSteamOwned([], makeContext());

    expect(fetchSteamOwnedGames).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE)).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE_VERSION)).toBe(
      STEAM_OWNED_GAMES_CACHE_VERSION,
    );
    expect(localStorage.getItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE_ACCOUNT)).toBe("steamid-123");
  });

  it("uses the cached Steam-owned games when not force refreshing", async () => {
    window.localStorage.setItem(STORAGE_KEYS.STEAM_ID, JSON.stringify("steamid-123"));
    window.localStorage.setItem(
      STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE,
      JSON.stringify([{ appid: "440", title: "Team Fortress 2" }]),
    );
    window.localStorage.setItem(
      STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE_VERSION,
      STEAM_OWNED_GAMES_CACHE_VERSION,
    );
    window.localStorage.setItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE_ACCOUNT, "steamid-123");

    const result = await mergeSteamOwned([], makeContext({ forceRefresh: false }));

    expect(fetchSteamOwnedGames).not.toHaveBeenCalled();
    expect(result.games).toHaveLength(1);
    expect(result.games[0].id).toBe("steam-owned-440");
    expect(openSteamScraperWindow).not.toHaveBeenCalled();
  });

  it("ignores a cache created for another Steam account", async () => {
    window.localStorage.setItem(STORAGE_KEYS.STEAM_ID, JSON.stringify("steamid-new"));
    window.localStorage.setItem(
      STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE,
      JSON.stringify([{ appid: "999", title: "Old account game" }]),
    );
    window.localStorage.setItem(
      STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE_VERSION,
      STEAM_OWNED_GAMES_CACHE_VERSION,
    );
    window.localStorage.setItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE_ACCOUNT, "steamid-old");
    fetchSteamOwnedGames.mockResolvedValueOnce([{ appid: "440", title: "New account game" }]);

    const result = await mergeSteamOwned([], makeContext());

    expect(fetchSteamOwnedGames).toHaveBeenCalledWith("steamid-new");
    expect(result.games.map((game) => game.id)).toEqual(["steam-owned-440"]);
  });

  it("discards an in-flight fetch after the active Steam account changes", async () => {
    window.localStorage.setItem(STORAGE_KEYS.STEAM_ID, JSON.stringify("steamid-old"));
    let resolveFetch: (games: unknown[]) => void = () => undefined;
    fetchSteamOwnedGames.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const mergePromise = mergeSteamOwned([], makeContext());
    await vi.waitFor(() => expect(fetchSteamOwnedGames).toHaveBeenCalledWith("steamid-old"));
    window.localStorage.setItem(STORAGE_KEYS.STEAM_ID, JSON.stringify("steamid-new"));
    resolveFetch([{ appid: "999", title: "Old account game" }]);

    const result = await mergePromise;

    expect(result.games).toEqual([]);
    expect(openSteamScraperWindow).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE)).toBeNull();
  });

  it("ignores stale cache versions and re-fetches when forceRefresh is true", async () => {
    window.localStorage.setItem(STORAGE_KEYS.STEAM_ID, JSON.stringify("steamid-123"));
    window.localStorage.setItem(
      STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE,
      JSON.stringify([{ appid: "999", title: "Old" }]),
    );
    window.localStorage.setItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE_VERSION, "0");
    fetchSteamOwnedGames.mockResolvedValueOnce([{ appid: "440", title: "Team Fortress 2" }]);

    const result = await mergeSteamOwned([], makeContext({ forceRefresh: true }));

    expect(fetchSteamOwnedGames).toHaveBeenCalledTimes(1);
    expect(result.games).toHaveLength(1);
    expect(result.games[0].id).toBe("steam-owned-440");
  });

  it("returns a privacy warning when Steam returns 400/403/Game Details error", async () => {
    window.localStorage.setItem(STORAGE_KEYS.STEAM_ID, JSON.stringify("steamid-123"));
    fetchSteamOwnedGames.mockRejectedValueOnce(
      new Error("400 Bad Request - Game Details are private"),
    );

    const setStatusMessage = vi.fn();
    const result = await mergeSteamOwned([], makeContext({ setStatusMessage }));

    expect(result.games).toEqual([]);
    expect(result.warnings.length).toBe(1);
    expect(result.statusMessage).toMatch(/Steam: Please set 'Game Details' to Public/);
  });

  it("does not emit a privacy status message for unrelated errors", async () => {
    window.localStorage.setItem(STORAGE_KEYS.STEAM_ID, JSON.stringify("steamid-123"));
    fetchSteamOwnedGames.mockRejectedValueOnce(new Error("network down"));

    const result = await mergeSteamOwned([], makeContext());
    expect(result.games).toEqual([]);
    expect(result.warnings.length).toBe(1);
    expect(result.statusMessage).toBeNull();
  });

  it("triggers the silent steam scraper after a successful fetch", async () => {
    window.localStorage.setItem(STORAGE_KEYS.STEAM_ID, JSON.stringify("steamid-123"));
    fetchSteamOwnedGames.mockResolvedValueOnce([{ appid: "440", title: "Team Fortress 2" }]);

    await mergeSteamOwned([], makeContext());

    expect(openSteamScraperWindow).toHaveBeenCalledWith("steamid-123");
  });

  it("falls back to games unchanged when the response is empty", async () => {
    window.localStorage.setItem(STORAGE_KEYS.STEAM_ID, JSON.stringify("steamid-123"));
    fetchSteamOwnedGames.mockResolvedValueOnce([]);

    const result = await mergeSteamOwned([], makeContext());

    expect(result.games).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
