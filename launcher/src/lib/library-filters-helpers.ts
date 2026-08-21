import type { GameGroup } from "./game-groups";
import type { LibrarySortOption } from "./library-sort";

/**
 * Compatibility surface for the split library-filter modules.
 * New code should import from the specific module:
 *  - Filter state/persistence: ./library-filter-state
 *  - Catalog-entry hygiene:    ./catalog-entry-filter
 */

export {
  SIZE_QUERY_SEARCH_REGEX,
  PRODUCT_CATEGORIES,
  initialAdvancedFilters,
  normalizeStringArray,
  normalizeAdvancedFilters,
  readPersistedLibraryFilterState,
  type LibraryPlatformFilter,
  type AdvancedFilters,
  type PersistedLibraryFilterState,
} from "./library-filter-state";

import { SIZE_QUERY_SEARCH_REGEX } from "./library-filter-state";

export {
  isUnrealEngineAssetEntry,
  isUbisoftDlcEntry,
  shouldHideNonGameLibraryEntry,
} from "./catalog-entry-filter";

export function groupLastPlayedMillis(group: GameGroup): number {
  if (!group.lastPlayedAt) {
    return Number.NEGATIVE_INFINITY;
  }

  const parsed = Date.parse(group.lastPlayedAt);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

export function groupSizeGb(group: GameGroup): number {
  return group.variants.reduce((total, game) => total + (game.sizeGb ?? 0), 0);
}

export function sortGameGroups(groups: GameGroup[], sortOption: LibrarySortOption): GameGroup[] {
  const sorted = [...groups];
  switch (sortOption) {
    case "alphabetical":
      sorted.sort((left, right) => left.title.localeCompare(right.title));
      break;
    case "last_played":
      sorted.sort((left, right) => groupLastPlayedMillis(right) - groupLastPlayedMillis(left));
      break;
    case "playtime":
      sorted.sort((left, right) => right.playtimeMinutes - left.playtimeMinutes);
      break;
    case "size":
      sorted.sort((left, right) => groupSizeGb(right) - groupSizeGb(left));
      break;
  }
  return sorted;
}

export function parseLibrarySearchQuery(query: string) {
  const sizeMatch = query.match(SIZE_QUERY_SEARCH_REGEX);
  if (!sizeMatch) {
    return {
      activeSizeQueryFromSearch: "",
      parsedSearchText: query,
    };
  }

  return {
    activeSizeQueryFromSearch: sizeMatch[0],
    parsedSearchText: query.replace(SIZE_QUERY_SEARCH_REGEX, "").trim(),
  };
}
