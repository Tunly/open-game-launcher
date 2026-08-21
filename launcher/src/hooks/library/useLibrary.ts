import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { useLibrarySync } from "./useLibrarySync";
import { useManualCollections } from "./useManualCollections";
import { useLibraryFilters } from "./useLibraryFilters";
import { useDynamicCollections } from "./useDynamicCollections";
import { useAchievementAutoSync } from "./useAchievementAutoSync";
import { useProviderPicking } from "./useProviderPicking";
import type { LibraryContextValue } from "../../context/LibraryContext";

/**
 * The single library orchestrator. Owns all six library hooks and their
 * wiring, so pages and components consume one cohesive value instead of
 * re-plumbing hook results at every call site.
 */
export function useLibrary(): LibraryContextValue {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const sync = useLibrarySync({ setStatusMessage });
  const manual = useManualCollections();
  const filters = useLibraryFilters({
    installedGames: sync.installedGames,
    customArtwork: sync.customArtwork,
    favorites: manual.favorites,
    hiddenGames: manual.hiddenGames,
    customCategories: manual.customCategories,
    manualCollections: manual.manualCollections,
    selectedManualCollectionName: manual.selectedManualCollectionName,
    isDiscoveringGames: sync.isDiscoveringGames,
  });
  const dynamic = useDynamicCollections({
    setAdvancedFilters: filters.setAdvancedFilters,
    setActivePlatformFilter: filters.setActivePlatformFilter,
    setSearchQuery: filters.setSearchQuery,
    setSortOption: filters.setSortOption,
    currentAdvancedFilters: filters.advancedFilters,
    currentPlatformFilter: filters.activePlatformFilter,
    currentSearchQuery: filters.searchQuery,
    currentSortOption: filters.sortOption,
  });
  const achievements = useAchievementAutoSync({
    installedGames: sync.installedGames,
    selectedGroup: filters.selectedGroup,
    setInstalledGames: sync.setInstalledGames,
    setStatusMessage,
  });
  const picking = useProviderPicking({
    selectedGroup: filters.selectedGroup,
    setStatusMessage,
  });

  const value: LibraryContextValue = {
    sync,
    manual,
    filters,
    dynamic,
    achievements,
    picking,
    statusMessage,
    setStatusMessage: setStatusMessage as Dispatch<SetStateAction<string | null>>,
  };

  return value;
}
