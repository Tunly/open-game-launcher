import { ChevronRight } from "lucide-react";

import type { Game, StoreGame } from "../../lib/types";
import { findMatchingLibraryGame } from "./storeHelpers";
import { StoreCapsuleCard } from "./StoreCapsuleCard";

interface StoreCapsuleRowProps {
  title: string;
  games: StoreGame[];
  wishlistIds: Set<string>;
  installedGames?: Game[];
  onGameClick: (id: string) => void;
  onToggleWishlist: (id: string) => void;
  onOpenStore: (id: string) => void;
  onOpenInLibrary?: (libraryGameId: string) => void;
  onPlay?: (libraryGameId: string) => void;
  onViewAll?: () => void;
}

export function StoreCapsuleRow({
  title,
  games,
  wishlistIds,
  installedGames = [],
  onGameClick,
  onToggleWishlist,
  onOpenStore,
  onOpenInLibrary,
  onPlay,
  onViewAll,
}: StoreCapsuleRowProps) {
  if (games.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between border-b-2 border-black pb-2">
        <h3 className="neo-title text-xl leading-none text-[#171411]">{title}</h3>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="neo-copy flex items-center text-[10px] font-black text-[#b7102a] uppercase hover:underline"
          >
            All <ChevronRight size={12} className="inline" />
          </button>
        )}
      </div>
      <div
        className="flex min-w-0 gap-4 overflow-x-auto pb-3"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#d8cdbb transparent" }}
      >
        {games.map((game) => {
          const matchingGame = findMatchingLibraryGame(game, installedGames);
          return (
            <StoreCapsuleCard
              key={game.id}
              game={game}
              isInLibrary={matchingGame !== null}
              isInstalled={matchingGame?.status === "installed"}
              libraryGameId={matchingGame?.id ?? null}
              isWishlisted={wishlistIds.has(game.id)}
              onClick={onGameClick}
              onToggleWishlist={onToggleWishlist}
              onOpenStore={onOpenStore}
              onOpenInLibrary={onOpenInLibrary}
              onPlay={onPlay}
            />
          );
        })}
      </div>
    </section>
  );
}
