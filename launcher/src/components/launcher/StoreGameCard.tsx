import { ShoppingCart } from "lucide-react";

import type { StoreGame } from "../../lib/types";

interface StoreGameCardProps {
  game: StoreGame;
  isAdded: boolean;
  onAddToLibrary: (gameId: string) => void;
}

const artClassById: Record<string, string> = {
  "deep-signal": "card-art-drift",
  "redline-tactics": "card-art-crash",
  "haven-forge": "card-art-blood",
};

function formatPrice(game: StoreGame) {
  if (game.isFree || game.price === 0) {
    return "Free";
  }

  return new Intl.NumberFormat("de-DE", {
    currency: "EUR",
    style: "currency",
  }).format(game.price);
}

export function StoreGameCard({
  game,
  isAdded,
  onAddToLibrary,
}: StoreGameCardProps) {
  return (
    <article className="overflow-hidden border-4 border-black bg-[#f5eedf] shadow-[5px_5px_0_#171411]">
      <div className={`${artClassById[game.id] ?? "card-art-drift"} relative h-48 border-b-4 border-black`}>
        {game.id === "deep-signal" ? (
          <div className="absolute bottom-8 left-12 h-16 w-36 -skew-x-12 rounded-[45%] border-4 border-[#171411] bg-[#ece8de] shadow-[26px_20px_0_rgba(23,20,17,0.16)]">
            <div className="absolute -bottom-4 left-4 h-8 w-8 rounded-full border-4 border-[#171411] bg-[#f5eedf]" />
            <div className="absolute -bottom-4 right-6 h-8 w-8 rounded-full border-4 border-[#171411] bg-[#f5eedf]" />
            <div className="absolute left-10 top-4 h-5 w-16 border-2 border-[#171411]" />
          </div>
        ) : null}
        {game.id === "haven-forge" ? (
          <div className="absolute bottom-0 left-1/2 h-24 w-10 -translate-x-1/2 bg-[#171411]" />
        ) : null}
      </div>

      <div className="p-4">
        <h3 className="text-2xl font-black uppercase leading-none text-[#171411]">
          {game.title}
        </h3>
        <p className="neo-copy mt-2 text-xs font-bold uppercase text-[#171411]">
          {game.description}
        </p>
        <div className="my-4 h-0.5 bg-[#171411]" />
        <div className="flex items-center justify-between gap-4">
          <p className="text-2xl font-black text-[#171411]">{formatPrice(game)}</p>
          <button
            aria-label={isAdded ? "Added to library" : `Add ${game.title}`}
            className="flex h-10 w-10 items-center justify-center border-2 border-black bg-[#087d6d] text-white shadow-[3px_3px_0_#171411] disabled:opacity-60"
            disabled={isAdded}
            type="button"
            onClick={() => onAddToLibrary(game.id)}
          >
            <ShoppingCart className="h-6 w-6" />
          </button>
        </div>
      </div>
    </article>
  );
}
