import { useDeferredValue, useMemo } from "react";

import { applyCustomArtwork, type GameCustomArtwork } from "../../lib/custom-artwork";
import { groupGames, type GameGroup } from "../../lib/game-groups";
import {
  countActiveAdvancedFilters,
  gamePassesAdvancedFilters,
  matchesSearchQuery,
  matchesSizeQuery,
  type LibraryAdvancedFilters,
} from "../../lib/library-filters";
import type { LibrarySortOption } from "../../lib/library-sort";
import {
  enrichGameWithMetadata,
  FALLBACK_MOCK_GAMES,
  parseLibrarySearchQuery,
  shouldHideNonGameLibraryEntry,
  sortGameGroups,
  initialAdvancedFilters,
  getXboxConnectionStatus,
} from "../../lib/library-filters-helpers";
import type { Game } from "../../lib/types";
import type { LibraryPlatformFilter } from "../../lib/library-filters-helpers";

export interface UseLibraryFilterPipelineOptions {
  installedGames: Game[];
  customArtwork: Record<string, GameCustomArtwork>;
  favorites: Record<string, boolean>;
  hiddenGames: Record<string, boolean>;
  customCategories: Record<string, string[]>;
  manualCollections: Record<string, string[]>;
  selectedManualCollectionName: string | null;
  searchQuery: string;
  activePlatformFilter: LibraryPlatformFilter;
  advancedFilters: LibraryAdvancedFilters;
  sortOption: LibrarySortOption;
  selectedGroupId: string | null;
}

export interface UseLibraryFilterPipelineResult {
  baseLibraryGames: Game[];
  enrichedLibraryGames: Game[];
  libraryGroups: GameGroup[];
  filteredGroups: GameGroup[];
  selectedGroup: GameGroup | null;
  activeAdvancedFilterCount: number;
  fallbackMockGames: Game[];
}

export function useLibraryFilterPipeline(
  options: UseLibraryFilterPipelineOptions,
): UseLibraryFilterPipelineResult {
  const {
    installedGames,
    customArtwork,
    favorites,
    hiddenGames,
    customCategories,
    manualCollections,
    selectedManualCollectionName,
    searchQuery,
    activePlatformFilter,
    advancedFilters,
    sortOption,
    selectedGroupId,
  } = options;

  const baseLibraryGames = useMemo(
    () =>
      (installedGames.length > 0 ? installedGames : FALLBACK_MOCK_GAMES)
        .filter((game) => !shouldHideNonGameLibraryEntry(game))
        .map((game) => applyCustomArtwork(game, customArtwork[game.id])),
    [customArtwork, installedGames],
  );

  const enrichedLibraryGames = useMemo(
    () => baseLibraryGames.map(enrichGameWithMetadata),
    [baseLibraryGames],
  );

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const { activeSizeQueryFromSearch, parsedSearchText } = useMemo(
    () => parseLibrarySearchQuery(deferredSearchQuery),
    [deferredSearchQuery],
  );

  const selectedManualCollectionIds = useMemo(() => {
    if (!selectedManualCollectionName) {
      return null;
    }
    return new Set(manualCollections[selectedManualCollectionName] || []);
  }, [manualCollections, selectedManualCollectionName]);

  const filteredVariantGames = useMemo(() => {
    const filterContext = {
      activePlatformFilter,
      favorites,
      hiddenGames,
      customCategories,
    };

    return enrichedLibraryGames.filter((game) => {
      if (!matchesSearchQuery(game, parsedSearchText)) {
        return false;
      }

      const sizeQ = advancedFilters.sizeQuery || activeSizeQueryFromSearch;
      if (sizeQ && !matchesSizeQuery(game.sizeGb || 0, sizeQ)) {
        return false;
      }

      if (!gamePassesAdvancedFilters(game, advancedFilters, filterContext)) {
        return false;
      }

      if (selectedManualCollectionIds) {
        if (!selectedManualCollectionIds.has(game.id)) {
          return false;
        }
      }

      return true;
    });
  }, [
    enrichedLibraryGames,
    activePlatformFilter,
    advancedFilters,
    favorites,
    hiddenGames,
    customCategories,
    activeSizeQueryFromSearch,
    parsedSearchText,
    selectedManualCollectionIds,
  ]);

  const grouped = useMemo(() => groupGames(filteredVariantGames), [filteredVariantGames]);

  const libraryGroups = useMemo(() => sortGameGroups(grouped, sortOption), [grouped, sortOption]);

  const filteredGroups = libraryGroups;

  const selectedGroup = useMemo(
    () => filteredGroups.find((group) => group.id === selectedGroupId) ?? null,
    [filteredGroups, selectedGroupId],
  );

  const activeAdvancedFilterCount = useMemo(
    () =>
      countActiveAdvancedFilters(advancedFilters, {
        ...initialAdvancedFilters,
        showGamePassCatalog: getXboxConnectionStatus(),
      }),
    [advancedFilters],
  );

  return {
    baseLibraryGames,
    enrichedLibraryGames,
    libraryGroups,
    filteredGroups,
    selectedGroup,
    activeAdvancedFilterCount,
    fallbackMockGames: FALLBACK_MOCK_GAMES,
  };
}
