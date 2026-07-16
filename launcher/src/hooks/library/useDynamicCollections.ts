import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { LibraryAdvancedFilters } from "../../lib/library-filters";
import { normalizeAdvancedFilters } from "../../lib/library-filters-helpers";
import { STORAGE_KEYS } from "../../lib/storage-keys";
import type { LibrarySortOption } from "../../lib/library-sort";

export interface DynamicCollection {
  name: string;
  filters: LibraryAdvancedFilters;
  platformFilter: "all" | "windows" | "macos" | "linux";
  searchQuery: string;
  sortOption: LibrarySortOption;
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
  setSortOption: Dispatch<SetStateAction<LibrarySortOption>>;
  currentAdvancedFilters: LibraryAdvancedFilters;
  currentPlatformFilter: "all" | "windows" | "macos" | "linux";
  currentSearchQuery: string;
  currentSortOption: LibrarySortOption;
}

const PLATFORM_FILTERS = ["all", "windows", "macos", "linux"] as const;
const SORT_OPTIONS: LibrarySortOption[] = ["alphabetical", "last_played", "playtime", "size"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseDynamicCollection(value: unknown): DynamicCollection | null {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) {
    return null;
  }
  if (!isRecord(value.filters)) {
    return null;
  }
  if (
    typeof value.platformFilter !== "string" ||
    !PLATFORM_FILTERS.includes(value.platformFilter as (typeof PLATFORM_FILTERS)[number]) ||
    typeof value.searchQuery !== "string"
  ) {
    return null;
  }

  const sortOption = SORT_OPTIONS.includes(value.sortOption as LibrarySortOption)
    ? (value.sortOption as LibrarySortOption)
    : "alphabetical";

  return {
    name: value.name.trim(),
    filters: normalizeAdvancedFilters(value.filters),
    platformFilter: value.platformFilter as DynamicCollection["platformFilter"],
    searchQuery: value.searchQuery,
    sortOption,
  };
}

function readDynamicCollections(): DynamicCollection[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.LIBRARY_DYNAMIC_COLLECTIONS);
    if (!saved) {
      return [];
    }

    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(parseDynamicCollection)
      .filter((collection): collection is DynamicCollection => collection !== null);
  } catch {
    return [];
  }
}

function writeDynamicCollections(collections: DynamicCollection[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.LIBRARY_DYNAMIC_COLLECTIONS, JSON.stringify(collections));
  } catch {
    // Storage can be unavailable or full. Keep the in-memory library usable.
  }
}

export function useDynamicCollections(
  options: UseDynamicCollectionsOptions,
): UseDynamicCollectionsResult {
  const {
    setAdvancedFilters,
    setActivePlatformFilter,
    setSearchQuery,
    setSortOption,
    currentAdvancedFilters,
    currentPlatformFilter,
    currentSearchQuery,
    currentSortOption,
  } = options;

  const [dynamicCollections, setDynamicCollections] =
    useState<DynamicCollection[]>(readDynamicCollections);

  const [newCollectionName, setNewCollectionName] = useState("");
  const [selectedCollectionName, setSelectedCollectionName] = useState<string | null>(null);

  useEffect(() => {
    writeDynamicCollections(dynamicCollections);
  }, [dynamicCollections]);

  function applyDynamicCollection(name: string) {
    const collection = dynamicCollections.find(
      (entry) => entry.name.toLowerCase() === name.toLowerCase(),
    );
    if (!collection) {
      return;
    }

    setSelectedCollectionName(collection.name);
    setAdvancedFilters(normalizeAdvancedFilters(collection.filters));
    setActivePlatformFilter(collection.platformFilter);
    setSearchQuery(collection.searchQuery);
    setSortOption(collection.sortOption);
  }

  function saveCurrentFilterAsCollection(name: string) {
    if (!name.trim()) return;
    const trimmedName = name.trim();
    const newCol: DynamicCollection = {
      name: trimmedName,
      filters: currentAdvancedFilters,
      platformFilter: currentPlatformFilter,
      searchQuery: currentSearchQuery,
      sortOption: currentSortOption,
    };
    setDynamicCollections((prev) => {
      const filtered = prev.filter((c) => c.name.toLowerCase() !== trimmedName.toLowerCase());
      return [...filtered, newCol];
    });
    setNewCollectionName("");
    setSelectedCollectionName(trimmedName);
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
