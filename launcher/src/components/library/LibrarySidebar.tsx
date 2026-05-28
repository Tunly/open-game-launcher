import { Search, SlidersHorizontal, Grid2X2 } from "lucide-react";
import type { Game } from "../../lib/types";
import type { LibrarySortOption } from "../../pages/LibraryPage";
import { LibraryRow } from "./LibraryRow";
import { LibraryCustomScrollbar } from "./LibraryCustomScrollbar";

type LibraryAdvancedFilters = Record<string, string | string[]>;

export interface LibrarySidebarProps {
  games: Game[];
  filteredGames: Game[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortOption: LibrarySortOption;
  setSortOption: (option: LibrarySortOption) => void;
  isFilterPopupOpen: boolean;
  setIsFilterPopupOpen: (open: boolean) => void;
  activePlatformFilter: "all" | "windows" | "macos" | "linux";
  advancedFilters: LibraryAdvancedFilters;
  groupOption: string;
  groupedGames: Record<string, Game[]>;
  selectedGame: Game | null;
  setSelectedGame: (game: Game) => void;
  favorites: Record<string, boolean>;
  fallbackMockGames: Game[];
  listScrollRef: React.RefObject<HTMLDivElement>;
  setIsAddGameOpen: (open: boolean) => void;
  setAddGameError: (err: string | null) => void;
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
  groupOption,
  groupedGames,
  selectedGame,
  setSelectedGame,
  favorites,
  fallbackMockGames,
  listScrollRef,
  setIsAddGameOpen,
  setAddGameError
}: LibrarySidebarProps) {
  
  const hasActiveFilters = searchQuery || activePlatformFilter !== "all" || Object.values(advancedFilters).some((value) => Array.isArray(value) ? value.length > 0 : value !== "");

  return (
    <aside className="min-h-0 border-b-4 border-black bg-[#efe3cf] flex flex-col justify-between md:border-b-0 md:border-r-4">
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex h-11 items-center justify-between border-b-4 border-black bg-[#f4ead8]">
          <button className="h-full flex-1 px-3 text-left text-[16px] font-black" type="button">
            <span className="block min-w-0 truncate">
              Library ({filteredGames.length}
              {hasActiveFilters ? ` / ${games.length || fallbackMockGames.length}` : ""})
            </span>
          </button>
          <button className="grid h-full w-11 place-items-center border-l-4 border-black" type="button" aria-label="Grid view">
            <Grid2X2 className="h-6 w-6" />
          </button>
        </div>

        {/* Search Input Row */}
        <div className="space-y-2 p-2 pb-1">
          <label className="flex h-9 items-center gap-2 border-2 border-black bg-[#fbf8ef] px-2.5">
            <Search className="h-4 w-4 text-[#686157]" />
            <input
              className="neo-copy min-w-0 flex-1 bg-transparent text-[11px] font-black uppercase tracking-[0.08em] text-[#171411] outline-none placeholder:text-[#686157]"
              aria-label="Search library"
              placeholder="Search..."
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as LibrarySortOption)}
              className="h-6 border-2 border-black bg-[#d8cbb7] text-[10px] font-black uppercase tracking-wider outline-none neo-copy cursor-pointer"
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
                isFilterPopupOpen ? "bg-[#139a82] text-[#fffaf0]" : "bg-[#e8c843] text-[#171411] hover:bg-[#f0d95a]"
              }`}
              title="Advanced Filters"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          </label>
        </div>

        {/* List Frame */}
        <div className="library-scroll-frame library-sidebar-scroll-frame flex-1 min-h-0 border-t-2 border-black">
          <div ref={listScrollRef} className="library-game-list-scroll h-full min-h-0 overflow-y-auto overflow-x-hidden py-0 pl-0 pr-0 space-y-1">
            {groupOption !== "none" ? (
              Object.entries(groupedGames).length === 0 ? (
                <div className="py-8 text-center text-[12px] font-black uppercase text-[#686157]">
                  No games found
                </div>
              ) : (
                Object.entries(groupedGames).map(([groupName, groupGames]) => (
                  <div key={groupName} className="mb-4">
                    <h3 className="sticky top-0 z-10 bg-[#efe3cf]/95 py-1 text-[11px] font-black uppercase tracking-wider text-[#b7102a] border-b-2 border-black/10 mb-2 backdrop-blur-sm">
                      {groupName} ({groupGames.length})
                    </h3>
                    <div className="space-y-1">
                      {groupGames.map((game) => (
                        <LibraryRow
                          key={game.id}
                          game={game}
                          selected={selectedGame?.id === game.id}
                          onSelect={setSelectedGame}
                  isFavorite={favorites[game.id] === true}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )
            ) : filteredGames.length === 0 ? (
              <div className="py-8 text-center text-[12px] font-black uppercase text-[#686157]">
                No games found
              </div>
            ) : (
              filteredGames.map((game) => (
                <LibraryRow
                  key={game.id}
                  game={game}
                  selected={selectedGame?.id === game.id}
                  onSelect={setSelectedGame}
                  isFavorite={favorites[game.id] === true}
                />
              ))
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
            setAddGameError(null);
            setIsAddGameOpen(true);
          }}
        >
          + Add a Game
        </button>
      </div>
    </aside>
  );
}
