import { Heart, ExternalLink } from "lucide-react";

import type { StoreGame } from "../../lib/types";

const euroCurrencyFormatter = new Intl.NumberFormat("en-US", {
  currency: "EUR",
  style: "currency",
});

export function StoreProductRow({
  game,
  platforms,
  isWishlisted,
  onToggleWishlist,
  onOpenStore,
  onViewDetails,
}: {
  game: StoreGame;
  platforms: string[];
  isWishlisted: boolean;
  onToggleWishlist: (id: string) => void;
  onOpenStore: (id: string) => void;
  onViewDetails: (id: string) => void;
}) {
  const price =
    game.priceAvailable === false
      ? "Price unavailable"
      : game.isFree || game.price === 0
        ? "Free"
        : euroCurrencyFormatter.format(game.price);

  return (
    <article className="group grid grid-cols-[104px_minmax(0,1fr)_auto] gap-3 border-2 border-black bg-[#f6edd8] p-2 shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#efe6d4] sm:grid-cols-[150px_minmax(0,1fr)_150px]">
      <button
        aria-label={`View details for ${game.title}`}
        className="relative h-20 overflow-hidden border-2 border-black bg-[#302c25] text-left sm:h-24"
        type="button"
        onClick={() => onViewDetails(game.id)}
      >
        {game.coverImageUrl ? (
          <img alt="" className="h-full w-full object-cover" src={game.coverImageUrl} />
        ) : null}
        <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_30%,rgba(23,20,17,0.78))]" />
        <span className="neo-copy absolute right-1 bottom-1 left-1 line-clamp-2 text-[8px] font-black text-[#fff9ed] uppercase">
          {game.title}
        </span>
      </button>
      <div className="min-w-0 py-1">
        <button
          className="neo-title block max-w-full truncate text-left text-2xl leading-none hover:text-[#b7102a]"
          type="button"
          onClick={() => onViewDetails(game.id)}
        >
          {game.title}
        </button>
        <p className="neo-copy mt-2 line-clamp-2 text-[9px] font-black text-[#655f58] uppercase">
          {game.publisher ?? game.tagLine}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {platforms.slice(0, 4).map((platform) => (
            <span
              key={platform}
              className="neo-copy border border-black bg-[#fff9ed] px-1.5 py-0.5 text-[8px] font-black uppercase"
            >
              {platform}
            </span>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-col items-end justify-between gap-2 py-1 text-right">
        <span className="neo-copy text-[9px] font-black text-[#655f58] uppercase">
          {game.releaseDate?.slice(0, 10) ?? "Release TBA"}
        </span>
        <div className="flex items-center gap-2">
          <span className="neo-copy text-sm font-black">{price}</span>
          {game.discountPercent ? (
            <span className="neo-copy bg-[#007166] px-1.5 py-1 text-[9px] font-black text-white">
              -{game.discountPercent}%
            </span>
          ) : null}
        </div>
        <div className="flex gap-1">
          <button
            aria-label={
              isWishlisted ? `Remove ${game.title} from wishlist` : `Wishlist ${game.title}`
            }
            className={`border-2 border-black p-1 ${isWishlisted ? "bg-[#b7102a] text-white" : "bg-[#fff9ed]"}`}
            type="button"
            onClick={() => onToggleWishlist(game.id)}
          >
            <Heart className={`h-4 w-4 ${isWishlisted ? "fill-current" : ""}`} />
          </button>
          <button
            aria-label={`Open store for ${game.title}`}
            className="neo-copy flex items-center gap-1 border-2 border-black bg-[#b7102a] px-2 py-1 text-[8px] font-black text-white uppercase"
            type="button"
            onClick={() => onOpenStore(game.id)}
          >
            <ExternalLink className="h-3 w-3" />
            Open platform store
          </button>
        </div>
      </div>
    </article>
  );
}
