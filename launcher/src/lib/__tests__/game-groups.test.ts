import { describe, expect, it } from "vitest";
import { aggregateGameGroup } from "../game-groups";
import type { Game, UnifiedAchievement } from "../types";

function achievement(overrides: Partial<UnifiedAchievement>): UnifiedAchievement {
  return {
    id: "ACH",
    name: "Achievement",
    description: "Do the thing",
    ...overrides,
  };
}

function makeGame(overrides: Partial<Game>): Game {
  return {
    id: "game",
    title: "Shared Game",
    description: "",
    version: "1.0.0",
    launcher: "steam",
    platform: "windows",
    status: "installed",
    achievements: [],
    ...overrides,
  };
}

describe("aggregateGameGroup achievements", () => {
  it("uses the platform variant with the most achievements as basis", () => {
    const steam = makeGame({
      id: "steam-1",
      launcher: "steam",
      achievements: Array.from({ length: 50 }, (_, index) =>
        achievement({ id: `S${index}`, name: `Achievement ${index}` }),
      ),
    });
    const xbox = makeGame({
      id: "xbox-1",
      launcher: "xbox",
      achievements: Array.from({ length: 45 }, (_, index) =>
        achievement({ id: `X${index}`, name: `Achievement ${index}` }),
      ),
    });

    const group = aggregateGameGroup([xbox, steam]);

    expect(group.achievementBasisSource).toBe("steam");
    expect(group.achievementBasisGameId).toBe("steam-1");
    expect(group.achievements).toHaveLength(50);
  });

  it("keeps additional achievements from non-basis variants", () => {
    const steam = makeGame({
      id: "steam-1",
      launcher: "steam",
      achievements: [achievement({ id: "S1", name: "Story Start" })],
    });
    const xbox = makeGame({
      id: "xbox-1",
      launcher: "xbox",
      achievements: [achievement({ id: "X1", name: "Xbox Only" })],
    });

    const group = aggregateGameGroup([steam, xbox]);
    const extra = group.achievements.find((item) => item.name === "Xbox Only");

    expect(extra?.isAdditional).toBe(true);
    expect(extra?.matchConfidence).toBe("additional");
  });

  it("merges the same achievement across platforms and preserves sources", () => {
    const steam = makeGame({
      id: "steam-1",
      launcher: "steam",
      achievements: [
        achievement({
          id: "S1",
          name: "Story Start",
          description: "Begin the campaign",
          rarity: 20,
        }),
      ],
    });
    const xbox = makeGame({
      id: "xbox-1",
      launcher: "xbox",
      achievements: [
        achievement({
          id: "X1",
          name: "Story Start",
          description: "Begin the campaign",
          unlockedAt: "2026-01-01T00:00:00.000Z",
          rarity: 10,
        }),
      ],
    });

    const group = aggregateGameGroup([steam, xbox]);
    const merged = group.achievements[0];

    expect(group.achievements).toHaveLength(1);
    expect(merged.unlockedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(merged.rarity).toBe(10);
    expect(merged.sourceLabels).toEqual(["steam", "xbox"]);
    expect(merged.matchConfidence).toBe("name_description");
  });

  it("uses name-only matching with lower confidence", () => {
    const steam = makeGame({
      id: "steam-1",
      launcher: "steam",
      achievements: [achievement({ id: "S1", name: "Collector", description: "Find 10 items" })],
    });
    const gog = makeGame({
      id: "gog-1",
      launcher: "gog",
      achievements: [achievement({ id: "G1", name: "Collector", description: "Find everything" })],
    });

    const group = aggregateGameGroup([steam, gog]);

    expect(group.achievements).toHaveLength(1);
    expect(group.achievements[0].matchConfidence).toBe("name");
  });

  it("preserves explicit provider statuses on grouped games", () => {
    const steam = makeGame({
      id: "steam-1",
      launcher: "steam",
      achievements: [achievement({ id: "S1", name: "Story Start" })],
      achievementProviderStatuses: [
        {
          source: "steam",
          status: "available",
          stability: "official",
          message: "Steam synced",
        },
      ],
    });
    const xbox = makeGame({
      id: "xbox-1",
      launcher: "xbox",
      achievements: [achievement({ id: "X1", name: "Xbox Cached" })],
      achievementProviderStatuses: [
        {
          source: "xbox",
          status: "failed",
          stability: "official",
          message: "Xbox TitleId could not be resolved",
        },
      ],
    });

    const group = aggregateGameGroup([steam, xbox]);

    expect(group.achievementProviderStatuses).toContainEqual({
      source: "steam",
      status: "available",
      stability: "official",
      message: "Steam synced",
    });
    expect(group.achievementProviderStatuses).toContainEqual({
      source: "xbox",
      status: "failed",
      stability: "official",
      message: "Xbox TitleId could not be resolved",
    });
    expect(group.displayGame.achievementProviderStatuses).toEqual(
      group.achievementProviderStatuses,
    );
  });
});
