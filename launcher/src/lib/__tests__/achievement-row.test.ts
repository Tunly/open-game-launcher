import { describe, expect, it } from "vitest";

import { buildAchievementRow, formatDate, parseTime } from "../achievement-row";
import type { GameGroup, GroupedAchievement } from "../game-groups";
import type { Game } from "../types";

function groupedAchievement(overrides: Partial<GroupedAchievement> = {}): GroupedAchievement {
  return {
    canonicalAchievementId: "1",
    canonicalSource: "steam",
    description: null,
    iconUrl: null,
    id: "grouped-steam:1",
    isAdditional: false,
    matchConfidence: "exact",
    matchKey: "steam:1",
    name: "Win one game",
    sourceAchievementId: "1",
    sourceIds: ["steam:1"],
    sourceLabels: ["steam"],
    sources: [],
    unlockedAt: null,
    ...overrides,
  } as GroupedAchievement;
}

function group(overrides: Partial<GameGroup> = {}): GameGroup {
  const game = {
    description: "",
    id: "steam-440",
    platform: "windows",
    status: "installed",
    title: "Team Fortress 2",
    version: "1.0",
  } as Game;
  return {
    achievements: [],
    displayGame: game,
    id: "group:steam-440",
    key: "steam-440",
    playtimeMinutes: 0,
    primaryGame: game,
    sources: ["steam"],
    status: "installed",
    title: "Team Fortress 2",
    variants: [game],
    ...overrides,
  } as GameGroup;
}

describe("buildAchievementRow", () => {
  it("computes total and unlocked from non-additional achievements", () => {
    const row = buildAchievementRow(
      group({
        achievements: [
          groupedAchievement({ id: "a1", unlockedAt: "2026-01-01" }),
          groupedAchievement({ id: "a2" }),
          groupedAchievement({ id: "a3", isAdditional: true }),
        ],
      }),
    );
    expect(row.total).toBe(2);
    expect(row.unlocked).toBe(1);
    expect(row.completion).toBe(50);
    expect(row.isPerfect).toBe(false);
  });

  it("marks a fully unlocked group as perfect", () => {
    const row = buildAchievementRow(
      group({
        achievements: [
          groupedAchievement({ id: "a1", unlockedAt: "2026-01-01" }),
          groupedAchievement({ id: "a2", unlockedAt: "2026-01-02" }),
        ],
      }),
    );
    expect(row.isPerfect).toBe(true);
    expect(row.completion).toBe(100);
  });

  it("prefers an achievementSummary over derived counts", () => {
    const game = {
      description: "",
      id: "steam-440",
      platform: "windows",
      status: "installed",
      title: "Team Fortress 2",
      version: "1.0",
      achievementSummary: { isPerfect: true, source: "steam", total: 10, unlocked: 10 },
    } as Game;
    const row = buildAchievementRow(
      group({
        primaryGame: game,
        variants: [game],
        achievements: [groupedAchievement({ id: "a1", unlockedAt: "2026-01-01" })],
      }),
    );
    expect(row.total).toBe(10);
    expect(row.unlocked).toBe(10);
    expect(row.isPerfect).toBe(true);
  });

  it("picks the latest unlockedAt and the three most recent unlocks", () => {
    const row = buildAchievementRow(
      group({
        achievements: [
          groupedAchievement({ id: "old", unlockedAt: "2026-01-01" }),
          groupedAchievement({ id: "new", unlockedAt: "2026-06-01" }),
          groupedAchievement({ id: "mid", unlockedAt: "2026-03-01" }),
          groupedAchievement({ id: "locked" }),
        ],
      }),
    );
    expect(row.lastUnlockedAt).toBe("2026-06-01");
    expect(row.recentAchievements.map((a) => a.id)).toEqual(["new", "mid", "old"]);
  });

  it("handles a group with no achievements", () => {
    const row = buildAchievementRow(group());
    expect(row.total).toBe(0);
    expect(row.unlocked).toBe(0);
    expect(row.completion).toBe(0);
    expect(row.isPerfect).toBe(false);
    expect(row.lastUnlockedAt).toBeNull();
  });
});

describe("parseTime and formatDate", () => {
  it("parseTime returns -Infinity for missing or invalid values", () => {
    expect(parseTime()).toBe(Number.NEGATIVE_INFINITY);
    expect(parseTime("not-a-date")).toBe(Number.NEGATIVE_INFINITY);
    expect(parseTime("2026-01-01")).toBeGreaterThan(0);
  });

  it("formatDate renders a short date and falls back to the raw value", () => {
    expect(formatDate("2026-01-05T12:00:00Z")).toContain("Jan");
    expect(formatDate("garbage")).toBe("garbage");
    expect(formatDate()).toBe("Never");
  });
});
