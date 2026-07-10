import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_KEYS } from "../../../lib/storage-keys";
import { mergeEaOwned } from "../ea";
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
    id: "ea-apex",
    title: "Apex Legends",
    description: "",
    version: "1.0",
    status: "installed",
    platform: "windows",
    playtimeMinutes: 0,
    launcher: "ea",
    ...overrides,
  } as Game;
}

const eaGetToken = vi.fn();
const eaFetchOwnedGames = vi.fn();

vi.mock("../../../lib/launcher", () => ({
  eaGetToken: (...args: unknown[]) => eaGetToken(...args),
  eaFetchOwnedGames: (...args: unknown[]) => eaFetchOwnedGames(...args),
}));

function toOwnedGame(entries: Array<{ id: string; title: string; externalId?: string }>) {
  return entries.map((e) => ({
    id: e.id,
    externalId: e.externalId ?? null,
    title: e.title,
    description: "",
    coverUrl: null,
    logoUrl: null,
  }));
}

describe("mergeEaOwned", () => {
  beforeEach(() => {
    window.localStorage.clear();
    eaGetToken.mockReset();
    eaFetchOwnedGames.mockReset();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("returns games unchanged when no EA token is available", async () => {
    eaGetToken.mockResolvedValueOnce(null);
    const games: Game[] = [makeGame()];
    const result = await mergeEaOwned(games, makeContext());
    expect(result.games).toBe(games);
    expect(eaFetchOwnedGames).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.EA_TOKEN)).toBeNull();
  });

  it("removes the stale EA token from localStorage when none is returned", async () => {
    window.localStorage.setItem(STORAGE_KEYS.EA_TOKEN, JSON.stringify({ stale: true }));
    eaGetToken.mockResolvedValueOnce(null);

    await mergeEaOwned([], makeContext());
    expect(localStorage.getItem(STORAGE_KEYS.EA_TOKEN)).toBeNull();
  });

  it("does not persist the EA token when one is returned", async () => {
    eaGetToken.mockResolvedValueOnce({ accessToken: "abc", capturedAt: 1000 });
    eaFetchOwnedGames.mockResolvedValueOnce([]);

    await mergeEaOwned([], makeContext());
    expect(localStorage.getItem(STORAGE_KEYS.EA_TOKEN)).toBeNull();
  });

  it("merges EA-owned games that are not already installed", async () => {
    eaGetToken.mockResolvedValueOnce({ accessToken: "abc", capturedAt: 1 });
    eaFetchOwnedGames.mockResolvedValueOnce(
      toOwnedGame([
        { id: "ea-apex", title: "Apex Legends" },
        { id: "ea-fifa", title: "FIFA 24" },
      ]),
    );

    const installed = makeGame({ id: "ea-apex", title: "Apex Legends", launcher: "ea" });
    const result = await mergeEaOwned([installed], makeContext());

    expect(result.games).toHaveLength(2);
    expect(result.games[0]).toBe(installed);
    expect(result.games[1].id).toBe("ea-fifa");
  });

  it("matches EA-owned games by externalId when present", async () => {
    eaGetToken.mockResolvedValueOnce({ accessToken: "abc", capturedAt: 1 });
    eaFetchOwnedGames.mockResolvedValueOnce(
      toOwnedGame([{ id: "ea-bf", title: "Battlefield 2042", externalId: "origin-2042" }]),
    );

    const installed = makeGame({
      id: "ea-bf",
      title: "Battlefield 2042",
      externalId: "origin-2042",
    });
    const result = await mergeEaOwned([installed], makeContext());

    expect(result.games).toHaveLength(1);
  });

  it("surfaces a status message when EA returns 0 games", async () => {
    eaGetToken.mockResolvedValueOnce({ accessToken: "abc", capturedAt: 1 });
    eaFetchOwnedGames.mockResolvedValueOnce([]);

    const result = await mergeEaOwned([], makeContext());
    expect(result.statusMessage).toMatch(/EA is connected but returned 0 games/);
  });

  it("emits a warning and a status message on a fetch error", async () => {
    eaGetToken.mockResolvedValueOnce({ accessToken: "abc", capturedAt: 1 });
    eaFetchOwnedGames.mockRejectedValueOnce(new Error("401 unauthorized"));

    const setStatusMessage = vi.fn();
    const result = await mergeEaOwned([], makeContext({ setStatusMessage }));
    expect(result.warnings.length).toBe(1);
    expect(result.statusMessage).toMatch(/EA library sync failed/);
  });

  it("removes the cached token when the error mentions 'expired'", async () => {
    eaGetToken.mockResolvedValueOnce({ accessToken: "abc", capturedAt: 1 });
    window.localStorage.setItem(STORAGE_KEYS.EA_TOKEN, JSON.stringify({ accessToken: "abc" }));
    eaFetchOwnedGames.mockRejectedValueOnce(new Error("token expired"));

    await mergeEaOwned([], makeContext());
    expect(localStorage.getItem(STORAGE_KEYS.EA_TOKEN)).toBeNull();
  });

  it("removes the cached token when the error mentions 'not connected'", async () => {
    eaGetToken.mockResolvedValueOnce({ accessToken: "abc", capturedAt: 1 });
    window.localStorage.setItem(STORAGE_KEYS.EA_TOKEN, JSON.stringify({ accessToken: "abc" }));
    eaFetchOwnedGames.mockRejectedValueOnce(new Error("EA not connected"));

    await mergeEaOwned([], makeContext());
    expect(localStorage.getItem(STORAGE_KEYS.EA_TOKEN)).toBeNull();
  });
});
