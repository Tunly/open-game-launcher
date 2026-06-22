import { Search, SlidersHorizontal, Grid2X2 } from "lucide-react";
import { useContext, useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";
import type { Game, GameRuntimeStatus } from "../../lib/types";
import type { GameGroup } from "../../lib/game-groups";
import type { LibraryAdvancedFilters } from "../../lib/library-filters";
import type { LibrarySortOption } from "../../lib/library-sort";
import type { CustomArtworkKind } from "../../lib/custom-artwork";
import { LibraryContext } from "../../context/LibraryContext";
import { LibraryRow } from "./LibraryRow";
import { LibraryCustomScrollbar } from "./LibraryCustomScrollbar";

const LIBRARY_ROW_HEIGHT = 56;
const LIBRARY_ROW_OVERSCAN = 8;
const LIBRARY_VIRTUALIZE_THRESHOLD = 80;
const PRODUCT_CATEGORY_LABELS: Record<string, string> = {
  game: "Games",
  software: "Software",
  video: "Videos",
  dlc: "DLCs",
  soundtrack: "Soundtracks",
  demo: "Demos",
  beta: "Beta Access",
};
const PRODUCT_CATEGORY_KEYS = Object.keys(PRODUCT_CATEGORY_LABELS);

interface SidebarCategoryOption {
  label: string;
  count: number;
}

function toggleListValue<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

function addCategoryLabel(
  counts: Map<string, SidebarCategoryOption>,
  label: string | null | undefined,
) {
  const trimmed = label?.trim();
  if (!trimmed) {
    return;
  }

  const key = trimmed.toLowerCase();
  const current = counts.get(key);
  if (current) {
    current.count += 1;
    return;
  }

  counts.set(key, { label: trimmed, count: 1 });
}

function addGameCategoryLabels(counts: Map<string, SidebarCategoryOption>, game: Game) {
  (game.categories ?? []).forEach((label) => addCategoryLabel(counts, label));
  (game.categoryLabels ?? []).forEach((label) => addCategoryLabel(counts, label));
  (game.tags ?? []).forEach((label) => addCategoryLabel(counts, label));
  (game.tagLabels ?? []).forEach((label) => addCategoryLabel(counts, label));
}

function buildSidebarCategoryOptions(
  groups: GameGroup[],
  customCategories: Record<string, string[]>,
): SidebarCategoryOption[] {
  const counts = new Map<string, SidebarCategoryOption>();

  groups.forEach((group) => {
    group.variants.forEach((game) => {
      (customCategories[game.id] ?? []).forEach((label) => addCategoryLabel(counts, label));
      addGameCategoryLabels(counts, game);
    });
  });

  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function buildProductCategoryCounts(groups: GameGroup[]): Record<string, number> {
  const counts = Object.fromEntries(PRODUCT_CATEGORY_KEYS.map((key) => [key, 0]));
  groups.forEach((group) => {
    group.variants.forEach((game) => {
      const key = (game.productCategory || "game").toLowerCase();
      counts[key] = (counts[key] ?? 0) + 1;
    });
  });
  return counts;
}

export interface LibrarySidebarProps {
  games: GameGroup[];
  filteredGames: GameGroup[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortOption: LibrarySortOption;
  setSortOption: (option: LibrarySortOption) => void;
  isFilterPopupOpen: boolean;
  setIsFilterPopupOpen: (open: boolean) => void;
  activePlatformFilter: "all" | "windows" | "macos" | "linux";
  advancedFilters: LibraryAdvancedFilters;
  hasActiveFilters?: boolean;
  onResetFilters?: () => void;
  groupOption: string;
  groupedGames: Record<string, GameGroup[]>;
  selectedGroup: GameGroup | null;
  setSelectedGroup: (group: GameGroup) => void;
  favorites: Record<string, boolean>;
  gameRuntimeById?: Record<string, GameRuntimeStatus>;
  runningGameIds?: Set<string>;
  fallbackMockGames: Game[];
  listScrollRef: RefObject<HTMLDivElement | null>;
  setIsAddGameOpen: (open: boolean) => void;
  setAddGameError?: (err: string | null) => void;
  onArtworkDrop?: (gameId: string, kind: CustomArtworkKind, file: File) => void;
}

export function LibrarySidebar({
  games,
  filteredGames,
  searchQuery,
  setSearchQuery,
  sortOption,
  setSortOption,
  isFilterPopupOpen,
  setIsFilterPopupOpen,
  activePlatformFilter,
  advancedFilters,
  hasActiveFilters: hasActiveFiltersProp,
  onResetFilters,
  groupOption,
  groupedGames,
  selectedGroup,
  setSelectedGroup,
  favorites,
  gameRuntimeById = {},
  runningGameIds = new Set(),
  fallbackMockGames,
  listScrollRef,
  setIsAddGameOpen,
  setAddGameError,
  onArtworkDrop,
}: LibrarySidebarProps) {
  const clearAddGameError = setAddGameError ?? (() => undefined);
  const libraryContext = useContext(LibraryContext);
  const setAdvancedFilters = libraryContext?.filters.setAdvancedFilters;
  const customCategories = libraryContext?.manual.customCategories;

  const hasActiveFilters =
    hasActiveFiltersProp ??
    (Boolean(searchQuery) ||
      activePlatformFilter !== "all" ||
      Object.values(advancedFilters).some((value) => {
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === "boolean") return value;
        return value !== "";
      }));
  const [listViewport, setListViewport] = useState({ height: 0, scrollTop: 0 });
  const shouldVirtualize =
    groupOption === "none" && filteredGames.length > LIBRARY_VIRTUALIZE_THRESHOLD;
  const virtualRows = useMemo(() => {
    if (!shouldVirtualize) {
      return {
        afterHeight: 0,
        beforeHeight: 0,
        games: filteredGames,
      };
    }

    const maxStartIndex = Math.max(0, filteredGames.length - 1);
    const startIndex = Math.min(
      Math.max(0, Math.floor(listViewport.scrollTop / LIBRARY_ROW_HEIGHT) - LIBRARY_ROW_OVERSCAN),
      maxStartIndex,
    );
    const visibleCount =
      Math.ceil(Math.max(listViewport.height, LIBRARY_ROW_HEIGHT) / LIBRARY_ROW_HEIGHT) +
      LIBRARY_ROW_OVERSCAN * 2;
    const endIndex = Math.min(filteredGames.length, startIndex + visibleCount);

    return {
      afterHeight: Math.max(0, (filteredGames.length - endIndex) * LIBRARY_ROW_HEIGHT),
      beforeHeight: startIndex * LIBRARY_ROW_HEIGHT,
      games: filteredGames.slice(startIndex, endIndex),
    };
  }, [filteredGames, listViewport.height, listViewport.scrollTop, shouldVirtualize]);
  const sidebarCategories = useMemo(
    () => buildSidebarCategoryOptions(games, customCategories ?? {}),
    [customCategories, games],
  );
  const productCategoryCounts = useMemo(() => buildProductCategoryCounts(games), [games]);
  const activeCategorySet = useMemo(
    () => new Set(advancedFilters.categories.map((category) => category.toLowerCase())),
    [advancedFilters.categories],
  );
  const activeProductCategorySet = useMemo(
    () => new Set(advancedFilters.productCategories.map((category) => category.toLowerCase())),
    [advancedFilters.productCategories],
  );

  function toggleSidebarCategory(label: string) {
    setAdvancedFilters?.((current) => ({
      ...current,
      categories: toggleListValue(current.categories, label),
    }));
  }

  function toggleProductCategory(category: string) {
    setAdvancedFilters?.((current) => ({
      ...current,
      productCategories: toggleListValue(current.productCategories, category),
    }));
  }

  useEffect(() => {
    const element = listScrollRef.current;
    if (!element) {
      return;
    }

    let frame = 0;
    const updateViewport = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setListViewport((current) => {
          const next = {
            height: element.clientHeight,
            scrollTop: element.scrollTop,
          };
          return current.height === next.height && current.scrollTop === next.scrollTop
            ? current
            : next;
        });
      });
    };

    updateViewport();
    element.addEventListener("scroll", updateViewport, { passive: true });

    const resizeObserver = new ResizeObserver(updateViewport);
    resizeObserver.observe(element);

    return () => {
      window.cancelAnimationFrame(frame);
      element.removeEventListener("scroll", updateViewport);
      resizeObserver.disconnect();
    };
  }, [listScrollRef]);

  useEffect(() => {
    const element = listScrollRef.current;
    if (!element || !shouldVirtualize) {
      return;
    }

    const maxScrollTop = Math.max(
      0,
      filteredGames.length * LIBRARY_ROW_HEIGHT - element.clientHeight,
    );
    if (element.scrollTop > maxScrollTop) {
      element.scrollTop = maxScrollTop;
    }
  }, [filteredGames.length, listScrollRef, shouldVirtualize]);

  const renderLibraryRow = (group: GameGroup) => (
    <LibraryRow
      key={group.id}
      group={group}
      selected={selectedGroup?.id === group.id}
      onSelect={setSelectedGroup}
      isFavorite={group.variants.some((game) => favorites[game.id] === true)}
      isRunning={group.variants.some((game) => runningGameIds.has(game.id))}
      runtime={group.variants.map((game) => gameRuntimeById[game.id]).find(Boolean)}
      onArtworkDrop={onArtworkDrop}
    />
  );

  return (
    <aside className="flex min-h-0 flex-col justify-between border-b-4 border-black bg-[#efe3cf] md:border-b-0 md:border-r-4">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-11 items-center justify-between border-b-4 border-black bg-[#f4ead8]">
          <button className="h-full flex-1 px-3 text-left text-[16px] font-black" type="button">
            <span className="block min-w-0 truncate">
              Library ({filteredGames.length}
              {hasActiveFilters ? ` / ${games.length || fallbackMockGames.length}` : ""})
            </span>
          </button>
          <button
            className="grid h-full w-11 place-items-center border-l-4 border-black"
            type="button"
            aria-label="Grid view"
          >
            <Grid2X2 className="h-6 w-6" />
          </button>
        </div>

        {/* Search Input Row */}
        <div className="space-y-2 p-2 pb-1">
          <label className="flex h-9 items-center gap-2 border-2 border-black bg-[#fbf8ef] px-2.5">
            <Search className="h-4 w-4 text-[#686157]" />
            <input
              className="neo-copy min-w-0 flex-1 bg-transparent text-[11px] font-black tracking-[0.08em] text-[#171411] outline-none placeholder:text-[#686157]"
              aria-label="Search library"
              placeholder="Search..."
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as LibrarySortOption)}
              className="neo-copy h-6 cursor-pointer border-2 border-black bg-[#d8cbb7] text-[10px] font-black uppercase tracking-wider outline-none"
              title="Sort"
            >
              <option value="alphabetical">A-Z</option>
              <option value="last_played">Recent</option>
              <option value="playtime">Playtime</option>
              <option value="size">Size</option>
            </select>
            <button
              type="button"
              onClick={() => setIsFilterPopupOpen(!isFilterPopupOpen)}
              className={`grid h-6 w-8 place-items-center border-2 border-black transition ${
                isFilterPopupOpen
                  ? "bg-[#139a82] text-[#fffaf0]"
                  : "bg-[#e8c843] text-[#171411] hover:bg-[#f0d95a]"
              }`}
              title="Advanced Filters"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          </label>
        </div>

        {libraryContext ? (
          <div className="border-t-2 border-black bg-[#f4ead8] px-2 py-2">
            <div className="border-2 border-black bg-[#fbf8ef] shadow-[2px_2px_0_#171411]">
              <div className="flex items-center justify-between gap-2 border-b-2 border-black bg-[#171411] px-2 py-1">
                <h3 className="neo-copy text-[10px] font-black uppercase text-[#fff9ed]">
                  Categories / Tags
                </h3>
                {advancedFilters.categories.length > 0 ? (
                  <button
                    type="button"
                    className="neo-copy border border-black bg-[#fff9ed] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411] hover:bg-[#8cf5e4]"
                    onClick={() =>
                      setAdvancedFilters?.((current) => ({ ...current, categories: [] }))
                    }
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              <div className="grid grid-cols-2 border-b-2 border-black">
                {PRODUCT_CATEGORY_KEYS.map((category) => {
                  const count = productCategoryCounts[category] ?? 0;
                  const checked = activeProductCategorySet.has(category);
                  return (
                    <label
                      key={category}
                      className={`neo-copy flex min-w-0 cursor-pointer items-center gap-1 border-b border-r border-black px-2 py-1 text-[9px] font-black uppercase last:border-r-0 ${
                        checked ? "bg-[#087d6d] text-white" : "bg-[#efe3cf] text-[#171411]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProductCategory(category)}
                        className="h-3 w-3 shrink-0 accent-[#b7102a]"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {PRODUCT_CATEGORY_LABELS[category]}
                      </span>
                      <span className="shrink-0">{count}</span>
                    </label>
                  );
                })}
              </div>

              {sidebarCategories.length > 0 ? (
                <div className="max-h-28 overflow-y-auto p-1">
                  {sidebarCategories.slice(0, 14).map((category) => {
                    const checked = activeCategorySet.has(category.label.toLowerCase());
                    return (
                      <label
                        key={category.label}
                        className={`neo-copy mb-1 flex min-w-0 cursor-pointer items-center gap-1.5 border-2 border-black px-2 py-1 text-[9px] font-black uppercase shadow-[1px_1px_0_#171411] ${
                          checked ? "bg-[#b7102a] text-white" : "bg-[#efe3cf] text-[#171411]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSidebarCategory(category.label)}
                          className="h-3 w-3 shrink-0 accent-[#087d6d]"
                        />
                        <span className="min-w-0 flex-1 truncate">{category.label}</span>
                        <span className="shrink-0">{category.count}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="neo-copy px-2 py-2 text-[9px] font-black uppercase text-[#655f58]">
                  No category tags in this rack.
                </p>
              )}
            </div>
          </div>
        ) : null}

        {/* List Frame */}
        <div className="library-scroll-frame library-sidebar-scroll-frame min-h-0 flex-1 border-t-2 border-black">
          <div
            ref={listScrollRef}
            className="library-game-list-scroll h-full min-h-0 space-y-1 overflow-y-auto overflow-x-hidden py-0 pl-0 pr-0"
          >
            {groupOption !== "none" ? (
              Object.entries(groupedGames).length === 0 ? (
                <div className="py-8 text-center text-[12px] font-black uppercase text-[#686157]">
                  No games found
                </div>
              ) : (
                Object.entries(groupedGames).map(([groupName, groupGames]) => (
                  <div key={groupName} className="mb-4">
                    <h3 className="sticky top-0 z-10 mb-2 border-b-2 border-black bg-[#efe3cf] py-1 text-[11px] font-black uppercase tracking-wider text-[#b7102a] shadow-[0_2px_0_#171411]">
                      {groupName} ({groupGames.length})
                    </h3>
                    <div className="space-y-1">{groupGames.map(renderLibraryRow)}</div>
                  </div>
                ))
              )
            ) : filteredGames.length === 0 ? (
              <div className="space-y-4 px-4 py-12 text-center">
                <p className="text-[12px] font-black uppercase text-[#686157]">
                  {hasActiveFilters ? "No games match active filters" : "No games found"}
                </p>
                {hasActiveFilters && onResetFilters && (
                  <button
                    type="button"
                    onClick={onResetFilters}
                    className="neo-copy inline-flex h-9 items-center justify-center border-2 border-black bg-[#e8c843] px-4 text-[10px] font-black uppercase shadow-[2px_2px_0_#171411] transition hover:bg-[#f0d95a] active:translate-y-0.5 active:shadow-[1px_1px_0_#171411]"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
              <div
                style={
                  shouldVirtualize
                    ? {
                        paddingBottom: virtualRows.afterHeight,
                        paddingTop: virtualRows.beforeHeight,
                      }
                    : undefined
                }
              >
                <div className="space-y-1">{virtualRows.games.map(renderLibraryRow)}</div>
              </div>
            )}
          </div>
          <LibraryCustomScrollbar targetRef={listScrollRef} />
        </div>
      </div>
      <div className="shrink-0 border-t-4 border-black bg-[#f4ead8] px-4 py-2 text-[14px] font-black">
        <button
          type="button"
          className="text-left uppercase leading-none hover:text-[#b7102a]"
          onClick={() => {
            clearAddGameError(null);
            setIsAddGameOpen(true);
          }}
        >
          + Add a Game
        </button>
      </div>
    </aside>
  );
}
