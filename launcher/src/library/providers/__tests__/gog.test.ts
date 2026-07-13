import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_KEYS } from "../../../lib/storage-keys";
import { mergeGogOwned } from "../gog";
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
    id: "gog-1",
    title: "The Witcher 3",
    description: "",
    version: "1.0",
    status: "installed",
    platform: "windows",
    playtimeMinutes: 0,
    ...overrides,
  } as Game;
}

const gogGetToken = vi.fn();
const gogRefreshToken = vi.fn();
const fetchGogOwnedGames = vi.fn();

vi.mock("../../../lib/launcher", () => ({
  gogGetToken: (...args: unknown[]) => gogGetToken(...args),
  gogRefreshToken: (...args: unknown[]) => gogRefreshToken(...args),
  fetchGogOwnedGames: (...args: unknown[]) => fetchGogOwnedGames(...args),
}));

function toOwnedGame(
  entries: Array<{
    id: string;
    title: string;
    externalId?: string;
    coverUrl?: string | null;
    logoUrl?: string | null;
    iconUrl?: string | null;
  }>,
) {
  return entries.map((e) => ({
    id: e.id,
    externalId: e.externalId ?? null,
    title: e.title,
    description: "",
    coverUrl: e.coverUrl ?? null,
    logoUrl: e.logoUrl ?? null,
    iconUrl: e.iconUrl ?? null,
  }));
}

describe("mergeGogOwned", () => {
  beforeEach(() => {
    window.localStorage.clear();
    gogGetToken.mockReset();
    gogRefreshToken.mockReset();
    fetchGogOwnedGames.mockReset();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("returns games unchanged when no GOG session is available", async () => {
    gogGetToken.mockResolvedValueOnce(null);
    const games: Game[] = [makeGame()];
    const result = await mergeGogOwned(games, makeContext());
    expect(result.games).toBe(games);
    expect(fetchGogOwnedGames).not.toHaveBeenCalled();
  });

  it("ignores and clears legacy localStorage GOG tokens when backend has none", async () => {
    gogGetToken.mockResolvedValueOnce(null);
    window.localStorage.setItem(STORAGE_KEYS.GOG_TOKEN, JSON.stringify({ accessToken: "x" }));
    fetchGogOwnedGames.mockResolvedValueOnce(
      toOwnedGame([{ id: "gog-owned-9", title: "Cyberpunk" }]),
    );

    const result = await mergeGogOwned([], makeContext());
    expect(fetchGogOwnedGames).not.toHaveBeenCalled();
    expect(result.games).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEYS.GOG_TOKEN)).toBeNull();
  });

  it("merges GOG-owned games that are not already installed", async () => {
    gogGetToken.mockResolvedValueOnce({ accessToken: "x" });
    gogRefreshToken.mockResolvedValueOnce(null);
    fetchGogOwnedGames.mockResolvedValueOnce(
      toOwnedGame([
        { id: "gog-owned-1", title: "The Witcher 3" },
        { id: "gog-owned-2", title: "Hades" },
      ]),
    );

    const installed = makeGame({ id: "gog-1", title: "The Witcher 3" });
    const result = await mergeGogOwned([installed], makeContext());

    expect(result.games).toHaveLength(2);
    expect(result.games[0]).toBe(installed);
    expect(result.games[1].id).toBe("gog-owned-2");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.GOG_OWNED_GAMES_CACHE) ?? "[]")).toEqual(
      toOwnedGame([
        { id: "gog-owned-1", title: "The Witcher 3" },
        { id: "gog-owned-2", title: "Hades" },
      ]),
    );
  });

  it("matches GOG-owned games by externalId when present", async () => {
    gogGetToken.mockResolvedValueOnce({ accessToken: "x" });
    gogRefreshToken.mockResolvedValueOnce(null);
    fetchGogOwnedGames.mockResolvedValueOnce(
      toOwnedGame([{ id: "gog-owned-7", title: "Hades", externalId: "epic-7" }]),
    );

    const installed = makeGame({ id: "gog-1", title: "Hades", externalId: "epic-7" });
    const result = await mergeGogOwned([installed], makeContext());

    expect(result.games).toHaveLength(1);
    expect(result.games[0]).toBe(installed);
  });

  it("repairs installed GOG artwork from the matching owned game", async () => {
    gogGetToken.mockResolvedValueOnce({ accessToken: "x" });
    gogRefreshToken.mockResolvedValueOnce(null);
    fetchGogOwnedGames.mockResolvedValueOnce(
      toOwnedGame([
        {
          id: "gog-owned-1458127099",
          externalId: "1458127099",
          title: "Jotun: Valhalla Edition",
          coverUrl: "https://images.gog.example/jotun-background.jpg",
          logoUrl: "https://images.gog.example/jotun-logo.jpg",
          iconUrl: "https://images.gog.example/jotun-icon.png",
        },
      ]),
    );
    const installed = makeGame({
      id: "gog-Jotun: Valhalla Edition",
      externalId: "1458127099",
      title: "Jotun: Valhalla Edition",
      coverUrl: "C:\\ProgramData\\GOG.com\\Galaxy\\webcache\\old\\jotun-background.webp",
    });

    const result = await mergeGogOwned([installed], makeContext());

    expect(result.games).toHaveLength(1);
    expect(result.games[0]).toMatchObject({
      coverUrl: "https://images.gog.example/jotun-background.jpg",
      logoUrl: "https://images.gog.example/jotun-logo.jpg",
      iconUrl: "https://images.gog.example/jotun-icon.png",
    });
  });

  it("does not persist refreshed tokens to localStorage", async () => {
    gogGetToken.mockResolvedValueOnce({ accessToken: "x" });
    gogRefreshToken.mockResolvedValueOnce({
      accessToken: "newAccess",
      refreshToken: "newRefresh",
      expiresAt: 1234,
      userId: "u",
    });
    fetchGogOwnedGames.mockResolvedValueOnce([]);

    await mergeGogOwned([], makeContext());

    expect(localStorage.getItem(STORAGE_KEYS.GOG_TOKEN)).toBeNull();
  });

  it("does not throw when the GOG refresh call fails", async () => {
    gogGetToken.mockResolvedValueOnce({ accessToken: "x" });
    gogRefreshToken.mockRejectedValueOnce(new Error("network"));
    fetchGogOwnedGames.mockResolvedValueOnce(toOwnedGame([{ id: "gog-owned-1", title: "Hades" }]));

    const result = await mergeGogOwned([], makeContext());
    expect(result.warnings).toEqual([]);
    expect(result.games).toHaveLength(1);
  });

  it("emits a warning and returns games unchanged on a fetch error", async () => {
    gogGetToken.mockResolvedValueOnce({ accessToken: "x" });
    gogRefreshToken.mockResolvedValueOnce(null);
    fetchGogOwnedGames.mockRejectedValueOnce(new Error("server down"));

    const games: Game[] = [makeGame()];
    const result = await mergeGogOwned(games, makeContext());
    expect(result.games).toBe(games);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toMatch(/Failed to fetch owned GOG games/);
  });

  it("returns empty games list when fetch returns no owned games", async () => {
    gogGetToken.mockResolvedValueOnce({ accessToken: "x" });
    gogRefreshToken.mockResolvedValueOnce(null);
    fetchGogOwnedGames.mockResolvedValueOnce([]);

    const result = await mergeGogOwned([], makeContext());
    expect(result.games).toEqual([]);
  });
});
