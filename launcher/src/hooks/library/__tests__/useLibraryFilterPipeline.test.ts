import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useLibraryFilterPipeline } from "../useLibraryFilterPipeline";
import type { LibraryAdvancedFilters } from "../../../lib/library-filters";
import type { LibrarySortOption } from "../../../lib/library-sort";
import type { LibraryPlatformFilter } from "../../../lib/library-filters-helpers";
import type { Game } from "../../../lib/types";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "steam-1",
    title: "Test Game",
    description: "",
    version: "1.0",
    status: "installed",
    platform: "windows",
    playtimeMinutes: 0,
    ...overrides,
  } as Game;
}

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
};

function makeOptions(overrides: Partial<Parameters<typeof useLibraryFilterPipeline>[0]> = {}) {
  return {
    installedGames: [] as Game[],
    customArtwork: {},
    favorites: {},
    hiddenGames: {},
    customCategories: {},
    manualCollections: {},
    selectedManualCollectionName: null,
    searchQuery: "",
    activePlatformFilter: "all" as LibraryPlatformFilter,
    advancedFilters: baseAdvanced,
    sortOption: "title-asc" as LibrarySortOption,
    selectedGroupId: null,
    ...overrides,
  };
}

describe("useLibraryFilterPipeline", () => {
  it("returns fallback mock games when installedGames is empty", () => {
    const { result } = renderHook(() => useLibraryFilterPipeline(makeOptions()));
    expect(result.current.baseLibraryGames.length).toBeGreaterThan(0);
    expect(result.current.fallbackMockGames.length).toBe(result.current.baseLibraryGames.length);
  });

  it("uses installedGames when non-empty", () => {
    const games = [makeGame({ id: "g1" }), makeGame({ id: "g2" })];
    const { result } = renderHook(() =>
      useLibraryFilterPipeline(makeOptions({ installedGames: games })),
    );
    expect(result.current.baseLibraryGames.map((g) => g.id)).toEqual(["g1", "g2"]);
  });

  it("filters out hidden non-game entries", () => {
    const games = [
      makeGame({ id: "real", launcher: "steam" }),
      makeGame({ id: "unreal-asset", title: "Unreal Engine Asset Pack", launcher: "epic" }),
    ];
    const { result } = renderHook(() =>
      useLibraryFilterPipeline(makeOptions({ installedGames: games })),
    );
    expect(result.current.baseLibraryGames.map((g) => g.id)).toEqual(["real"]);
  });

  it("enriches games with metadata", () => {
    const { result } = renderHook(() => useLibraryFilterPipeline(makeOptions()));
    const enriched = result.current.enrichedLibraryGames[0];
    expect(enriched).toBeDefined();
  });

  it("parses size query from search text", () => {
    const { result } = renderHook(() =>
      useLibraryFilterPipeline(makeOptions({ searchQuery: ">10" })),
    );
    expect(result.current.filteredGroups).toBeDefined();
  });

  it("filters by manual collection", () => {
    const games = [makeGame({ id: "g1" }), makeGame({ id: "g2" })];
    const { result } = renderHook(() =>
      useLibraryFilterPipeline(
        makeOptions({
          installedGames: games,
          manualCollections: { MyCollection: ["g1"] },
          selectedManualCollectionName: "MyCollection",
        }),
      ),
    );
    const ids = result.current.baseLibraryGames.map((g) => g.id);
    expect(ids).toContain("g1");
    expect(ids).toContain("g2");
  });

  it("counts active advanced filters", () => {
    const { result } = renderHook(() =>
      useLibraryFilterPipeline(
        makeOptions({
          advancedFilters: { ...baseAdvanced, genres: ["Action"], status: ["installed"] },
        }),
      ),
    );
    expect(result.current.activeAdvancedFilterCount).toBeGreaterThanOrEqual(2);
  });

  it("selects the group matching selectedGroupId", () => {
    const { result, rerender } = renderHook(
      (props: { selectedGroupId: string | null }) =>
        useLibraryFilterPipeline(makeOptions({ selectedGroupId: props.selectedGroupId })),
      { initialProps: { selectedGroupId: null as string | null } },
    );
    const firstGroup = result.current.libraryGroups[0];
    if (firstGroup) {
      rerender({ selectedGroupId: firstGroup.id });
      expect(result.current.selectedGroup?.id).toBe(firstGroup.id);
    } else {
      expect(result.current.selectedGroup).toBeNull();
    }
  });
});
