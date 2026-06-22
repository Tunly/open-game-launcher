import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_KEYS } from "../../../lib/storage-keys";
import type { Game } from "../../../lib/types";
import { mergeEpicOwned } from "../epic";
import type { MergeContext } from "../types";

const fetchEpicOwnedGames = vi.fn();

vi.mock("../../../lib/launcher", () => ({
  fetchEpicOwnedGames: (...args: unknown[]) => fetchEpicOwnedGames(...args),
}));

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
    id: "epic-installed",
    title: "Epic Installed",
    description: "",
    version: "1.0",
    status: "installed",
    platform: "windows",
    playtimeMinutes: 0,
    ...overrides,
  } as Game;
}

function toOwnedGame(entries: Array<{ id: string; title: string; externalId?: string }>) {
  return entries.map((entry) => ({
    id: entry.id,
    externalId: entry.externalId ?? null,
    title: entry.title,
    description: "",
    coverUrl: null,
    logoUrl: null,
    playtimeMinutes: 0,
  }));
}

describe("mergeEpicOwned", () => {
  beforeEach(() => {
    window.localStorage.clear();
    fetchEpicOwnedGames.mockReset();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("returns games unchanged when no Epic session is available", async () => {
    const games = [makeGame()];

    const result = await mergeEpicOwned(games, makeContext());

    expect(result.games).toBe(games);
    expect(fetchEpicOwnedGames).not.toHaveBeenCalled();
  });

  it("persists fetched Epic owned games as local best-effort source evidence", async () => {
    window.localStorage.setItem(STORAGE_KEYS.EPIC_SESSION_MARKER, "Epic User");
    const ownedGames = toOwnedGame([{ id: "epic-owned-hades", title: "Hades" }]);
    fetchEpicOwnedGames.mockResolvedValueOnce(ownedGames);

    const result = await mergeEpicOwned([], makeContext());

    expect(fetchEpicOwnedGames).toHaveBeenCalledTimes(1);
    expect(result.games).toHaveLength(1);
    expect(result.games[0].id).toBe("epic-owned-hades");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.EPIC_OWNED_GAMES_CACHE) ?? "[]")).toEqual(
      ownedGames,
    );
  });
});
