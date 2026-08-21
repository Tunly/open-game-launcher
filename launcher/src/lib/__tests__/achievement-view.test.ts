import { describe, expect, it } from "vitest";

import { filterAndSortAchievements } from "../achievement-view";
import type { UnifiedAchievement } from "../types";

function achievement(overrides: Partial<UnifiedAchievement> = {}): UnifiedAchievement {
  return {
    description: null,
    id: "a-1",
    name: "Alpha",
    source: "steam",
    sourceAchievementId: "1",
    unlockedAt: null,
    ...overrides,
  } as UnifiedAchievement;
}

describe("filterAndSortAchievements", () => {
  it("filters by query against name and description", () => {
    const items = [
      achievement({ name: "Perfect Line", id: "1" }),
      achievement({ name: "Hard Reset", id: "2" }),
      achievement({ name: "Ghost", description: "Sneak past perfect guards", id: "3" }),
    ];
    const result = filterAndSortAchievements(items, { query: "perfect" });
    expect(result.map((a) => a.id).sort()).toEqual(["1", "3"]);
  });

  it("filters locked and unlocked", () => {
    const items = [
      achievement({ id: "1", unlockedAt: "2026-01-01" }),
      achievement({ id: "2", unlockedAt: null }),
    ];
    expect(filterAndSortAchievements(items, { filter: "unlocked" }).map((a) => a.id)).toEqual([
      "1",
    ]);
    expect(filterAndSortAchievements(items, { filter: "locked" }).map((a) => a.id)).toEqual(["2"]);
  });

  it("sorts by rarity ascending with missing rarity last", () => {
    const items = [
      achievement({ id: "rare", rarity: 1 }),
      achievement({ id: "none" }),
      achievement({ id: "common", rarity: 80 }),
    ];
    expect(filterAndSortAchievements(items, { sort: "rarity" }).map((a) => a.id)).toEqual([
      "rare",
      "common",
      "none",
    ]);
  });

  it("sorts by date with unlocked first, newest first", () => {
    const items = [
      achievement({ id: "old", unlockedAt: "2026-01-01" }),
      achievement({ id: "locked" }),
      achievement({ id: "new", unlockedAt: "2026-06-01" }),
    ];
    expect(filterAndSortAchievements(items, { sort: "date" }).map((a) => a.id)).toEqual([
      "new",
      "old",
      "locked",
    ]);
  });

  it("sorts by name", () => {
    const items = [achievement({ name: "Zulu" }), achievement({ name: "Alpha" })];
    expect(filterAndSortAchievements(items, { sort: "name" }).map((a) => a.name)).toEqual([
      "Alpha",
      "Zulu",
    ]);
  });

  it("my tab: unlocked first, then by name", () => {
    const items = [
      achievement({ id: "z-locked", name: "Zulu", unlockedAt: null }),
      achievement({ id: "a-unlocked", name: "Alpha", unlockedAt: "2026-01-01" }),
    ];
    expect(filterAndSortAchievements(items, { tab: "my" }).map((a) => a.id)).toEqual([
      "a-unlocked",
      "z-locked",
    ]);
  });

  it("global tab: rarity ascending with missing rarity last", () => {
    const items = [achievement({ id: "none" }), achievement({ id: "rare", rarity: 2 })];
    expect(filterAndSortAchievements(items, { tab: "global" }).map((a) => a.id)).toEqual([
      "rare",
      "none",
    ]);
  });

  it("supports the legacy (filter, sort) signature", () => {
    const items = [
      achievement({ id: "locked" }),
      achievement({ id: "unlocked", unlockedAt: "2026-01-01" }),
    ];
    expect(filterAndSortAchievements(items, "unlocked", "name").map((a) => a.id)).toEqual([
      "unlocked",
    ]);
  });
});
