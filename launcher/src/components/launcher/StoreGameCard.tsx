import { Heart } from "lucide-react";

import type { StoreGame } from "../../lib/types";

const euroCurrencyFormatter = new Intl.NumberFormat("en-US", {
  currency: "EUR",
  style: "currency",
});

interface StoreGameCardProps {
  game: StoreGame;
  isWishlisted: boolean;
  isProcessing?: boolean;
  platformLabels?: string[];
  onToggleWishlist: (gameId: string) => void;
  onViewDetails: (gameId: string) => void;
  onBuyNow?: (gameId: string) => void;
}

function formatPrice(game: StoreGame) {
  if (game.priceAvailable === false) return "Price unavailable";
  if (game.isFree || game.price === 0) return "Free";
  return euroCurrencyFormatter.format(game.price);
}

function formatPlatform(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function StoreGameCard({
  game,
  isWishlisted,
  isProcessing = false,
  platformLabels = [],
  onToggleWishlist,
  onViewDetails,
  onBuyNow,
}: StoreGameCardProps) {
  const priceLabel = formatPrice(game);
  const labels = platformLabels.length > 0 ? platformLabels : game.platform;

  return (
    <article className="group relative overflow-hidden border-[3px] border-black bg-[#171411] shadow-[4px_4px_0_#171411]">
      <button
        aria-label={`View details for ${game.title}`}
        className="steam-game-banner relative block w-full overflow-hidden bg-[#302c25] text-left"
        type="button"
        onClick={() => onViewDetails(game.id)}
      >
        {game.coverImageUrl ? (
          <img
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            decoding="async"
            loading="lazy"
            src={game.coverImageUrl}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-[#efe6d4]">
            <span className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[9px] font-black text-[#655f58] uppercase shadow-[2px_2px_0_#171411]">
              No cover published
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(23,20,17,0.04)_0%,rgba(23,20,17,0.2)_45%,rgba(23,20,17,0.92)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,249,237,0.16)_1px,transparent_1px)] bg-[length:8px_8px] opacity-70" />
        <div className="absolute inset-x-0 bottom-0 p-3 pr-24">
          <h3 className="neo-title text-[1.85rem] leading-none text-[#fff9ed] drop-shadow-[2px_2px_0_#171411]">
            {game.title}
          </h3>
          <p className="neo-copy mt-1 line-clamp-1 text-[9px] font-black tracking-[0.08em] text-[#fff9ed] uppercase">
            {game.publisher ?? game.tagLine}
          </p>
        </div>
        <div className="absolute top-2 left-2 flex max-w-[calc(100%-84px)] flex-wrap gap-1.5">
          {labels.slice(0, 4).map((label) => (
            <span
              key={label}
              className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black tracking-[0.08em] text-[#171411] uppercase shadow-[2px_2px_0_#171411]"
            >
              {formatPlatform(label)}
            </span>
          ))}
        </div>
      </button>
      <div className="border-t-2 border-black bg-[#fff9ed] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="neo-copy text-[12px] font-black text-[#171411] uppercase">
            {priceLabel}
          </span>
          {game.discountPercent ? (
            <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[9px] font-black text-[#171411] uppercase">
              -{game.discountPercent}%
            </span>
          ) : null}
        </div>
        <div className="mt-2">
          <button
            className="neo-copy h-9 w-full border-2 border-black bg-[#b7102a] px-2 text-[9px] font-black text-white uppercase disabled:opacity-50"
            disabled={isProcessing || !onBuyNow}
            type="button"
            onClick={() => onBuyNow?.(game.id)}
          >
            {isProcessing ? "Opening store" : "Open platform store"}
          </button>
        </div>
      </div>
      <div className="absolute top-2 right-2 z-10">
        <button
          aria-label={
            isWishlisted ? `Remove ${game.title} from wishlist` : `Wishlist ${game.title}`
          }
          className={`flex h-9 w-9 items-center justify-center border-2 border-black shadow-[2px_2px_0_#171411] ${isWishlisted ? "bg-[#b7102a] text-white" : "bg-[#fff9ed] text-[#171411]"}`}
          type="button"
          onClick={() => onToggleWishlist(game.id)}
        >
          <Heart className={`h-4 w-4 ${isWishlisted ? "fill-current" : ""}`} />
        </button>
      </div>
    </article>
  );
}
