import { Bell, Check, Heart, ShoppingCart } from "lucide-react";
import { useState } from "react";

import type { StoreGame } from "../../lib/types";

interface StoreGameCardProps {
  game: StoreGame;
  isAdded: boolean;
  isInCart: boolean;
  isWishlisted: boolean;
  priceAlert: number | null;
  onAddToCart: (gameId: string) => void;
  onBuyNow: (gameId: string) => void;
  onSetPriceAlert: (gameId: string, value: number | null) => void;
  onToggleWishlist: (gameId: string) => void;
  onViewDetails: (gameId: string) => void;
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

  return new Intl.NumberFormat("en-US", {
    currency: "EUR",
    style: "currency",
  }).format(game.price);
}

export function StoreGameCard({
  game,
  isAdded,
  isInCart,
  isWishlisted,
  onAddToCart,
  onBuyNow,
  onSetPriceAlert,
  onToggleWishlist,
  onViewDetails,
  priceAlert,
}: StoreGameCardProps) {
  const [isPriceAlertEditorOpen, setIsPriceAlertEditorOpen] = useState(false);
  const [priceAlertInput, setPriceAlertInput] = useState(priceAlert?.toString() ?? "");

  return (
    <article className="overflow-hidden border-4 border-black bg-[#f5eedf] shadow-[5px_5px_0_#171411]">
      <div
        className={`${artClassById[game.id] ?? "card-art-drift"} steam-game-banner relative border-b-4 border-black`}
      >
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
        <h3 className="text-[clamp(1.35rem,7vw,1.5rem)] font-black uppercase leading-none text-[#171411]">
          {game.title}
        </h3>
        <p className="neo-copy mt-2 text-xs font-bold uppercase text-[#171411]">
          {game.description}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(game.genres ?? [game.tagLine]).slice(0, 3).map((genre) => (
            <span
              key={genre}
              className="neo-copy border-2 border-black bg-[#efe3cf] px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-[#171411]"
            >
              {genre}
            </span>
          ))}
          {game.discountPercent ? (
            <span className="neo-copy border-2 border-black bg-[#b7102a] px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-white">
              -{game.discountPercent}%
            </span>
          ) : null}
        </div>
        <div className="my-4 h-0.5 bg-[#171411]" />
        <div className="flex items-end justify-between gap-4">
          <div>
            {game.originalPrice && game.originalPrice > game.price ? (
              <p className="neo-copy text-[10px] font-black uppercase text-[#655f58] line-through">
                {new Intl.NumberFormat("en-US", {
                  currency: "EUR",
                  style: "currency",
                }).format(game.originalPrice)}
              </p>
            ) : null}
            <p className="text-2xl font-black text-[#171411]">{formatPrice(game)}</p>
          </div>
          <div className="flex gap-2">
            <button
              aria-label={
                isWishlisted ? `Remove ${game.title} from wishlist` : `Wishlist ${game.title}`
              }
              className={`flex h-10 w-10 items-center justify-center border-2 border-black shadow-[3px_3px_0_#171411] ${
                isWishlisted ? "bg-[#b7102a] text-white" : "bg-[#fff9ed] text-[#171411]"
              }`}
              type="button"
              onClick={() => onToggleWishlist(game.id)}
            >
              <Heart className={`h-5 w-5 ${isWishlisted ? "fill-current" : ""}`} />
            </button>
            <button
              aria-label={
                priceAlert
                  ? `Clear price alert for ${game.title}`
                  : `Set price alert for ${game.title}`
              }
              className={`flex h-10 w-10 items-center justify-center border-2 border-black shadow-[3px_3px_0_#171411] ${
                priceAlert ? "bg-[#f2c14e] text-[#171411]" : "bg-[#fff9ed] text-[#171411]"
              }`}
              type="button"
              onClick={() => {
                if (priceAlert) {
                  onSetPriceAlert(game.id, null);
                  setPriceAlertInput("");
                  return;
                }

                setIsPriceAlertEditorOpen((isOpen) => !isOpen);
              }}
            >
              <Bell className="h-5 w-5" />
            </button>
            <button
              aria-label={isInCart ? `${game.title} is in cart` : `Add ${game.title} to cart`}
              className="flex h-10 w-10 items-center justify-center border-2 border-black bg-[#087d6d] text-white shadow-[3px_3px_0_#171411] disabled:opacity-60"
              disabled={isInCart || isAdded}
              type="button"
              onClick={() => onAddToCart(game.id)}
            >
              {isInCart || isAdded ? (
                <Check className="h-6 w-6" />
              ) : (
                <ShoppingCart className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
        <button
          className="neo-copy mt-4 h-10 w-full border-2 border-black bg-[#171411] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-[#fff9ed] shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 disabled:opacity-60"
          disabled={isAdded}
          type="button"
          onClick={() => onBuyNow(game.id)}
        >
          {isAdded ? "Owned" : game.isFree ? "Claim" : "Buy Now"}
        </button>
        <button
          className="neo-copy mt-2 h-9 w-full border-2 border-black bg-[#fff9ed] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411] shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5"
          type="button"
          onClick={() => onViewDetails(game.id)}
        >
          Details
        </button>
        {priceAlert !== null ? (
          <p className="neo-copy mt-3 border-2 border-black bg-[#f2c14e] p-2 text-[9px] font-black uppercase tracking-[0.1em] text-[#171411]">
            Alert below{" "}
            {new Intl.NumberFormat("en-US", {
              currency: "EUR",
              style: "currency",
            }).format(priceAlert)}
          </p>
        ) : null}
        {isPriceAlertEditorOpen && priceAlert === null ? (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const parsed = Number.parseFloat(priceAlertInput.replace(",", "."));
              if (Number.isFinite(parsed) && parsed >= 0) {
                onSetPriceAlert(game.id, parsed);
                setIsPriceAlertEditorOpen(false);
              }
            }}
          >
            <input
              className="neo-copy min-w-0 flex-1 border-2 border-black bg-[#fff9ed] px-2 text-[10px] font-black uppercase text-[#171411] outline-none"
              inputMode="decimal"
              placeholder="Target EUR"
              value={priceAlertInput}
              onChange={(event) => setPriceAlertInput(event.target.value)}
            />
            <button
              className="neo-copy border-2 border-black bg-[#f2c14e] px-3 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]"
              type="submit"
            >
              Save
            </button>
          </form>
        ) : null}
      </div>
    </article>
  );
}
