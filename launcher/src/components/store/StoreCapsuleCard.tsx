import { Check, ExternalLink, Gamepad2, Heart, Play } from "lucide-react";

import type { StoreGame } from "../../lib/types";

interface StoreCapsuleCardProps {
  game: StoreGame;
  isInLibrary?: boolean;
  isInstalled?: boolean;
  libraryGameId?: string | null;
  isWishlisted: boolean;
  onClick: (id: string) => void;
  onToggleWishlist: (id: string) => void;
  onOpenStore: (id: string) => void;
  onOpenInLibrary?: (libraryGameId: string) => void;
  onPlay?: (libraryGameId: string) => void;
}

export function StoreCapsuleCard({
  game,
  isInLibrary = false,
  isInstalled = false,
  libraryGameId,
  isWishlisted,
  onClick,
  onToggleWishlist,
  onOpenStore,
  onOpenInLibrary,
  onPlay,
}: StoreCapsuleCardProps) {
  return (
    <div className="w-[clamp(200px,14vw,240px)] flex-shrink-0 overflow-hidden border-2 border-black bg-[#f6edd8] shadow-[3px_3px_0_#171411] transition-transform hover:translate-y-[-2px] hover:shadow-[4px_4px_0_#171411]">
      <button
        type="button"
        onClick={() => onClick(game.id)}
        className="w-full cursor-pointer text-left"
      >
        <div className="relative aspect-[460/215] w-full overflow-hidden border-b-2 border-black bg-[#d8cdbb]">
          {game.coverImageUrl ? (
            <img
              src={game.coverImageUrl}
              alt={game.title}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] font-black text-[#5b403f] uppercase">
              {game.title}
            </div>
          )}

          {/* Badges Overlay */}
          <div className="absolute top-1 left-1 flex flex-col gap-1">
            {isInLibrary && (
              <span className="neo-copy inline-flex items-center gap-0.5 border-2 border-black bg-[#007166] px-1.5 py-0.5 text-[8px] font-black text-white uppercase shadow-[1px_1px_0_#000]">
                <Check size={10} className="stroke-[3]" /> Owned
              </span>
            )}
            {game.discountPercent ? (
              <span className="neo-copy border-2 border-black bg-[#b7102a] px-1.5 py-0.5 text-[9px] font-black text-white shadow-[1px_1px_0_#000]">
                -{game.discountPercent}%
              </span>
            ) : null}
          </div>
        </div>

        <div className="p-2">
          <div className="neo-title truncate text-sm leading-tight text-[#171411]">
            {game.title}
          </div>

          {game.platform.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {game.platform.slice(0, 3).map((p) => (
                <span
                  key={p}
                  className="neo-copy border border-black bg-[#fff9ed] px-1 py-0.5 text-[7px] font-black text-[#171411] uppercase"
                >
                  {p}
                </span>
              ))}
            </div>
          )}

          <div className="mt-1.5 flex items-center justify-between gap-1">
            <div className="flex items-baseline gap-1.5">
              {game.discountPercent && game.originalPrice ? (
                <>
                  <span className="neo-copy text-[9px] font-bold text-[#5b403f] line-through">
                    €{game.originalPrice.toFixed(2)}
                  </span>
                  <span className="neo-copy text-[10px] font-black text-[#b7102a]">
                    €{game.price.toFixed(2)}
                  </span>
                </>
              ) : (
                <span className="neo-copy text-[10px] font-black text-[#171411]">
                  {game.isFree ? "Free" : `€${game.price.toFixed(2)}`}
                </span>
              )}
            </div>

            {game.rating ? (
              <span className="neo-copy text-[8px] font-black text-[#5b403f]">
                ★ {game.rating.toFixed(1)}
              </span>
            ) : null}
          </div>
        </div>
      </button>

      {/* Bottom Actions */}
      <div className="flex border-t-2 border-black">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleWishlist(game.id);
          }}
          className={`flex flex-1 items-center justify-center gap-1 border-r-2 border-black py-1.5 text-[9px] font-black uppercase transition-colors ${
            isWishlisted
              ? "bg-[#b7102a] text-white"
              : "bg-[#fff9ed] text-[#171411] hover:bg-[#f6edd8]"
          }`}
        >
          <Heart size={10} className={isWishlisted ? "fill-current" : ""} />
          {isWishlisted ? "Saved" : "Wishlist"}
        </button>

        {isInstalled && libraryGameId && onPlay ? (
          <button
            type="button"
            aria-label={`Play ${game.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onPlay(libraryGameId);
            }}
            className="flex flex-1 items-center justify-center gap-1 bg-[#b7102a] py-1.5 text-[9px] font-black text-white uppercase transition-all hover:brightness-110"
          >
            <Play size={10} /> Spielen
          </button>
        ) : isInLibrary && libraryGameId && onOpenInLibrary ? (
          <button
            type="button"
            aria-label={`Open in Library: ${game.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onOpenInLibrary(libraryGameId);
            }}
            className="flex flex-1 items-center justify-center gap-1 bg-[#007166] py-1.5 text-[9px] font-black text-white uppercase transition-all hover:brightness-110"
          >
            <Gamepad2 size={10} /> In Bibliothek
          </button>
        ) : (
          <button
            type="button"
            aria-label={`Open store for ${game.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onOpenStore(game.id);
            }}
            className="flex flex-1 items-center justify-center gap-1 bg-[#007166] py-1.5 text-[9px] font-black text-white uppercase transition-all hover:brightness-110"
          >
            <ExternalLink size={10} /> Store
          </button>
        )}
      </div>
    </div>
  );
}
