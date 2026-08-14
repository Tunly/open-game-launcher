import { Check, ExternalLink, Gamepad2, Heart, Info, Play } from "lucide-react";

import type { StoreGame } from "../../lib/types";

interface StoreHeroBannerProps {
  game: StoreGame;
  isInLibrary?: boolean;
  isInstalled?: boolean;
  libraryGameId?: string | null;
  isWishlisted: boolean;
  onOpenStore: (id: string) => void;
  onViewDetails: (id: string) => void;
  onToggleWishlist: (id: string) => void;
  onOpenInLibrary?: (libraryGameId: string) => void;
  onPlay?: (libraryGameId: string) => void;
}

export function StoreHeroBanner({
  game,
  isInLibrary = false,
  isInstalled = false,
  libraryGameId,
  isWishlisted,
  onOpenStore,
  onViewDetails,
  onToggleWishlist,
  onOpenInLibrary,
  onPlay,
}: StoreHeroBannerProps) {
  return (
    <div className="relative mb-8 h-[340px] overflow-hidden border-4 border-black bg-[#171411] shadow-[6px_6px_0_#171411]">
      {game.coverImageUrl ? (
        <img src={game.coverImageUrl} alt={game.title} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-6xl font-black text-[#f6edd8]">
          {game.title[0]}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#171411] via-[#171411]/60 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(255,249,237,0.12)_1px,transparent_1px)] bg-[length:8px_8px] opacity-70" />

      <div className="absolute right-0 bottom-0 left-0 p-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {isInLibrary && (
            <span className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#007166] px-2 py-0.5 text-[10px] font-black text-white uppercase shadow-[2px_2px_0_#171411]">
              <Check size={12} className="stroke-[3]" /> In Library
            </span>
          )}
          {game.isFree && (
            <span className="neo-copy inline-block border-2 border-black bg-[#8cf5e4] px-2 py-0.5 text-[10px] font-black text-[#171411] uppercase shadow-[2px_2px_0_#171411]">
              Free to Play
            </span>
          )}
          {game.discountPercent ? (
            <span className="neo-copy inline-block border-2 border-black bg-[#b7102a] px-2 py-0.5 text-[10px] font-black text-white uppercase shadow-[2px_2px_0_#171411]">
              -{game.discountPercent}% Sale
            </span>
          ) : null}
          <span className="neo-copy inline-block border-2 border-black bg-[#fff9ed] px-2 py-0.5 text-[9px] font-black text-[#171411] uppercase">
            Featured Highlight
          </span>
        </div>

        <h2 className="neo-title mb-1 text-3xl text-[#fff9ed] drop-shadow-[2px_2px_0_#171411]">
          {game.title}
        </h2>
        <p className="neo-copy mb-4 line-clamp-2 max-w-xl text-sm text-[#d8cdbb]">
          {game.tagLine || game.description}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {isInstalled && libraryGameId && onPlay ? (
            <button
              type="button"
              onClick={() => onPlay(libraryGameId)}
              className="neo-copy flex items-center gap-2 border-2 border-black bg-[#b7102a] px-5 py-2.5 text-[11px] font-black text-white uppercase shadow-[3px_3px_0_#171411] transition-transform hover:-translate-y-0.5"
            >
              <Play size={14} /> Spielen
            </button>
          ) : isInLibrary && libraryGameId && onOpenInLibrary ? (
            <button
              type="button"
              onClick={() => onOpenInLibrary(libraryGameId)}
              className="neo-copy flex items-center gap-2 border-2 border-black bg-[#007166] px-5 py-2.5 text-[11px] font-black text-white uppercase shadow-[3px_3px_0_#171411] transition-transform hover:-translate-y-0.5"
            >
              <Gamepad2 size={14} /> In Bibliothek öffnen
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenStore(game.id)}
              className="neo-copy flex items-center gap-2 border-2 border-black bg-[#007166] px-5 py-2.5 text-[11px] font-black text-white uppercase shadow-[3px_3px_0_#171411] transition-transform hover:-translate-y-0.5"
            >
              <ExternalLink size={14} /> Open Store
            </button>
          )}
          <button
            type="button"
            onClick={() => onViewDetails(game.id)}
            className="neo-copy flex items-center gap-2 border-2 border-black bg-[#f6edd8] px-5 py-2.5 text-[11px] font-black uppercase shadow-[3px_3px_0_#171411] transition-transform hover:-translate-y-0.5"
          >
            <Info size={14} /> More Info
          </button>
          <button
            type="button"
            onClick={() => onToggleWishlist(game.id)}
            className={`neo-copy flex items-center gap-1.5 border-2 border-black px-4 py-2.5 text-[11px] font-black uppercase shadow-[3px_3px_0_#171411] transition-colors ${
              isWishlisted
                ? "bg-[#b7102a] text-white"
                : "bg-[#fff9ed] text-[#171411] hover:bg-[#f6edd8]"
            }`}
          >
            <Heart size={14} className={isWishlisted ? "fill-current" : ""} />
            {isWishlisted ? "Saved" : "Wishlist"}
          </button>
        </div>
      </div>
    </div>
  );
}
