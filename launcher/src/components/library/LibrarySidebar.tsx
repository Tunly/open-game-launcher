import { Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";
import type { GameRuntimeStatus } from "../../lib/types";
import type { GameGroup } from "../../lib/game-groups";
import type { LibraryAdvancedFilters } from "../../lib/library-filters";
import type { LibrarySortOption } from "../../lib/library-sort";
import type { CustomArtworkKind } from "../../lib/custom-artwork";
import { LibraryRow } from "./LibraryRow";
import { LibraryCustomScrollbar } from "./LibraryCustomScrollbar";

const LIBRARY_ROW_HEIGHT = 56;
const LIBRARY_GROUP_HEADER_HEIGHT = 38;
const LIBRARY_ROW_OVERSCAN = 8;
const LIBRARY_VIRTUALIZE_THRESHOLD = 80;

type GroupedVirtualEntry =
  | {
      groupName: string;
      height: number;
      key: string;
      offset: number;
      type: "header";
      count: number;
    }
  | {
      groupName: string;
      height: number;
      key: string;
      offset: number;
      type: "game";
      game: GameGroup;
    };

export type LibraryGroupOption = "none" | "source" | "platform" | "status";

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
  groupOption: LibraryGroupOption;
  setGroupOption: (option: LibraryGroupOption) => void;
  groupedGames: Record<string, GameGroup[]>;
  selectedGroup: GameGroup | null;
  setSelectedGroup: (group: GameGroup) => void;
  favorites: Record<string, boolean>;
  gameRuntimeById?: Record<string, GameRuntimeStatus>;
  runningGameIds?: Set<string>;
  listScrollRef: RefObject<HTMLDivElement | null>;
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
  setGroupOption,
  groupedGames,
  selectedGroup,
  setSelectedGroup,
  favorites,
  gameRuntimeById = {},
  runningGameIds = new Set(),
  listScrollRef,
  onArtworkDrop,
}: LibrarySidebarProps) {
  const hasActiveFilters =
    hasActiveFiltersProp ??
    (Boolean(searchQuery) ||
      activePlatformFilter !== "all" ||
      Object.entries(advancedFilters).some(([key, value]) => {
        if (Array.isArray(value)) return value.length > 0;
        if (key === "showGamePassCatalog" && typeof value === "boolean") return !value;
        if (typeof value === "boolean") return value;
        return value !== "";
      }));
  const [listViewport, setListViewport] = useState({ height: 0, scrollTop: 0 });
  const shouldVirtualize =
    groupOption === "none" && filteredGames.length > LIBRARY_VIRTUALIZE_THRESHOLD;
  const shouldVirtualizeGroups =
    groupOption !== "none" && filteredGames.length > LIBRARY_VIRTUALIZE_THRESHOLD;
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
  const groupedVirtualRows = useMemo(() => {
    const entries: GroupedVirtualEntry[] = [];
    let offset = 0;
    for (const [groupName, groupGames] of Object.entries(groupedGames)) {
      entries.push({
        count: groupGames.length,
        groupName,
        height: LIBRARY_GROUP_HEADER_HEIGHT,
        key: `header:${groupName}`,
        offset,
        type: "header",
      });
      offset += LIBRARY_GROUP_HEADER_HEIGHT;
      for (const game of groupGames) {
        entries.push({
          game,
          groupName,
          height: LIBRARY_ROW_HEIGHT,
          key: `game:${groupName}:${game.id}`,
          offset,
          type: "game",
        });
        offset += LIBRARY_ROW_HEIGHT;
      }
    }

    if (!shouldVirtualizeGroups) {
      return { activeHeader: null, afterHeight: 0, beforeHeight: 0, entries };
    }

    const overscanPixels = LIBRARY_ROW_OVERSCAN * LIBRARY_ROW_HEIGHT;
    const visibleStart = Math.max(0, listViewport.scrollTop - overscanPixels);
    const visibleEnd =
      listViewport.scrollTop + Math.max(listViewport.height, LIBRARY_ROW_HEIGHT) + overscanPixels;
    const visibleEntries = entries.filter(
      (entry) => entry.offset + entry.height >= visibleStart && entry.offset <= visibleEnd,
    );
    const first = visibleEntries[0];
    const last = visibleEntries.at(-1);
    const activeHeader = [...entries]
      .reverse()
      .find(
        (entry) =>
          entry.type === "header" &&
          entry.offset + LIBRARY_GROUP_HEADER_HEIGHT < listViewport.scrollTop,
      );

    return {
      activeHeader: activeHeader?.type === "header" ? activeHeader : null,
      afterHeight: last ? Math.max(0, offset - last.offset - last.height) : offset,
      beforeHeight: first?.offset ?? 0,
      entries: visibleEntries,
    };
  }, [groupedGames, listViewport.height, listViewport.scrollTop, shouldVirtualizeGroups]);

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
  const renderGroupHeader = (groupName: string, count: number, key = groupName) => (
    <h3
      key={key}
      className="sticky top-0 z-10 border-b-2 border-black bg-[#efe3cf] py-1 text-[11px] font-black tracking-wider text-[#b7102a] uppercase shadow-[0_2px_0_#171411]"
    >
      {groupName} ({count})
    </h3>
  );

  return (
    <aside className="flex min-h-0 flex-col justify-between border-b-4 border-black bg-[#efe3cf] md:border-r-4 md:border-b-0">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-11 items-center justify-between border-b-4 border-black bg-[#f4ead8]">
          <div className="flex h-full min-w-0 flex-1 items-center px-3 text-left text-[16px] font-black">
            <span className="block min-w-0 truncate">
              Library ({filteredGames.length}
              {hasActiveFilters ? ` / ${games.length}` : ""})
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2 pr-2">
            <select
              value={groupOption}
              onChange={(event) => setGroupOption(event.target.value as LibraryGroupOption)}
              className="neo-copy h-6 cursor-pointer border-2 border-black bg-[#d8cbb7] text-[10px] font-black tracking-wider uppercase outline-none"
              aria-label="Group library"
              title="Group"
            >
              <option value="none">No Groups</option>
              <option value="source">Provider</option>
              <option value="platform">Platform</option>
              <option value="status">Status</option>
            </select>
            <select
              value={sortOption}
              onChange={(event) => setSortOption(event.target.value as LibrarySortOption)}
              className="neo-copy h-6 cursor-pointer border-2 border-black bg-[#d8cbb7] text-[10px] font-black tracking-wider uppercase outline-none"
              aria-label="Sort library"
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
              aria-label="Advanced filters"
              title="Advanced Filters"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
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
          </label>
        </div>

        {/* List Frame */}
        <div className="library-scroll-frame library-sidebar-scroll-frame min-h-0 flex-1 border-t-2 border-black">
          <div
            ref={listScrollRef}
            className="library-game-list-scroll h-full min-h-0 space-y-1 overflow-x-hidden overflow-y-auto py-0 pr-0 pl-0"
          >
            {groupOption !== "none" ? (
              Object.entries(groupedGames).length === 0 ? (
                <div className="py-8 text-center text-[12px] font-black text-[#686157] uppercase">
                  No games found
                </div>
              ) : shouldVirtualizeGroups ? (
                <div>
                  {groupedVirtualRows.activeHeader ? (
                    <div className="pointer-events-none sticky top-0 z-20 h-0 overflow-visible">
                      {renderGroupHeader(
                        groupedVirtualRows.activeHeader.groupName,
                        groupedVirtualRows.activeHeader.count,
                        `active:${groupedVirtualRows.activeHeader.groupName}`,
                      )}
                    </div>
                  ) : null}
                  <div
                    style={{
                      paddingBottom: groupedVirtualRows.afterHeight,
                      paddingTop: groupedVirtualRows.beforeHeight,
                    }}
                  >
                    {groupedVirtualRows.entries.map((entry) =>
                      entry.type === "header" ? (
                        <div key={entry.key} style={{ height: entry.height }}>
                          {renderGroupHeader(entry.groupName, entry.count)}
                        </div>
                      ) : (
                        <div key={entry.key} className="pb-1" style={{ height: entry.height }}>
                          {renderLibraryRow(entry.game)}
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ) : (
                Object.entries(groupedGames).map(([groupName, groupGames]) => (
                  <div key={groupName} className="mb-4">
                    <div className="mb-2">{renderGroupHeader(groupName, groupGames.length)}</div>
                    <div className="space-y-1">{groupGames.map(renderLibraryRow)}</div>
                  </div>
                ))
              )
            ) : filteredGames.length === 0 ? (
              <div className="space-y-4 px-4 py-12 text-center">
                <p className="text-[12px] font-black text-[#686157] uppercase">
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
    </aside>
  );
}
