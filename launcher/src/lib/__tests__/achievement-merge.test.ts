import { describe, expect, it } from "vitest";

import {
  achievementIdentityKey,
  mergeAchievementPrecedence,
  mergeAchievementRows,
} from "../achievement-merge";
import type { UnifiedAchievement } from "../types";

function achievement(overrides: Partial<UnifiedAchievement> = {}): UnifiedAchievement {
  return {
    description: null,
    id: "steam:1",
    name: "Win one game",
    source: "steam",
    sourceAchievementId: "1",
    unlockedAt: null,
    ...overrides,
  } as UnifiedAchievement;
}

describe("achievement merge policy", () => {
  it("keys by provider:sourceAchievementId", () => {
    expect(achievementIdentityKey(achievement({ source: "battle.net" }), "steam")).toBe(
      "battle.net:1",
    );
    expect(achievementIdentityKey(achievement({ source: undefined }), "steam")).toBe("steam:1");
  });

  it("prefers local values over remote, and current over both", () => {
    const local = achievement({ description: "Local desc", unlockedAt: "2026-01-01" });
    const remote = achievement({ description: "Remote desc", unlockedAt: "2026-06-01" });
    const merged = mergeAchievementPrecedence(local, remote, undefined);
    expect(merged.description).toBe("Local desc");
    expect(merged.unlockedAt).toBe("2026-01-01");
  });

  it("does not introduce spurious null keys for absent fields", () => {
    const local = achievement({ iconUrl: undefined, rarity: undefined });
    const remote = achievement({ iconUrl: undefined, rarity: undefined });
    const merged = mergeAchievementPrecedence(local, remote, undefined);
    expect("iconUrl" in merged).toBe(false);
    expect("rarity" in merged).toBe(false);
  });

  it("merges remote rows into local, preserving remote order for new rows", () => {
    const local = [
      achievement({ id: "steam:1", sourceAchievementId: "1", description: "Local desc" }),
    ];
    const remote = [
      achievement({ id: "steam:2", sourceAchievementId: "2", name: "New one" }),
      achievement({ id: "steam:1", sourceAchievementId: "1", description: "Remote desc" }),
    ];
    const merged = mergeAchievementRows(local, remote, "steam");
    expect(merged.map((a) => a.sourceAchievementId)).toEqual(["2", "1"]);
    // Local description wins for the known row.
    expect(merged[1]!.description).toBe("Local desc");
  });
});
