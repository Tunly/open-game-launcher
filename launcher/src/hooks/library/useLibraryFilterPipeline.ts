import { useDeferredValue, useMemo } from "react";

import type { GameCustomArtwork } from "../../lib/custom-artwork";
import { resolveGameArtwork, type ArtworkSources } from "../../lib/artwork-resolver";
import type { IgdbAssetResponse } from "../../lib/supabase/igdb-artwork";
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
  parseLibrarySearchQuery,
  shouldHideNonGameLibraryEntry,
  sortGameGroups,
  initialAdvancedFilters,
} from "../../lib/library-filters-helpers";
import type { Game } from "../../lib/types";
import type { LibraryPlatformFilter } from "../../lib/library-filters-helpers";

export interface UseLibraryFilterPipelineOptions {
  installedGames: Game[];
  customArtwork: Record<string, GameCustomArtwork>;
  /** IGDB assets keyed by trimmed title, resolved by useIgdbArtwork. */
  igdbArtworkByTitle?: Record<string, IgdbAssetResponse>;
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
}

export function useLibraryFilterPipeline(
  options: UseLibraryFilterPipelineOptions,
): UseLibraryFilterPipelineResult {
  const {
    installedGames,
    customArtwork,
    igdbArtworkByTitle,
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

  // Pure derivation: artwork resolution happens here with whatever sources
  // the caller already has. No network I/O in this hook.
  const baseLibraryGames = useMemo(
    () =>
      installedGames
        .filter((game) => !shouldHideNonGameLibraryEntry(game))
        .map((game) => {
          const sources: ArtworkSources = {
            custom: customArtwork[game.id],
            igdb: igdbArtworkByTitle?.[game.title.trim()],
          };
          return resolveGameArtwork(game, sources);
        }),
    [customArtwork, igdbArtworkByTitle, installedGames],
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
      if (sizeQ && !matchesSizeQuery(game.sizeGb, sizeQ)) {
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

  const libraryGroups = useMemo(
    () => sortGameGroups(groupGames(enrichedLibraryGames), sortOption),
    [enrichedLibraryGames, sortOption],
  );

  const filteredGroups = useMemo(
    () => sortGameGroups(groupGames(filteredVariantGames), sortOption),
    [filteredVariantGames, sortOption],
  );

  const selectedGroup = useMemo(
    () => filteredGroups.find((group) => group.id === selectedGroupId) ?? null,
    [filteredGroups, selectedGroupId],
  );

  const activeAdvancedFilterCount = useMemo(
    () => countActiveAdvancedFilters(advancedFilters, initialAdvancedFilters),
    [advancedFilters],
  );

  return {
    baseLibraryGames,
    enrichedLibraryGames,
    libraryGroups,
    filteredGroups,
    selectedGroup,
    activeAdvancedFilterCount,
  };
}
