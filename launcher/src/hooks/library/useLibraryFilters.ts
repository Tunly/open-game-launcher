import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { LibraryAdvancedFilters } from "../../lib/library-filters";
import type { LibrarySortOption } from "../../lib/library-sort";
import { STORAGE_KEYS } from "../../lib/storage-keys";
import type { Game } from "../../lib/types";
import type { GameCustomArtwork } from "../../lib/custom-artwork";
import type { GameGroup } from "../../lib/game-groups";
import {
  initialAdvancedFilters,
  readPersistedLibraryFilterState,
  type LibraryPlatformFilter,
  type PersistedLibraryFilterState,
} from "../../lib/library-filters-helpers";
import {
  useLibraryFilterPipeline,
  type UseLibraryFilterPipelineResult,
} from "./useLibraryFilterPipeline";

// useLibraryFilters combines state management with the filter pipeline hook.
// The state is owned here; the pipeline is a pure derivation of those state
// values plus the library data passed in by the caller.

export interface UseLibraryFiltersOptions {
  installedGames: Game[];
  customArtwork: Record<string, GameCustomArtwork>;
  favorites: Record<string, boolean>;
  hiddenGames: Record<string, boolean>;
  customCategories: Record<string, string[]>;
  manualCollections: Record<string, string[]>;
  selectedManualCollectionName: string | null;
  isDiscoveringGames: boolean;
}

export interface UseLibraryFiltersResult extends UseLibraryFilterPipelineResult {
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  activePlatformFilter: LibraryPlatformFilter;
  setActivePlatformFilter: Dispatch<SetStateAction<LibraryPlatformFilter>>;
  isFilterPopupOpen: boolean;
  setIsFilterPopupOpen: Dispatch<SetStateAction<boolean>>;
  advancedFilters: LibraryAdvancedFilters;
  setAdvancedFilters: Dispatch<SetStateAction<LibraryAdvancedFilters>>;
  sortOption: LibrarySortOption;
  setSortOption: Dispatch<SetStateAction<LibrarySortOption>>;
  setSelectedGroupId: Dispatch<SetStateAction<string | null>>;
  pendingSelectedGameId: string | null;
  setPendingSelectedGameId: Dispatch<SetStateAction<string | null>>;
  hasActiveFilters: boolean;
  resetAdvancedFilters: () => void;
}

export function useLibraryFilters(options: UseLibraryFiltersOptions): UseLibraryFiltersResult {
  const {
    installedGames,
    customArtwork,
    favorites,
    hiddenGames,
    customCategories,
    manualCollections,
    selectedManualCollectionName,
  } = options;

  const [persistedLibraryFilterState] = useState<PersistedLibraryFilterState>(
    readPersistedLibraryFilterState,
  );
  const [searchQuery, setSearchQuery] = useState(persistedLibraryFilterState.searchQuery);
  const [activePlatformFilter, setActivePlatformFilter] = useState<LibraryPlatformFilter>(
    persistedLibraryFilterState.activePlatformFilter,
  );
  const [isFilterPopupOpen, setIsFilterPopupOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<LibraryAdvancedFilters>(
    persistedLibraryFilterState.advancedFilters,
  );
  const [sortOption, setSortOption] = useState<LibrarySortOption>(
    persistedLibraryFilterState.sortOption,
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [pendingSelectedGameId, setPendingSelectedGameId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEYS.LIBRARY_FILTER_STATE,
          JSON.stringify({
            activePlatformFilter,
            advancedFilters,
            searchQuery,
            sortOption,
          } satisfies PersistedLibraryFilterState),
        );
      } catch {
        // Storage can be unavailable or full. Keep the in-memory filters usable.
      }
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [activePlatformFilter, advancedFilters, searchQuery, sortOption]);

  const pipeline = useLibraryFilterPipeline({
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
  });

  function resetAdvancedFilters() {
    setAdvancedFilters(initialAdvancedFilters);
    setActivePlatformFilter("all");
    setSearchQuery("");
  }

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    activePlatformFilter !== "all" ||
    pipeline.activeAdvancedFilterCount > 0 ||
    Boolean(selectedManualCollectionName);

  return {
    ...pipeline,
    searchQuery,
    setSearchQuery,
    activePlatformFilter,
    setActivePlatformFilter,
    isFilterPopupOpen,
    setIsFilterPopupOpen,
    advancedFilters,
    setAdvancedFilters,
    sortOption,
    setSortOption,
    setSelectedGroupId,
    pendingSelectedGameId,
    setPendingSelectedGameId,
    hasActiveFilters,
    resetAdvancedFilters,
  };
}

export {
  initialAdvancedFilters,
  shouldHideNonGameLibraryEntry,
} from "../../lib/library-filters-helpers";

export { useLibraryFilterPipeline } from "./useLibraryFilterPipeline";

export type { GameGroup };
