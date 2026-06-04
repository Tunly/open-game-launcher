import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { LibraryAdvancedFilters } from "../../lib/library-filters";
import { STORAGE_KEYS } from "../../lib/storage-keys";
import type { LibrarySortOption } from "../../lib/library-sort";

export interface DynamicCollection {
  name: string;
  filters: LibraryAdvancedFilters;
  platformFilter: "all" | "windows" | "macos" | "linux";
  searchQuery: string;
}

export interface UseDynamicCollectionsResult {
  dynamicCollections: DynamicCollection[];
  newCollectionName: string;
  setNewCollectionName: Dispatch<SetStateAction<string>>;
  selectedCollectionName: string | null;
  setSelectedCollectionName: Dispatch<SetStateAction<string | null>>;
  applyDynamicCollection: (name: string) => void;
  saveCurrentFilterAsCollection: (name: string) => void;
}

export interface UseDynamicCollectionsOptions {
  setAdvancedFilters: Dispatch<SetStateAction<LibraryAdvancedFilters>>;
  setActivePlatformFilter: Dispatch<SetStateAction<"all" | "windows" | "macos" | "linux">>;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  currentAdvancedFilters: LibraryAdvancedFilters;
  currentPlatformFilter: "all" | "windows" | "macos" | "linux";
  currentSearchQuery: string;
  currentSortOption: LibrarySortOption;
}

export function useDynamicCollections(
  options: UseDynamicCollectionsOptions,
): UseDynamicCollectionsResult {
  const {
    setAdvancedFilters,
    setActivePlatformFilter,
    setSearchQuery,
    currentAdvancedFilters,
    currentPlatformFilter,
    currentSearchQuery,
  } = options;

  const [dynamicCollections, setDynamicCollections] = useState<DynamicCollection[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LIBRARY_DYNAMIC_COLLECTIONS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [newCollectionName, setNewCollectionName] = useState("");
  const [selectedCollectionName, setSelectedCollectionName] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.LIBRARY_DYNAMIC_COLLECTIONS,
      JSON.stringify(dynamicCollections),
    );
  }, [dynamicCollections]);

  function applyDynamicCollection(name: string) {
    const collection = dynamicCollections.find(
      (entry) => entry.name.toLowerCase() === name.toLowerCase(),
    );
    if (!collection) {
      return;
    }

    setSelectedCollectionName(collection.name);
    setAdvancedFilters(collection.filters);
    setActivePlatformFilter(collection.platformFilter);
    setSearchQuery(collection.searchQuery);
  }

  function saveCurrentFilterAsCollection(name: string) {
    if (!name.trim()) return;
    const trimmedName = name.trim();
    const newCol: DynamicCollection = {
      name: trimmedName,
      filters: currentAdvancedFilters,
      platformFilter: currentPlatformFilter,
      searchQuery: currentSearchQuery,
    };
    setDynamicCollections((prev) => {
      const filtered = prev.filter((c) => c.name.toLowerCase() !== trimmedName.toLowerCase());
      return [...filtered, newCol];
    });
    setNewCollectionName("");
    applyDynamicCollection(trimmedName);
  }

  return {
    dynamicCollections,
    newCollectionName,
    setNewCollectionName,
    selectedCollectionName,
    setSelectedCollectionName,
    applyDynamicCollection,
    saveCurrentFilterAsCollection,
  };
}
