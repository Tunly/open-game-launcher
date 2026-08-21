import { beforeEach, describe, expect, it, vi } from "vitest";

import { archiveSyncCandidates, syncAchievementArchiveGames } from "../achievement-archive-sync";
import { achievementProviderForGame } from "../achievement-providers";
import type { Game } from "../types";

vi.mock("../achievement-providers", () => ({
  achievementProviderForGame: vi.fn(),
}));

vi.mock("../achievement-provider-sync", () => ({
  syncAchievementProviderGame: vi.fn(async (game: Game) => ({
    game,
    response: { success: true, syncedAchievements: 1, game },
    status: { source: "steam", status: "available", stability: "official", message: "ok" },
    success: true,
    diagnosticMessage: null,
  })),
}));

vi.mock("../steam-owned-games-cache", () => ({
  cacheSteamOwnedGameAchievements: vi.fn(),
}));

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const TEN_SECONDS_MS = 10 * 1000;

function steamGame(overrides: Partial<Game> = {}): Game {
  return {
    achievements: [],
    description: "",
    externalId: "440",
    id: "steam-440",
    launcher: "steam",
    platform: "windows",
    status: "installed",
    title: "Team Fortress 2",
    version: "1.0",
    ...overrides,
  } as Game;
}

describe("achievement archive sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(achievementProviderForGame).mockReturnValue({
      provider: "steam",
      stability: "official",
      status: "available",
      message: "Steam achievement sync available",
      isAvailable: () => true,
      sync: vi.fn(),
    } as ReturnType<typeof achievementProviderForGame>);
  });

  it("selects a game with no achievements snapshot", () => {
    const candidates = archiveSyncCandidates([steamGame()], 1_000_000);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.game.id).toBe("steam-440");
  });

  it("skips a game with a fresh achievement snapshot", () => {
    const fresh = steamGame({
      achievements: [{ id: "a", name: "A" }],
      achievementsSyncedAt: new Date(1_000_000).toISOString(),
    });
    expect(archiveSyncCandidates([fresh], 1_000_000)).toHaveLength(0);
  });

  it("re-selects a game whose snapshot is older than the freshness window", () => {
    const stale = steamGame({
      achievements: [{ id: "a", name: "A" }],
      achievementsSyncedAt: new Date(1_000_000 - SIX_HOURS_MS - 1).toISOString(),
    });
    expect(archiveSyncCandidates([stale], 1_000_000)).toHaveLength(1);
  });

  it("skips a game that was recently attempted", async () => {
    // The attempt is recorded by the sync flow, not the pure selection.
    await syncAchievementArchiveGames([steamGame()], 1_000_000);
    expect(archiveSyncCandidates([steamGame()], 1_000_000 + 1_000)).toHaveLength(0);
  });

  it("retries a game after the retry delay elapses", async () => {
    await syncAchievementArchiveGames([steamGame()], 1_000_000);
    expect(archiveSyncCandidates([steamGame()], 1_000_000 + TEN_SECONDS_MS + 1)).toHaveLength(1);
  });

  it("prunes the attempt map past the retry window", () => {
    archiveSyncCandidates([steamGame()], 1_000_000);
    // A different game keeps the map alive; the stale entry is pruned.
    const pruned = archiveSyncCandidates(
      [steamGame({ id: "steam-730" })],
      1_000_000 + TEN_SECONDS_MS + 1,
    );
    expect(pruned).toHaveLength(1);
  });

  it("runs the sync pool and returns the synced games in order", async () => {
    const first = steamGame({ id: "steam-440" });
    const second = steamGame({ id: "steam-730", externalId: "730" });
    const synced = await syncAchievementArchiveGames([first, second]);
    expect(synced).toHaveLength(2);
    expect(synced[0]!.id).toBe("steam-440");
    expect(synced[1]!.id).toBe("steam-730");
  });
});
