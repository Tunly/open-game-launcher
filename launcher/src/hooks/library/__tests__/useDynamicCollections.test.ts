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
  showGamePassCatalog: true,
};

function makeOptions(overrides: Partial<Parameters<typeof useDynamicCollections>[0]> = {}) {
  return {
    setAdvancedFilters: vi.fn(),
    setActivePlatformFilter: vi.fn(),
    setSearchQuery: vi.fn(),
    setSortOption: vi.fn(),
    currentAdvancedFilters: baseAdvanced,
    currentPlatformFilter: "all" as const,
    currentSearchQuery: "",
    currentSortOption: "playtime" as LibrarySortOption,
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
      {
        name: "Test",
        filters: baseAdvanced,
        platformFilter: "all" as const,
        searchQuery: "",
        sortOption: "size" as const,
      },
    ];
    window.localStorage.setItem(STORAGE_KEYS.LIBRARY_DYNAMIC_COLLECTIONS, JSON.stringify(stored));
    const { result } = renderHook(() => useDynamicCollections(makeOptions()));
    expect(result.current.dynamicCollections).toHaveLength(1);
    expect(result.current.dynamicCollections[0].name).toBe("Test");
    expect(result.current.dynamicCollections[0].sortOption).toBe("size");
  });

  it("defaults legacy saved collections to showing the Game Pass catalog", () => {
    const { showGamePassCatalog: _removed, ...legacyFilters } = baseAdvanced;
    void _removed;
    window.localStorage.setItem(
      STORAGE_KEYS.LIBRARY_DYNAMIC_COLLECTIONS,
      JSON.stringify([
        { name: "Legacy", filters: legacyFilters, platformFilter: "all", searchQuery: "" },
      ]),
    );
    const options = makeOptions();
    const { result } = renderHook(() => useDynamicCollections(options));

    act(() => result.current.applyDynamicCollection("Legacy"));

    expect(options.setAdvancedFilters).toHaveBeenCalledWith(
      expect.objectContaining({ showGamePassCatalog: true }),
    );
    expect(options.setSortOption).toHaveBeenCalledWith("alphabetical");
  });

  it("saveCurrentFilterAsCollection adds a new collection", () => {
    const { result } = renderHook(() => useDynamicCollections(makeOptions()));
    act(() => {
      result.current.saveCurrentFilterAsCollection("MyCollection");
    });
    expect(result.current.dynamicCollections).toHaveLength(1);
    expect(result.current.dynamicCollections[0].name).toBe("MyCollection");
    expect(result.current.dynamicCollections[0].sortOption).toBe("playtime");
    expect(result.current.newCollectionName).toBe("");
  });

  it("selects a newly saved collection immediately", () => {
    const { result } = renderHook(() => useDynamicCollections(makeOptions()));

    act(() => {
      result.current.saveCurrentFilterAsCollection("MyCollection");
    });

    expect(result.current.selectedCollectionName).toBe("MyCollection");
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
    const setSortOption = vi.fn();
    const { result } = renderHook(() =>
      useDynamicCollections(
        makeOptions({
          setAdvancedFilters,
          setActivePlatformFilter,
          setSearchQuery,
          setSortOption,
          currentSortOption: "last_played",
        }),
      ),
    );
    act(() => {
      result.current.saveCurrentFilterAsCollection("Test");
    });
    act(() => {
      result.current.applyDynamicCollection("Test");
    });
    expect(setAdvancedFilters).toHaveBeenCalled();
    expect(setSortOption).toHaveBeenCalledWith("last_played");
    expect(result.current.selectedCollectionName).toBe("Test");
  });

  it("drops malformed persisted collection entries", () => {
    window.localStorage.setItem(
      STORAGE_KEYS.LIBRARY_DYNAMIC_COLLECTIONS,
      JSON.stringify([
        { name: "Missing filters", platformFilter: "all", searchQuery: "" },
        { name: "Bad platform", filters: baseAdvanced, platformFilter: "android", searchQuery: "" },
        null,
      ]),
    );

    const { result } = renderHook(() => useDynamicCollections(makeOptions()));

    expect(result.current.dynamicCollections).toEqual([]);
  });

  it("keeps in-memory collections usable when localStorage writes fail", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    const { result } = renderHook(() => useDynamicCollections(makeOptions()));
    act(() => {
      result.current.saveCurrentFilterAsCollection("In memory");
    });

    expect(result.current.dynamicCollections).toHaveLength(1);
    setItem.mockRestore();
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
