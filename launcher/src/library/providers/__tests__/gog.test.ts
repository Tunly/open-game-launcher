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

function toOwnedGame(entries: Array<{ id: string; title: string; externalId?: string }>) {
  return entries.map((e) => ({
    id: e.id,
    externalId: e.externalId ?? null,
    title: e.title,
    description: "",
    coverUrl: null,
    logoUrl: null,
    playtimeMinutes: 0,
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

  it("uses the locally cached GOG token even if backend has none", async () => {
    gogGetToken.mockResolvedValueOnce(null);
    window.localStorage.setItem(STORAGE_KEYS.GOG_TOKEN, JSON.stringify({ accessToken: "x" }));
    fetchGogOwnedGames.mockResolvedValueOnce(
      toOwnedGame([{ id: "gog-owned-9", title: "Cyberpunk" }]),
    );

    const result = await mergeGogOwned([], makeContext());
    expect(fetchGogOwnedGames).toHaveBeenCalledTimes(1);
    expect(result.games).toHaveLength(1);
    expect(result.games[0].id).toBe("gog-owned-9");
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

  it("persists refreshed token to localStorage", async () => {
    gogGetToken.mockResolvedValueOnce({ accessToken: "x" });
    gogRefreshToken.mockResolvedValueOnce({
      accessToken: "newAccess",
      refreshToken: "newRefresh",
      expiresAt: 1234,
      userId: "u",
    });
    fetchGogOwnedGames.mockResolvedValueOnce([]);

    await mergeGogOwned([], makeContext());

    const stored = localStorage.getItem(STORAGE_KEYS.GOG_TOKEN);
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored as string);
    expect(parsed.accessToken).toBe("newAccess");
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
