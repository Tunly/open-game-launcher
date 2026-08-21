import { calculateSteamGameCompletionPercent } from "./achievement-completion";
import type { GameGroup, GroupedAchievement } from "./game-groups";

export interface GameAchievementRow {
  group: GameGroup;
  total: number;
  unlocked: number;
  completion: number;
  isPerfect: boolean;
  lastUnlockedAt: string | null;
  recentAchievements: GroupedAchievement[];
}

export function parseTime(value?: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

export function formatDate(value?: string | null): string {
  if (!value) return "Never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Project a game group into the row model the achievements page renders.
 * Pure and side-effect free so the completion/isPerfect/recent logic is
 * testable without mounting the page.
 */
export function buildAchievementRow(group: GameGroup): GameAchievementRow {
  const achievements = group.achievements;
  const completionAchievements = achievements.filter((achievement) => !achievement.isAdditional);
  const summaries = group.variants.flatMap((game) =>
    game.achievementSummary && game.achievementSummary.total > 0 ? [game.achievementSummary] : [],
  );
  const achievementSummary =
    summaries.find((summary) => summary.isPerfect && summary.unlocked >= summary.total) ??
    summaries[0];
  const total = achievementSummary?.total ?? completionAchievements.length;
  const unlocked =
    achievementSummary?.unlocked ??
    completionAchievements.filter((achievement) => achievement.unlockedAt).length;
  const completion = calculateSteamGameCompletionPercent({ total, unlocked });
  const isPerfect = achievementSummary
    ? achievementSummary.isPerfect && unlocked >= total
    : total > 0 && unlocked === total;
  const lastUnlockedAt = achievements.reduce<string | null>((latest, achievement) => {
    if (!achievement.unlockedAt) return latest;
    return parseTime(achievement.unlockedAt) > parseTime(latest) ? achievement.unlockedAt : latest;
  }, null);
  const recentAchievements = [...achievements]
    .filter((achievement) => achievement.unlockedAt)
    .sort((left, right) => parseTime(right.unlockedAt) - parseTime(left.unlockedAt))
    .slice(0, 3);

  return {
    group,
    total,
    unlocked,
    completion,
    isPerfect,
    lastUnlockedAt,
    recentAchievements,
  };
}
