import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useLibraryFilters } from "../useLibraryFilters";
import { STORAGE_KEYS } from "../../../lib/storage-keys";
import type { Game } from "../../../lib/types";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "steam-1",
    title: "Test",
    description: "",
    version: "1.0",
    status: "installed",
    platform: "windows",
    playtimeMinutes: 0,
    ...overrides,
  } as Game;
}

describe("useLibraryFilters", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns initial state", () => {
    const { result } = renderHook(() =>
      useLibraryFilters({
        installedGames: [],
        customArtwork: {},
        favorites: {},
        hiddenGames: {},
        customCategories: {},
        manualCollections: {},
        selectedManualCollectionName: null,
        isDiscoveringGames: false,
      }),
    );
    expect(result.current.searchQuery).toBe("");
    expect(result.current.activePlatformFilter).toBe("all");
    expect(result.current.isFilterPopupOpen).toBe(false);
    expect(result.current.sortOption).toBeDefined();
    expect(result.current.advancedFilters.showGamePassCatalog).toBe(true);
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it("hydrates a persisted hidden Game Pass catalog preference", () => {
    window.localStorage.setItem(
      STORAGE_KEYS.LIBRARY_FILTER_STATE,
      JSON.stringify({ advancedFilters: { showGamePassCatalog: false } }),
    );

    const { result } = renderHook(() =>
      useLibraryFilters({
        installedGames: [],
        customArtwork: {},
        favorites: {},
        hiddenGames: {},
        customCategories: {},
        manualCollections: {},
        selectedManualCollectionName: null,
        isDiscoveringGames: false,
      }),
    );

    expect(result.current.advancedFilters.showGamePassCatalog).toBe(false);
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("clears retired persisted feature filters", () => {
    window.localStorage.setItem(
      STORAGE_KEYS.LIBRARY_FILTER_STATE,
      JSON.stringify({ advancedFilters: { features: ["Steam Achievements"] } }),
    );

    const { result } = renderHook(() =>
      useLibraryFilters({
        installedGames: [],
        customArtwork: {},
        favorites: {},
        hiddenGames: {},
        customCategories: {},
        manualCollections: {},
        selectedManualCollectionName: null,
        isDiscoveringGames: false,
      }),
    );

    expect(result.current.advancedFilters.features).toEqual([]);
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it("setSearchQuery updates the search query", () => {
    const { result } = renderHook(() =>
      useLibraryFilters({
        installedGames: [],
        customArtwork: {},
        favorites: {},
        hiddenGames: {},
        customCategories: {},
        manualCollections: {},
        selectedManualCollectionName: null,
        isDiscoveringGames: false,
      }),
    );
    act(() => {
      result.current.setSearchQuery("hello");
    });
    expect(result.current.searchQuery).toBe("hello");
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("setActivePlatformFilter updates the platform filter", () => {
    const { result } = renderHook(() =>
      useLibraryFilters({
        installedGames: [],
        customArtwork: {},
        favorites: {},
        hiddenGames: {},
        customCategories: {},
        manualCollections: {},
        selectedManualCollectionName: null,
        isDiscoveringGames: false,
      }),
    );
    act(() => {
      result.current.setActivePlatformFilter("windows");
    });
    expect(result.current.activePlatformFilter).toBe("windows");
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("setIsFilterPopupOpen toggles the popup", () => {
    const { result } = renderHook(() =>
      useLibraryFilters({
        installedGames: [],
        customArtwork: {},
        favorites: {},
        hiddenGames: {},
        customCategories: {},
        manualCollections: {},
        selectedManualCollectionName: null,
        isDiscoveringGames: false,
      }),
    );
    act(() => {
      result.current.setIsFilterPopupOpen(true);
    });
    expect(result.current.isFilterPopupOpen).toBe(true);
  });

  it("resetAdvancedFilters resets all filter state", () => {
    const { result } = renderHook(() =>
      useLibraryFilters({
        installedGames: [],
        customArtwork: {},
        favorites: {},
        hiddenGames: {},
        customCategories: {},
        manualCollections: {},
        selectedManualCollectionName: null,
        isDiscoveringGames: false,
      }),
    );
    act(() => {
      result.current.setSearchQuery("hello");
      result.current.setActivePlatformFilter("windows");
      result.current.setAdvancedFilters((current) => ({
        ...current,
        showGamePassCatalog: false,
      }));
    });
    act(() => {
      result.current.resetAdvancedFilters();
    });
    expect(result.current.searchQuery).toBe("");
    expect(result.current.activePlatformFilter).toBe("all");
    expect(result.current.advancedFilters.showGamePassCatalog).toBe(true);
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it("uses installedGames in the pipeline", () => {
    const { result } = renderHook(() =>
      useLibraryFilters({
        installedGames: [makeGame({ id: "g1" })],
        customArtwork: {},
        favorites: {},
        hiddenGames: {},
        customCategories: {},
        manualCollections: {},
        selectedManualCollectionName: null,
        isDiscoveringGames: false,
      }),
    );
    expect(result.current.baseLibraryGames.some((g) => g.id === "g1")).toBe(true);
  });
});
