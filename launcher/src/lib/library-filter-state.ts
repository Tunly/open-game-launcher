import type { LibraryAdvancedFilters } from "./library-filters";
import { STORAGE_KEYS } from "./storage-keys";
import type { LibrarySortOption } from "./library-sort";

/**
 * Filter-state: persistence, normalization, and defaults for the library
 * filter UI. Pure state helpers — the filter pipeline itself lives in
 * useLibraryFilterPipeline.
 */

export const SIZE_QUERY_SEARCH_REGEX = /(?:size\s*)?([><=])\s*(\d+(?:\.\d+)?)\s*(kb|mb|gb|tb)?/i;

export const PRODUCT_CATEGORIES = [
  "game",
  "software",
  "video",
  "dlc",
  "soundtrack",
  "demo",
  "beta",
  "unknown",
] as const;

export type LibraryPlatformFilter = "all" | "windows" | "macos" | "linux";

export type AdvancedFilters = LibraryAdvancedFilters;

export const initialAdvancedFilters: AdvancedFilters = {
  players: [],
  features: [],
  hardware: [],
  genres: [],
  status: [],
  platforms: [],
  launchers: [],
  categories: [],
  sizeQuery: "",
  productCategories: [...PRODUCT_CATEGORIES],
  showGamePassCatalog: true,
};

export function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function normalizeAdvancedFilters(value: unknown): AdvancedFilters {
  const stored =
    value && typeof value === "object"
      ? (value as Partial<Record<keyof AdvancedFilters, unknown>>)
      : {};

  return {
    players: normalizeStringArray(stored.players),
    // Feature filters were retired from the Library UI. Clearing legacy
    // selections prevents an invisible persisted filter from hiding games.
    features: [],
    hardware: normalizeStringArray(stored.hardware),
    genres: normalizeStringArray(stored.genres),
    status: normalizeStringArray(stored.status),
    platforms: normalizeStringArray(stored.platforms),
    launchers: normalizeStringArray(stored.launchers),
    categories: normalizeStringArray(stored.categories),
    sizeQuery: typeof stored.sizeQuery === "string" ? stored.sizeQuery : "",
    productCategories:
      normalizeStringArray(stored.productCategories).length > 0
        ? normalizeStringArray(stored.productCategories)
        : initialAdvancedFilters.productCategories,
    showGamePassCatalog:
      typeof stored.showGamePassCatalog === "boolean"
        ? stored.showGamePassCatalog
        : initialAdvancedFilters.showGamePassCatalog,
  };
}

export type PersistedLibraryFilterState = {
  activePlatformFilter: LibraryPlatformFilter;
  advancedFilters: AdvancedFilters;
  searchQuery: string;
  sortOption: LibrarySortOption;
};

export function readPersistedLibraryFilterState(): PersistedLibraryFilterState {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.LIBRARY_FILTER_STATE);
    const parsed = saved ? JSON.parse(saved) : {};
    const state =
      parsed && typeof parsed === "object" ? (parsed as Partial<PersistedLibraryFilterState>) : {};
    const activePlatformFilter = ["all", "windows", "macos", "linux"].includes(
      state.activePlatformFilter ?? "",
    )
      ? (state.activePlatformFilter as PersistedLibraryFilterState["activePlatformFilter"])
      : "all";
    const sortOption = ["alphabetical", "last_played", "playtime", "size"].includes(
      state.sortOption ?? "",
    )
      ? (state.sortOption as LibrarySortOption)
      : "alphabetical";

    return {
      activePlatformFilter,
      advancedFilters: normalizeAdvancedFilters(state.advancedFilters),
      searchQuery: typeof state.searchQuery === "string" ? state.searchQuery : "",
      sortOption,
    };
  } catch {
    return {
      activePlatformFilter: "all",
      advancedFilters: initialAdvancedFilters,
      searchQuery: "",
      sortOption: "alphabetical",
    };
  }
}
