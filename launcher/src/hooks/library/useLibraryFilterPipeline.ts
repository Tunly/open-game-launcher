import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { applyCustomArtwork, type GameCustomArtwork } from "../../lib/custom-artwork";
import { getKnownProviderArtworkCandidates } from "../../lib/provider-artwork-fallback";
import { fetchIgdbArtwork, applyIgdbArtwork } from "../../lib/supabase/igdb-artwork";
import { applyArtworkFallback } from "../../lib/library-artwork-fallback";
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

  const [igdbArtworkByTitle, setIgdbArtworkByTitle] = useState<
    Record<string, Parameters<typeof applyIgdbArtwork>[1]>
  >({});

  useEffect(() => {
    let cancelled = false;
    const titles = [...new Set(installedGames.map((game) => game.title.trim()).filter(Boolean))];
    if (titles.length === 0) return;

    void Promise.all(
      titles.map(async (title) => [title, await fetchIgdbArtwork(title)] as const),
    ).then((results) => {
      if (cancelled) return;
      setIgdbArtworkByTitle((current) => {
        const next = { ...current };
        for (const [title, artwork] of results) {
          if (artwork && (artwork.coverUrl || artwork.iconUrl || artwork.logoUrl))
            next[title] = artwork;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [installedGames]);

  const baseLibraryGames = useMemo(
    () =>
      installedGames
        .filter((game) => !shouldHideNonGameLibraryEntry(game))
        .map((game) => {
          const candidates = getKnownProviderArtworkCandidates(game);
          const withProviderCandidates =
            candidates.length === 0
              ? game
              : {
                  ...game,
                  coverUrl: game.coverUrl ?? candidates[0],
                  iconUrl: game.iconUrl ?? candidates[0],
                  logoUrl: game.logoUrl ?? candidates[0],
                  iconUrls: [...new Set([...(game.iconUrls ?? []), ...candidates])],
                  logoUrls: [...new Set([...(game.logoUrls ?? []), ...candidates])],
                };
          return applyArtworkFallback(
            applyIgdbArtwork(
              applyCustomArtwork(withProviderCandidates, customArtwork[game.id]),
              igdbArtworkByTitle[game.title.trim()] ?? {},
            ),
          );
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
