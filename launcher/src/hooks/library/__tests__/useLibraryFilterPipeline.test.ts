import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useLibraryFilterPipeline } from "../useLibraryFilterPipeline";
import type { LibraryAdvancedFilters } from "../../../lib/library-filters";
import type { LibrarySortOption } from "../../../lib/library-sort";
import {
  initialAdvancedFilters,
  type LibraryPlatformFilter,
} from "../../../lib/library-filters-helpers";
import type { Game } from "../../../lib/types";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "steam-1",
    title: "Test Game",
    description: "",
    features: [],
    genres: ["Action"],
    launcher: "steam",
    version: "1.0",
    status: "installed",
    platform: "windows",
    playtimeMinutes: 0,
    players: ["Singleplayer"],
    productCategory: "game",
    sizeGb: 5,
    ...overrides,
  } as Game;
}

const baseAdvanced: LibraryAdvancedFilters = {
  ...initialAdvancedFilters,
  productCategories: [...initialAdvancedFilters.productCategories],
};

function filteredIds(groups: ReturnType<typeof useLibraryFilterPipeline>["filteredGroups"]) {
  return groups.flatMap((group) => group.variants.map((game) => game.id));
}

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
  it("returns a real empty library when installedGames is empty", () => {
    const { result } = renderHook(() => useLibraryFilterPipeline(makeOptions()));
    expect(result.current.baseLibraryGames).toEqual([]);
    expect(result.current.libraryGroups).toEqual([]);
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

  it("preserves provider metadata without inventing missing catalog facts", () => {
    const game = makeGame({
      id: "neo-tokyo-unverified",
      features: undefined,
      genres: undefined,
      players: undefined,
      productCategory: undefined,
      protonCompatible: undefined,
      sizeGb: undefined,
      steamDeckCompatibility: undefined,
      title: "Neo-Tokyo Drift",
    });
    const { result } = renderHook(() =>
      useLibraryFilterPipeline(makeOptions({ installedGames: [game] })),
    );
    const enriched = result.current.enrichedLibraryGames[0];
    expect(enriched).toMatchObject({ id: game.id, title: game.title });
    expect(enriched?.features).toBeUndefined();
    expect(enriched?.genres).toBeUndefined();
    expect(enriched?.players).toBeUndefined();
    expect(enriched?.productCategory).toBeUndefined();
    expect(enriched?.protonCompatible).toBeUndefined();
    expect(enriched?.sizeGb).toBeUndefined();
    expect(enriched?.steamDeckCompatibility).toBeUndefined();
  });

  it("parses size query from search text", () => {
    const games = [
      makeGame({ id: "small", sizeGb: 5, title: "Small Game" }),
      makeGame({ id: "large", sizeGb: 25, title: "Large Game" }),
      makeGame({ id: "unknown", sizeGb: undefined, title: "Unknown Size" }),
    ];
    const { result } = renderHook(() =>
      useLibraryFilterPipeline(makeOptions({ installedGames: games, searchQuery: ">10" })),
    );
    expect(filteredIds(result.current.filteredGroups)).toEqual(["large"]);
  });

  it("uses an explicit advanced size query before a size query parsed from search", () => {
    const games = [
      makeGame({ id: "small", sizeGb: 5, title: "Small Game" }),
      makeGame({ id: "large", sizeGb: 25, title: "Large Game" }),
    ];
    const { result } = renderHook(() =>
      useLibraryFilterPipeline(
        makeOptions({
          advancedFilters: { ...baseAdvanced, sizeQuery: "<10" },
          installedGames: games,
          searchQuery: ">20",
        }),
      ),
    );

    expect(filteredIds(result.current.filteredGroups)).toEqual(["small"]);
  });

  it("filters by search text and preserves matching custom artwork", () => {
    const games = [
      makeGame({ coverUrl: "original.png", id: "alpha", title: "Alpha Strike" }),
      makeGame({ id: "beta", title: "Beta Drift" }),
    ];
    const { result } = renderHook(() =>
      useLibraryFilterPipeline(
        makeOptions({
          customArtwork: {
            alpha: { coverUrl: "custom.png", iconUrl: "custom-icon.png" },
          },
          installedGames: games,
          searchQuery: "Alpha",
        }),
      ),
    );

    expect(result.current.baseLibraryGames.find((game) => game.id === "alpha")).toMatchObject({
      coverUrl: "custom.png",
      iconUrl: "custom-icon.png",
    });
    expect(result.current.baseLibraryGames.find((game) => game.id === "beta")?.coverUrl).toBe(
      undefined,
    );
    expect(filteredIds(result.current.filteredGroups)).toEqual(["alpha"]);
    expect(filteredIds(result.current.libraryGroups)).toEqual(["alpha", "beta"]);
  });

  it("keeps the unfiltered total separate when the Game Pass catalog is hidden", () => {
    const games = [
      makeGame({ id: "steam-game", title: "Installed Game" }),
      makeGame({
        catalogSource: "pc_game_pass",
        id: "xbox-9NBLGGH4R315",
        launcher: "xbox",
        status: "not_installed",
        title: "Catalog Game",
      }),
    ];
    const { result } = renderHook(() =>
      useLibraryFilterPipeline(
        makeOptions({
          advancedFilters: { ...baseAdvanced, showGamePassCatalog: false },
          installedGames: games,
        }),
      ),
    );

    expect(filteredIds(result.current.libraryGroups)).toEqual(["xbox-9NBLGGH4R315", "steam-game"]);
    expect(filteredIds(result.current.filteredGroups)).toEqual(["steam-game"]);
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
    expect(filteredIds(result.current.filteredGroups)).toEqual(["g1"]);
  });

  it("returns no games for a selected manual collection that no longer exists", () => {
    const { result } = renderHook(() =>
      useLibraryFilterPipeline(
        makeOptions({
          installedGames: [makeGame({ id: "g1" })],
          manualCollections: {},
          selectedManualCollectionName: "Deleted Collection",
        }),
      ),
    );

    expect(result.current.filteredGroups).toEqual([]);
  });

  it("rejects games that fail platform, hidden, or advanced status filters", () => {
    const games = [
      makeGame({ id: "visible", platform: "windows", status: "installed" }),
      makeGame({ id: "wrong-platform", platform: "linux", status: "installed" }),
      makeGame({ id: "hidden", platform: "windows", status: "installed" }),
      makeGame({ id: "not-installed", platform: "windows", status: "not_installed" }),
    ];
    const { result } = renderHook(() =>
      useLibraryFilterPipeline(
        makeOptions({
          activePlatformFilter: "windows",
          advancedFilters: { ...baseAdvanced, status: ["installed"] },
          hiddenGames: { hidden: true },
          installedGames: games,
        }),
      ),
    );

    expect(filteredIds(result.current.filteredGroups)).toEqual(["visible"]);
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
        useLibraryFilterPipeline(
          makeOptions({
            installedGames: [makeGame()],
            selectedGroupId: props.selectedGroupId,
          }),
        ),
      { initialProps: { selectedGroupId: null as string | null } },
    );
    const firstGroup = result.current.libraryGroups[0];
    expect(firstGroup).toBeDefined();
    expect(result.current.selectedGroup).toBeNull();

    rerender({ selectedGroupId: firstGroup.id });
    expect(result.current.selectedGroup?.id).toBe(firstGroup.id);
  });
});
