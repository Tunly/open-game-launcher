import type { UnifiedAchievement } from "./types";

export type AchievementViewSort = "rarity" | "name" | "date";
export type AchievementViewTab = "my" | "global";

export interface AchievementViewOptions {
  /** Substring filter against name + description. */
  query?: string;
  /** "locked", "unlocked", "source:<name>", or empty for all. */
  filter?: string;
  /** Sort mode. "my" tab maps to unlocked-first-then-name. */
  sort?: AchievementViewSort;
  tab?: AchievementViewTab;
}

/** Extra sources attached to grouped achievements (not part of UnifiedAchievement). */
export interface AchievementWithSources extends UnifiedAchievement {
  sourceLabels?: string[];
}

/**
 * Filter + sort achievements for a viewer surface. Both GameDetails and the
 * AchievementViewerModal share this so the ordering policy cannot drift
 * between the two lists.
 */
export function filterAndSortAchievements(
  achievements: UnifiedAchievement[],
  filter: string,
  sort: AchievementViewSort,
): UnifiedAchievement[];
export function filterAndSortAchievements(
  achievements: UnifiedAchievement[],
  options?: AchievementViewOptions,
): UnifiedAchievement[];
export function filterAndSortAchievements(
  achievements: UnifiedAchievement[],
  filterOrOptions: string | AchievementViewOptions = {},
  sort?: AchievementViewSort,
): UnifiedAchievement[] {
  const options: AchievementViewOptions =
    typeof filterOrOptions === "string" ? { filter: filterOrOptions, sort } : filterOrOptions;
  const { query = "", filter = "", sort: sortMode = "name", tab = "my" } = options;
  const needle = query.trim().toLowerCase();

  const filtered = achievements.filter((achievement) => {
    if (needle) {
      const haystack = `${achievement.name} ${achievement.description ?? ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (filter === "locked") return !achievement.unlockedAt;
    if (filter === "unlocked") return Boolean(achievement.unlockedAt);
    if (filter.startsWith("source:")) {
      const source = filter.slice("source:".length);
      return ((achievement as AchievementWithSources).sourceLabels ?? []).includes(source);
    }
    return true;
  });

  const sorted = [...filtered];
  if (tab === "global") {
    // Lower rarity first (rarest = most interesting). Locked with no rarity go last.
    sorted.sort((a, b) => {
      const ar = typeof a.rarity === "number" ? a.rarity : Number.POSITIVE_INFINITY;
      const br = typeof b.rarity === "number" ? b.rarity : Number.POSITIVE_INFINITY;
      return ar - br;
    });
    return sorted;
  }

  if (sortMode === "rarity") {
    sorted.sort((a, b) => {
      const ar = typeof a.rarity === "number" ? a.rarity : Number.POSITIVE_INFINITY;
      const br = typeof b.rarity === "number" ? b.rarity : Number.POSITIVE_INFINITY;
      return ar - br;
    });
  } else if (sortMode === "name") {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortMode === "date") {
    sorted.sort((a, b) => {
      // Unlocked first, newest first. Locked go to the end.
      if (Boolean(a.unlockedAt) !== Boolean(b.unlockedAt)) {
        return a.unlockedAt ? -1 : 1;
      }
      const at = a.unlockedAt ? Date.parse(a.unlockedAt) : 0;
      const bt = b.unlockedAt ? Date.parse(b.unlockedAt) : 0;
      return bt - at;
    });
  } else {
    // "my" default: unlocked first, then by name.
    sorted.sort((a, b) => {
      const unlockedDelta = Number(Boolean(b.unlockedAt)) - Number(Boolean(a.unlockedAt));
      if (unlockedDelta !== 0) return unlockedDelta;
      return a.name.localeCompare(b.name);
    });
  }
  return sorted;
}
