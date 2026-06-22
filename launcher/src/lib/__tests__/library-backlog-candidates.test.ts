import { describe, expect, it } from "vitest";

import {
  buildBacklogCandidatesFromGroups,
  createVerifyBacklogCandidates,
} from "../library-backlog-candidates";
import type { GameGroup } from "../game-groups";
import type { Game } from "../types";

describe("buildBacklogCandidatesFromGroups", () => {
  it("maps local game groups into deterministic backlog candidates", () => {
    const groups = [
      makeGroup({
        displayGame: makeGame({
          achievements: [
            { id: "a", name: "A", unlockedAt: "2026-06-01T00:00:00.000Z" },
            { id: "b", name: "B", unlockedAt: null },
          ],
          features: ["Multiplayer"],
          friendsPlaying: ["Dana", "Lee"],
          genres: ["Action"],
          lastPlayedAt: "2026-06-09T12:00:00.000Z",
          tags: ["Co-op"],
        }),
        status: "installed",
      }),
    ];

    const [candidate] = buildBacklogCandidatesFromGroups(groups, "2026-06-11T12:00:00.000Z");

    expect(candidate).toMatchObject({
      achievementsPercent: 50,
      estimatedSessionMinutes: 75,
      friendsPlaying: 2,
      installed: true,
      lastPlayedDaysAgo: 2,
      moodTags: ["co-op", "action", "multiplayer"],
      storageReady: true,
      title: "Local Game",
    });
  });

  it("keeps non-downloadable missing games blocked", () => {
    const [candidate] = buildBacklogCandidatesFromGroups([
      makeGroup({
        displayGame: makeGame({
          downloadUrl: undefined,
          status: "not_installed",
        }),
        status: "not_installed",
      }),
    ]);

    expect(candidate.installed).toBe(false);
    expect(candidate.downloadReady).toBe(false);
    expect(candidate.estimatedSessionMinutes).toBe(0);
    expect(candidate.storageReady).toBe(false);
  });

  it("provides deterministic verification candidates for screenshots", () => {
    expect(createVerifyBacklogCandidates().map((candidate) => candidate.title)).toEqual([
      "Mech Arcade",
      "Queue Fighter",
      "Missing Build",
    ]);
  });
});

function makeGame(patch: Partial<Game> = {}): Game {
  return {
    description: "Local game",
    id: patch.id ?? "local-game",
    platform: "windows",
    status: patch.status ?? "installed",
    title: patch.title ?? "Local Game",
    version: "1.0",
    ...patch,
  };
}

function makeGroup(patch: Partial<GameGroup> = {}): GameGroup {
  const displayGame = patch.displayGame ?? makeGame();
  return {
    achievementBasisGameId: null,
    achievementBasisSource: null,
    achievementProviderStatuses: [],
    achievements: [],
    displayGame,
    id: "group-1",
    key: "local-game",
    lastPlayedAt: displayGame.lastPlayedAt ?? displayGame.lastPlayed ?? null,
    playtimeMinutes: displayGame.playtimeMinutes ?? 120,
    primaryGame: displayGame,
    sources: ["manual"],
    status: displayGame.status,
    title: displayGame.title,
    variants: [displayGame],
    ...patch,
  };
}
