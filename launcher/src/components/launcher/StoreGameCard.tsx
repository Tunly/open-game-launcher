import { Check, Heart, ShoppingCart } from "lucide-react";

import type { StoreGame } from "../../lib/types";

interface StoreGameCardProps {
  game: StoreGame;
  isAdded: boolean;
  isInCart: boolean;
  isProcessing: boolean;
  isWishlisted: boolean;
  onAddToCart: (gameId: string) => void;
  onBuyNow: (gameId: string) => void;
  onToggleWishlist: (gameId: string) => void;
  onViewDetails: (gameId: string) => void;
}

function formatPrice(game: StoreGame) {
  if (game.isFree || game.price === 0) {
    return "Free";
  }

  return new Intl.NumberFormat("en-US", {
    currency: "EUR",
    style: "currency",
  }).format(game.price);
}

export function StoreGameCard({
  game,
  isAdded,
  isInCart,
  isProcessing,
  isWishlisted,
  onAddToCart,
  onBuyNow,
  onToggleWishlist,
  onViewDetails,
}: StoreGameCardProps) {
  const priceLabel = formatPrice(game);
  const buyLabel = isAdded ? "Owned" : game.isFree ? "Claim" : priceLabel;

  return (
    <article className="group relative overflow-hidden border-[3px] border-black bg-[#171411] shadow-[4px_4px_0_#171411] transition hover:-translate-y-0.5">
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
            src={game.coverImageUrl}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-[#efe6d4]">
            <span className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[9px] font-black uppercase text-[#655f58] shadow-[2px_2px_0_#171411]">
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
          <p className="neo-copy mt-1 line-clamp-1 text-[9px] font-black uppercase tracking-[0.08em] text-[#fff9ed]">
            {game.publisher ?? game.tagLine}
          </p>
        </div>
        <div className="absolute left-2 top-2 flex max-w-[calc(100%-84px)] flex-wrap gap-1.5">
          {(game.genres ?? [game.tagLine]).slice(0, 3).map((genre) => (
            <span
              key={genre}
              className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em] text-[#171411] shadow-[2px_2px_0_#171411]"
            >
              {genre}
            </span>
          ))}
        </div>
      </button>
      <div className="absolute right-2 top-2 z-10 flex gap-1.5">
        <button
          aria-label={
            isWishlisted ? `Remove ${game.title} from wishlist` : `Wishlist ${game.title}`
          }
          className={`flex h-9 w-9 items-center justify-center border-2 border-black shadow-[2px_2px_0_#171411] ${
            isWishlisted ? "bg-[#b7102a] text-white" : "bg-[#fff9ed] text-[#171411]"
          }`}
          type="button"
          onClick={() => onToggleWishlist(game.id)}
        >
          <Heart className={`h-4 w-4 ${isWishlisted ? "fill-current" : ""}`} />
        </button>
        <button
          aria-label={isInCart ? `${game.title} is in cart` : `Add ${game.title} to cart`}
          className="flex h-9 w-9 items-center justify-center border-2 border-black bg-[#087d6d] text-white shadow-[2px_2px_0_#171411] disabled:opacity-60"
          disabled={isInCart || isAdded || isProcessing}
          type="button"
          onClick={() => onAddToCart(game.id)}
        >
          {isInCart || isAdded ? (
            <Check className="h-5 w-5" />
          ) : (
            <ShoppingCart className="h-5 w-5" />
          )}
        </button>
      </div>
      <button
        aria-label={`${isAdded ? "Owned" : game.isFree ? "Claim" : "Buy now"} - ${priceLabel}`}
        className="neo-copy absolute bottom-2 right-2 z-10 min-w-24 border-2 border-black bg-[#171411] text-right text-[10px] font-black uppercase tracking-[0.08em] text-[#fff9ed] shadow-[2px_2px_0_#171411] disabled:opacity-70"
        disabled={isAdded || isProcessing}
        type="button"
        onClick={() => onBuyNow(game.id)}
      >
        {game.originalPrice && game.originalPrice > game.price ? (
          <span className="block border-b-2 border-black bg-[#5b403f] px-2 py-0.5 text-[8px] text-[#f6edd8] line-through">
            {new Intl.NumberFormat("en-US", {
              currency: "EUR",
              style: "currency",
            }).format(game.originalPrice)}
          </span>
        ) : null}
        <span className="block bg-[#b7102a] px-2 py-1 text-sm leading-none">{buyLabel}</span>
      </button>
      {game.discountPercent ? (
        <span className="neo-copy absolute bottom-2 left-2 z-10 border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[11px] font-black uppercase leading-none text-[#171411] shadow-[2px_2px_0_#171411]">
          -{game.discountPercent}%
        </span>
      ) : null}
    </article>
  );
}
