export interface AchievementCompletionProgress {
  unlocked: number;
  total: number;
}

function getSafeProgress({ unlocked, total }: AchievementCompletionProgress) {
  if (!Number.isFinite(unlocked) || !Number.isFinite(total) || total <= 0) {
    return null;
  }

  const safeTotal = Math.max(0, total);
  return {
    total: safeTotal,
    unlocked: Math.min(Math.max(0, unlocked), safeTotal),
  };
}

/** Mirrors the whole-number percentage shown by Steam for one game's achievements. */
export function calculateSteamGameCompletionPercent(
  progress: AchievementCompletionProgress,
): number {
  const safeProgress = getSafeProgress(progress);
  if (!safeProgress) return 0;

  return Math.round((safeProgress.unlocked / safeProgress.total) * 100);
}

/**
 * Mirrors Steam's Average Game Completion Rate:
 * - a game becomes eligible after at least one achievement has been unlocked;
 * - unrounded per-game completion ratios are averaged with equal game weight;
 * - only the final result is rounded down to a whole percent.
 */
export function calculateSteamAverageGameCompletionRate(
  progressRows: readonly AchievementCompletionProgress[],
): number {
  const eligibleCompletionRatios = progressRows.flatMap((progress) => {
    const safeProgress = getSafeProgress(progress);
    return safeProgress && safeProgress.unlocked > 0
      ? [safeProgress.unlocked / safeProgress.total]
      : [];
  });

  if (eligibleCompletionRatios.length === 0) return 0;

  const completionRatioTotal = eligibleCompletionRatios.reduce((sum, ratio) => sum + ratio, 0);
  return Math.floor((completionRatioTotal / eligibleCompletionRatios.length) * 100);
}
