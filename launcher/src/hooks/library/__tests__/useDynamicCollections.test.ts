import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDynamicCollections } from "../useDynamicCollections";
import { STORAGE_KEYS } from "../../../lib/storage-keys";
import type { LibraryAdvancedFilters } from "../../../lib/library-filters";
import type { LibrarySortOption } from "../../../lib/library-sort";

const baseAdvanced: LibraryAdvancedFilters = {
  players: [],
  features: [],
  hardware: [],
  genres: [],
  status: [],
  platforms: [],
  launchers: [],
  categories: [],
  sizeQuery: "",
  productCategories: [],
  showGamePassCatalog: false,
};

function makeOptions(overrides: Partial<Parameters<typeof useDynamicCollections>[0]> = {}) {
  return {
    setAdvancedFilters: vi.fn(),
    setActivePlatformFilter: vi.fn(),
    setSearchQuery: vi.fn(),
    currentAdvancedFilters: baseAdvanced,
    currentPlatformFilter: "all" as const,
    currentSearchQuery: "",
    currentSortOption: "title-asc" as LibrarySortOption,
    ...overrides,
  };
}

describe("useDynamicCollections", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("initializes with empty collections", () => {
    const { result } = renderHook(() => useDynamicCollections(makeOptions()));
    expect(result.current.dynamicCollections).toEqual([]);
    expect(result.current.newCollectionName).toBe("");
    expect(result.current.selectedCollectionName).toBeNull();
  });

  it("hydrates from localStorage", () => {
    const stored = [
      { name: "Test", filters: baseAdvanced, platformFilter: "all" as const, searchQuery: "" },
    ];
    window.localStorage.setItem(STORAGE_KEYS.LIBRARY_DYNAMIC_COLLECTIONS, JSON.stringify(stored));
    const { result } = renderHook(() => useDynamicCollections(makeOptions()));
    expect(result.current.dynamicCollections).toHaveLength(1);
    expect(result.current.dynamicCollections[0].name).toBe("Test");
  });

  it("saveCurrentFilterAsCollection adds a new collection", () => {
    const { result } = renderHook(() => useDynamicCollections(makeOptions()));
    act(() => {
      result.current.saveCurrentFilterAsCollection("MyCollection");
    });
    expect(result.current.dynamicCollections).toHaveLength(1);
    expect(result.current.dynamicCollections[0].name).toBe("MyCollection");
    expect(result.current.newCollectionName).toBe("");
  });

  it("saveCurrentFilterAsCollection ignores empty name", () => {
    const { result } = renderHook(() => useDynamicCollections(makeOptions()));
    act(() => {
      result.current.saveCurrentFilterAsCollection("   ");
    });
    expect(result.current.dynamicCollections).toHaveLength(0);
  });

  it("applyDynamicCollection sets filters and selects the collection", () => {
    const setAdvancedFilters = vi.fn();
    const setActivePlatformFilter = vi.fn();
    const setSearchQuery = vi.fn();
    const { result } = renderHook(() =>
      useDynamicCollections(
        makeOptions({ setAdvancedFilters, setActivePlatformFilter, setSearchQuery }),
      ),
    );
    act(() => {
      result.current.saveCurrentFilterAsCollection("Test");
    });
    act(() => {
      result.current.applyDynamicCollection("Test");
    });
    expect(setAdvancedFilters).toHaveBeenCalled();
    expect(result.current.selectedCollectionName).toBe("Test");
  });

  it("persists collections to localStorage", () => {
    const { result } = renderHook(() => useDynamicCollections(makeOptions()));
    act(() => {
      result.current.saveCurrentFilterAsCollection("Persisted");
    });
    const stored = window.localStorage.getItem(STORAGE_KEYS.LIBRARY_DYNAMIC_COLLECTIONS);
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored as string);
    expect(parsed[0].name).toBe("Persisted");
  });
});
