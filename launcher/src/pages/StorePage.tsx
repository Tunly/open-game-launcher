import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { isTauri } from "@tauri-apps/api/core";
import { Search, X, ChevronRight, Heart, ExternalLink, Menu, Filter, Star } from "lucide-react";

import { useCurrentUser } from "../hooks/useCurrentUser";
import {
  addToStoreWishlist,
  getMyStoreReview,
  listMyStoreWishlist,
  listPublishedProductsPage,
  listStoreProductReviews,
  removeFromStoreWishlist,
  upsertStoreReview,
} from "../lib/supabase/store";
import { openExternalUrl } from "../lib/launcher/platform-auth";
import { filterSupportedPlatforms, isKeyResellerName } from "../lib/store-api";
import { listStoreCatalogPage } from "../lib/supabase/store-catalog";
import { EXAMPLE_STORE_CATALOG } from "../lib/store-example-catalog";
import type { StoreGame } from "../lib/types";
import type { StoreProduct, StoreReview } from "../lib/types/store";

type PriceFilter = "all" | "free" | "under-15" | "discounts";

const GENRES = [
  "Action",
  "Adventure",
  "Casual",
  "Indie",
  "Multiplayer",
  "Racing",
  "RPG",
  "Simulation",
  "Sports",
  "Strategy",
];

const PLATFORM_FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All Platforms" },
  { key: "windows", label: "Windows" },
  { key: "linux", label: "Linux" },
  { key: "macos", label: "macOS" },
  { key: "steam", label: "Steam" },
  { key: "gog", label: "GOG" },
  { key: "epic games", label: "Epic Games" },
  { key: "xbox", label: "Xbox" },
  { key: "ea", label: "EA" },
  { key: "ubisoft", label: "Ubisoft" },
  { key: "battle.net", label: "Battle.net" },
];

const PLATFORM_QUERY_VALUE: Record<string, string> = {
  windows: "Windows",
  linux: "Linux",
  macos: "macOS",
  steam: "Steam",
  gog: "GOG",
  "epic games": "Epic Games",
  xbox: "Xbox",
  ea: "EA",
  ubisoft: "Ubisoft",
  "battle.net": "Battle.net",
};

// ---------- helpers ----------

function keepNonKeyshopPlatforms(product: StoreProduct): StoreProduct | null {
  const metadataLinks = [
    product.metadata.purchaseUrl,
    product.metadata.storeUrl,
    product.metadata.platformUrl,
    product.metadata.buyUrl,
  ];
  const platformLinks = [
    product.metadata.platformUrls,
    product.metadata.storeUrls,
    product.metadata.storeLinks,
    product.metadata.platformLinks,
    product.metadata.urls,
  ].flatMap((v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.values(v) : []));
  const storeDetails = [
    product.publisher,
    product.shortDescription,
    ...metadataLinks,
    ...platformLinks,
  ].filter((v): v is string => typeof v === "string");
  if (storeDetails.some(isKeyResellerName)) return null;
  return filterSupportedPlatforms(product);
}

function firstText(...values: Array<string | null | undefined>) {
  return values.find((v) => typeof v === "string" && v.trim())?.trim() ?? "";
}

function hasAvailablePrice(product: StoreProduct) {
  return product.metadata.priceUnavailable !== true;
}

function effectivePrice(product: StoreProduct) {
  const price = product.priceCents / 100;
  return Math.round(price * Math.max(0, 100 - product.discountPercent)) / 100;
}

function readMetadataUrl(value: unknown) {
  return typeof value === "string" && /^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim())
    ? value.trim()
    : null;
}

function isAllowedPlatformUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "steam:" || url.protocol === "ms-windows-store:") return true;
    if (url.protocol !== "https:") return false;
    return [
      "store.steampowered.com",
      "www.gog.com",
      "store.epicgames.com",
      "www.xbox.com",
      "apps.microsoft.com",
      "store.playstation.com",
      "www.nintendo.com",
      "www.ea.com",
      "store.ubisoft.com",
      "us.shop.battle.net",
    ].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function getPlatformPurchaseUrl(product: StoreProduct) {
  const metadata = product.metadata;
  const normalizedPlatforms = product.platforms.map((v) => v.trim().toLowerCase());
  const platform =
    normalizedPlatforms.find((v) =>
      [
        "steam",
        "epic",
        "epic games",
        "gog",
        "xbox",
        "playstation",
        "ps5",
        "ps4",
        "nintendo",
        "switch",
        "ea",
        "ubisoft",
        "battlenet",
        "battle.net",
        "windows",
      ].includes(v),
    ) ?? normalizedPlatforms[0];
  const platformUrls =
    metadata.platformUrls ??
    metadata.storeUrls ??
    metadata.storeLinks ??
    metadata.platformLinks ??
    metadata.urls;
  if (platformUrls && typeof platformUrls === "object" && !Array.isArray(platformUrls)) {
    const entries = Object.entries(platformUrls as Record<string, unknown>);
    const pu = readMetadataUrl(entries.find(([k]) => k.toLowerCase() === platform)?.[1]);
    if (pu && isAllowedPlatformUrl(pu)) return pu;
  }
  for (const key of ["purchaseUrl", "storeUrl", "platformUrl", "buyUrl"]) {
    const url = readMetadataUrl(metadata[key]);
    if (url && isAllowedPlatformUrl(url)) return url;
  }
  const externalId = metadata.externalId ?? metadata.appId ?? metadata.storeId;
  const id =
    typeof externalId === "string" || typeof externalId === "number"
      ? encodeURIComponent(String(externalId))
      : null;
  const title = encodeURIComponent(product.title);
  if (platform === "steam")
    return id ? `steam://store/${id}` : `https://store.steampowered.com/search/?term=${title}`;
  if (platform === "epic" || platform === "epic games")
    return `https://store.epicgames.com/en-US/p/${encodeURIComponent(product.slug)}`;
  if (platform === "gog") return `https://www.gog.com/en/game/${encodeURIComponent(product.slug)}`;
  if (platform === "xbox")
    return id
      ? `ms-windows-store://pdp/?productid=${id}`
      : `https://www.xbox.com/en-US/search?q=${title}`;
  if (platform === "playstation" || platform === "ps5" || platform === "ps4")
    return `https://store.playstation.com/en-us/search/${title}`;
  if (platform === "nintendo" || platform === "switch")
    return `https://www.nintendo.com/us/search/#q=${title}`;
  if (platform === "ea") return `https://www.ea.com/games/${encodeURIComponent(product.slug)}`;
  if (platform === "ubisoft")
    return `https://store.ubisoft.com/${encodeURIComponent(product.slug)}`;
  if (platform === "battlenet" || platform === "battle.net")
    return `https://us.shop.battle.net/en-us/family/${encodeURIComponent(product.slug)}`;
  if (platform === "windows") return `https://apps.microsoft.com/search?query=${title}`;
  return `https://store.steampowered.com/search/?term=${title}`;
}

function mapExampleToStoreProduct(game: StoreGame): StoreProduct {
  const p = game.platform[0] ?? "windows";
  const query = encodeURIComponent(game.title);
  const platformUrl =
    p === "windows"
      ? `https://apps.microsoft.com/search?query=${query}`
      : `https://store.steampowered.com/search/?term=${query}`;
  return {
    id: game.id,
    title: game.title,
    slug: game.slug ?? game.id,
    description: game.description,
    shortDescription: game.tagLine,
    developerId: "local-example-catalog",
    publisher: game.publisher ?? null,
    releaseDate: game.releaseDate ?? null,
    genres: game.genres ?? [],
    tags: [],
    platforms: game.platform,
    priceCents: Math.round(game.price * 100),
    discountPercent: game.discountPercent ?? 0,
    coverImageUrl: game.coverImageUrl ?? null,
    trailerUrl: null,
    minSystemRequirements: {},
    recSystemRequirements: {},
    rating: game.rating ?? null,
    ratingsCount: game.ratingsCount ?? 0,
    downloadsCount: game.downloadsCount ?? 0,
    status: "published" as const,
    metadata: { platformLinks: { [p]: platformUrl }, localExample: true },
    createdAt: game.releaseDate ?? "2026-01-01T00:00:00.000Z",
    updatedAt: game.releaseDate ?? "2026-01-01T00:00:00.000Z",
  };
}

const LOCAL_FALLBACK = EXAMPLE_STORE_CATALOG.map(mapExampleToStoreProduct);
const PAGE_SIZE = 40;

function mapProductToGame(product: StoreProduct): StoreGame {
  const price = effectivePrice(product);
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    description: firstText(product.description, product.shortDescription),
    coverImageUrl: product.coverImageUrl ?? undefined,
    downloadsCount: product.downloadsCount,
    price,
    priceAvailable: hasAvailablePrice(product),
    originalPrice:
      hasAvailablePrice(product) && product.discountPercent > 0
        ? product.priceCents / 100
        : undefined,
    discountPercent: hasAvailablePrice(product) ? product.discountPercent || undefined : undefined,
    isFree: hasAvailablePrice(product) && price === 0,
    platform: product.platforms as StoreGame["platform"],
    publisher: product.publisher ?? undefined,
    rating: product.rating ?? undefined,
    ratingsCount: product.ratingsCount,
    releaseDate: product.releaseDate ?? undefined,
    genres: product.genres.length > 0 ? product.genres : undefined,
    tagLine:
      firstText(product.shortDescription, product.tags.join(" / "), product.genres.join(" / ")) ||
      "Game",
  };
}

// ---------- Skeleton ----------

function CapsuleSkeleton() {
  return (
    <div className="w-[clamp(200px,14vw,240px)] flex-shrink-0 animate-pulse overflow-hidden border-2 border-black bg-[#f6edd8] shadow-[3px_3px_0_#171411]">
      <div className="aspect-[460/215] w-full border-b-2 border-black bg-[#d8cdbb]" />
      <div className="space-y-2 p-2">
        <div className="h-4 w-3/4 bg-[#d8cdbb]" />
        <div className="h-3 w-1/3 bg-[#d8cdbb]" />
      </div>
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div className="mb-8 h-[340px] animate-pulse border-4 border-black bg-[#d8cdbb] shadow-[6px_6px_0_#171411]" />
  );
}

// ---------- Capsule Card ----------

function CapsuleCard({
  game,
  isWishlisted,
  onClick,
  onToggleWishlist,
  onOpenStore,
}: {
  game: StoreGame;
  isWishlisted: boolean;
  onClick: (id: string) => void;
  onToggleWishlist: (id: string) => void;
  onOpenStore: (id: string) => void;
}) {
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
          {game.discountPercent ? (
            <span className="neo-copy absolute top-1 left-1 border-2 border-black bg-[#b7102a] px-1.5 py-0.5 text-[9px] font-black text-white">
              -{game.discountPercent}%
            </span>
          ) : null}
        </div>
        <div className="p-2">
          <div className="neo-title truncate text-sm leading-tight">{game.title}</div>
          {game.platform.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {game.platform.slice(0, 3).map((p) => (
                <span
                  key={p}
                  className="neo-copy border border-black bg-[#fff9ed] px-1 py-0.5 text-[7px] font-black uppercase"
                >
                  {p}
                </span>
              ))}
            </div>
          )}
          <div className="mt-1 flex items-center gap-2">
            {game.discountPercent ? (
              <span className="neo-copy text-[10px] font-black text-[#b7102a]">
                €{game.price.toFixed(2)}
              </span>
            ) : (
              <span className="neo-copy text-[10px] font-black">
                {game.isFree ? "Free" : `€${game.price.toFixed(2)}`}
              </span>
            )}
          </div>
        </div>
      </button>
      <div className="flex border-t-2 border-black">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleWishlist(game.id);
          }}
          className={`flex flex-1 items-center justify-center gap-1 border-r-2 border-black py-1.5 text-[9px] font-black uppercase transition-colors ${
            isWishlisted ? "bg-[#b7102a] text-white" : "bg-[#fff9ed] hover:bg-[#f6edd8]"
          }`}
        >
          <Heart size={10} className={isWishlisted ? "fill-current" : ""} />
          {isWishlisted ? "Saved" : "Wishlist"}
        </button>
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
      </div>
    </div>
  );
}

// ---------- Hero Banner ----------

function HeroBanner({
  game,
  onOpenStore,
  onViewDetails,
}: {
  game: StoreGame;
  onOpenStore: (id: string) => void;
  onViewDetails: (id: string) => void;
}) {
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
      <div className="absolute right-0 bottom-0 left-0 p-6">
        <div className="mb-2 flex gap-2">
          {game.isFree && (
            <span className="neo-copy inline-block border-2 border-black bg-[#8cf5e4] px-2 py-0.5 text-[10px] font-black text-[#171411] uppercase">
              Free to Play
            </span>
          )}
          {game.discountPercent ? (
            <span className="neo-copy inline-block border-2 border-black bg-[#b7102a] px-2 py-0.5 text-[10px] font-black text-white uppercase">
              -{game.discountPercent}% Sale
            </span>
          ) : null}
        </div>
        <h2 className="neo-title mb-1 text-3xl text-[#fff9ed]">{game.title}</h2>
        <p className="neo-copy mb-3 max-w-xl text-sm text-[#d8cdbb]">
          {game.tagLine || game.description}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onOpenStore(game.id)}
            className="neo-copy flex items-center gap-2 border-2 border-black bg-[#007166] px-5 py-2.5 text-[11px] font-black text-white uppercase shadow-[3px_3px_0_#171411]"
          >
            <ExternalLink size={14} /> Open Store
          </button>
          <button
            type="button"
            onClick={() => onViewDetails(game.id)}
            className="neo-copy border-2 border-black bg-[#f6edd8] px-5 py-2.5 text-[11px] font-black uppercase shadow-[3px_3px_0_#171411]"
          >
            More Info
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Horizontal Scroll Row ----------

function CapsuleRow({
  title,
  games,
  wishlistIds,
  onGameClick,
  onToggleWishlist,
  onOpenStore,
}: {
  title: string;
  games: StoreGame[];
  wishlistIds: Set<string>;
  onGameClick: (id: string) => void;
  onToggleWishlist: (id: string) => void;
  onOpenStore: (id: string) => void;
}) {
  if (games.length === 0) return null;
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between border-b-2 border-black pb-2">
        <h3 className="neo-title text-xl leading-none">{title}</h3>
        <span className="neo-copy cursor-pointer text-[10px] font-black text-[#b7102a] uppercase hover:underline">
          All <ChevronRight size={12} className="inline" />
        </span>
      </div>
      <div
        className="flex min-w-0 gap-4 overflow-x-auto pb-3"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#d8cdbb transparent" }}
      >
        {games.map((game) => (
          <CapsuleCard
            key={game.id}
            game={game}
            isWishlisted={wishlistIds.has(game.id)}
            onClick={onGameClick}
            onToggleWishlist={onToggleWishlist}
            onOpenStore={onOpenStore}
          />
        ))}
      </div>
    </section>
  );
}

// ---------- Star Rating ----------

function StarRating({
  value,
  onChange,
  size = 14,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
}) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <div className="flex gap-0.5" role="radiogroup" aria-label="Rating">
      {stars.map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
          onClick={onChange ? () => onChange(star) : undefined}
          className={`${onChange ? "cursor-pointer" : "cursor-default"} border-none bg-transparent p-0`}
        >
          <Star
            size={size}
            className={star <= value ? "fill-[#b7102a] text-[#b7102a]" : "text-[#5b403f]"}
          />
        </button>
      ))}
    </div>
  );
}

// ---------- Reviews Section ----------

function ReviewSection({
  productId,
  user,
  onStatus,
}: {
  productId: string;
  user: { id: string } | null;
  onStatus: (message: string, isError?: boolean) => void;
}) {
  const [reviews, setReviews] = useState<StoreReview[]>([]);
  const [myReview, setMyReview] = useState<StoreReview | null>(null);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([
      listStoreProductReviews(productId),
      user ? getMyStoreReview(productId) : Promise.resolve(null),
    ]).then(([reviewsResult, mineResult]) => {
      if (cancelled) return;
      if (reviewsResult.status === "fulfilled") setReviews(reviewsResult.value);
      if (mineResult.status === "fulfilled" && mineResult.value) {
        setMyReview(mineResult.value);
        setRating(mineResult.value.rating);
        setTitle(mineResult.value.title ?? "");
        setBody(mineResult.value.body ?? "");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [productId, user]);

  async function submit() {
    if (!user) {
      onStatus("Please sign in to write a review.", true);
      return;
    }
    if (rating < 1) {
      onStatus("Choose a star rating first.", true);
      return;
    }
    setIsSubmitting(true);
    try {
      const saved = await upsertStoreReview(productId, { rating, title, body });
      if (saved) {
        setMyReview(saved);
        setReviews((cur) => [saved, ...cur.filter((r) => r.id !== saved.id)]);
      }
      onStatus("Review saved.");
    } catch (err) {
      onStatus(err instanceof Error ? err.message : "The review could not be saved.", true);
    } finally {
      setIsSubmitting(false);
    }
  }

  const average =
    reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;

  return (
    <div className="border-t-2 border-black pt-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="neo-title text-lg">Reviews</h3>
        {average !== null && (
          <div className="neo-copy flex items-center gap-2 text-[10px] font-black uppercase">
            <span className="text-[#b7102a]">{average.toFixed(1)} / 5</span>
            <span className="text-[#5b403f]">({reviews.length})</span>
          </div>
        )}
      </div>

      {/* Write review */}
      <div className="mb-4 border-2 border-black bg-[#f6edd8] p-3">
        <div className="neo-copy mb-2 text-[10px] font-black uppercase">
          {myReview ? "Your review" : "Write a review"}
        </div>
        <div className="mb-2 flex items-center gap-3">
          <StarRating value={rating} onChange={setRating} />
        </div>
        <input
          className="neo-copy mb-2 w-full border-2 border-black bg-[#fff9ed] px-2 py-1.5 text-[11px] font-bold outline-none"
          placeholder="Review title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="neo-copy mb-2 min-h-[60px] w-full resize-y border-2 border-black bg-[#fff9ed] px-2 py-1.5 text-[11px] font-bold outline-none"
          placeholder="Share your experience..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={isSubmitting}
            className="neo-copy border-2 border-black bg-[#007166] px-4 py-1.5 text-[10px] font-black text-white uppercase"
          >
            {isSubmitting ? "Saving..." : "Save review"}
          </button>
        </div>
      </div>

      {/* Review list */}
      {reviews.length === 0 ? (
        <div className="neo-copy py-4 text-center text-[10px] font-black text-[#5b403f] uppercase">
          No reviews yet. Be the first!
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <div key={review.id} className="border-2 border-black bg-[#fff9ed] p-3">
              <div className="mb-1 flex items-center justify-between">
                <StarRating value={review.rating} size={12} />
                <span className="neo-copy text-[9px] font-bold text-[#5b403f] uppercase">
                  {new Date(review.createdAt).toLocaleDateString()}
                </span>
              </div>
              {review.title && <div className="neo-title mb-1 text-sm">{review.title}</div>}
              {review.body && <div className="neo-copy text-xs leading-relaxed">{review.body}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Store Detail Overlay ----------

function StoreDetailOverlay({
  game,
  product,
  isWishlisted,
  onClose,
  onToggleWishlist,
  onOpenStore,
  user,
  onStatus,
}: {
  game: StoreGame;
  product: StoreProduct;
  isWishlisted: boolean;
  onClose: () => void;
  onToggleWishlist: () => void;
  onOpenStore: () => void;
  user: { id: string } | null;
  onStatus: (message: string, isError?: boolean) => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#171411]/80 p-6"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${game.title} details`}
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border-4 border-black bg-[#fff9ed] shadow-[8px_8px_0_#171411]"
      >
        <div className="relative h-64 overflow-hidden border-b-2 border-black bg-[#d8cdbb]">
          {game.coverImageUrl ? (
            <img src={game.coverImageUrl} alt={game.title} className="h-full w-full object-cover" />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-[#fff9ed] via-transparent to-transparent" />
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center border-2 border-black bg-[#f6edd8] text-sm font-black shadow-[2px_2px_0_#171411]"
          >
            X
          </button>
        </div>
        <div className="space-y-4 p-5">
          <h2 className="neo-title text-2xl">{game.title}</h2>
          <div className="neo-copy flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-black text-[#5b403f] uppercase">
            {game.publisher && <span>{game.publisher}</span>}
            {game.releaseDate && <span>Released: {game.releaseDate}</span>}
            {game.rating && <span>Star {game.rating.toFixed(1)}</span>}
          </div>
          <div className="neo-copy text-sm leading-relaxed">{game.description}</div>
          {game.genres && game.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {game.genres.map((g) => (
                <span
                  key={g}
                  className="neo-copy border-2 border-black bg-[#f6edd8] px-2 py-0.5 text-[9px] font-black uppercase"
                >
                  {g}
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {game.platform.map((p) => (
              <span
                key={p}
                className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-0.5 text-[9px] font-black uppercase"
              >
                {p}
              </span>
            ))}
          </div>
          {product.shortDescription && (
            <div className="neo-copy text-xs text-[#5b403f]">{product.shortDescription}</div>
          )}
          <ReviewSection productId={product.id} user={user} onStatus={onStatus} />
        </div>
        <div className="flex items-center justify-between border-t-2 border-black bg-[#f6edd8] p-4">
          <div className="neo-title text-2xl">
            {game.originalPrice && game.originalPrice > game.price ? (
              <>
                <span className="neo-copy mr-2 text-sm text-[#5b403f] line-through">
                  €{game.originalPrice.toFixed(2)}
                </span>
                €{game.price.toFixed(2)}
              </>
            ) : game.isFree ? (
              "Free"
            ) : (
              `€${game.price.toFixed(2)}`
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onToggleWishlist}
              className={`neo-copy flex items-center gap-1.5 border-2 border-black px-4 py-2 text-[10px] font-black uppercase shadow-[2px_2px_0_#171411] ${
                isWishlisted ? "bg-[#b7102a] text-white" : "bg-[#fff9ed]"
              }`}
            >
              <Heart size={14} className={isWishlisted ? "fill-current" : ""} />
              {isWishlisted ? "In Wishlist" : "Wishlist"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="neo-copy border-2 border-black bg-[#f6edd8] px-4 py-2 text-[10px] font-black uppercase shadow-[2px_2px_0_#171411]"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onOpenStore}
              className="neo-copy flex items-center gap-1.5 border-2 border-black bg-[#007166] px-4 py-2 text-[10px] font-black text-white uppercase shadow-[2px_2px_0_#171411]"
            >
              <ExternalLink size={14} /> Open Store
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Filter Chip ----------

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="neo-copy flex items-center gap-1 border-2 border-black bg-[#f6edd8] px-2 py-1 text-[9px] font-black uppercase hover:bg-[#d8cdbb]"
    >
      {label} <X size={10} />
    </button>
  );
}

// ---------- Sidebar ----------

function StoreSidebar({
  activeGenre,
  onGenreChange,
  mobileOpen,
  onMobileClose,
}: {
  activeGenre: string | null;
  onGenreChange: (genre: string | null) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const linkClass = (active: boolean) =>
    `neo-copy w-full text-left text-[10px] font-black uppercase px-3 py-2 border-2 border-black transition-colors ${
      active ? "bg-[#007166] text-white" : "bg-[#f6edd8] hover:bg-[#d8cdbb]"
    }`;
  const content = (
    <aside className="w-[clamp(200px,14vw,240px)] flex-shrink-0 space-y-1">
      <div className="neo-title mb-2 px-3 text-sm">Browse</div>
      <button
        className={linkClass(!activeGenre)}
        onClick={() => {
          onGenreChange(null);
          onMobileClose();
        }}
      >
        All Games
      </button>
      <button
        className={linkClass(activeGenre === "topsellers")}
        onClick={() => {
          onGenreChange("topsellers");
          onMobileClose();
        }}
      >
        Top Sellers
      </button>
      <button
        className={linkClass(activeGenre === "newreleases")}
        onClick={() => {
          onGenreChange("newreleases");
          onMobileClose();
        }}
      >
        New Releases
      </button>
      <button
        className={linkClass(activeGenre === "specials")}
        onClick={() => {
          onGenreChange("specials");
          onMobileClose();
        }}
      >
        Specials
      </button>
      <div className="neo-title mt-4 mb-2 px-3 text-sm">Genres</div>
      {GENRES.map((g) => (
        <button
          key={g}
          className={linkClass(activeGenre === g.toLowerCase())}
          onClick={() => {
            onGenreChange(g.toLowerCase());
            onMobileClose();
          }}
        >
          {g}
        </button>
      ))}
    </aside>
  );
  return (
    <>
      <div className="hidden lg:block">{content}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-[#171411]/80 lg:hidden" onClick={onMobileClose}>
          <div
            className="absolute top-0 bottom-0 left-0 w-[240px] overflow-y-auto border-r-2 border-black bg-[#f5eedf] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="neo-title text-sm">Browse</div>
              <button
                type="button"
                onClick={onMobileClose}
                className="flex h-7 w-7 items-center justify-center border-2 border-black bg-[#f6edd8] text-xs font-black"
              >
                <X size={12} />
              </button>
            </div>
            {content}
          </div>
        </div>
      )}
    </>
  );
}

// ---------- Main Page ----------

export function StorePage() {
  const { user } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [catalogPage, setCatalogPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [platform, setPlatform] = useState(() => searchParams.get("platform") ?? "all");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("game"));
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [sortBy, setSortBy] = useState(() => searchParams.get("sort") ?? "relevance");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Pagination is button-driven; no auto-load on scroll.

  // derived data
  const gamesById = useMemo(
    () => new Map(products.map((p) => [p.id, mapProductToGame(p)])),
    [products],
  );
  const allGames = useMemo(
    () => products.map((p) => gamesById.get(p.id)!).filter(Boolean),
    [products, gamesById],
  );

  const heroGame = useMemo(() => {
    const sorted = [...allGames].sort((a, b) => (b.downloadsCount ?? 0) - (a.downloadsCount ?? 0));
    return sorted[0] ?? null;
  }, [allGames]);

  const topSellers = useMemo(() => {
    return [...allGames]
      .sort((a, b) => (b.downloadsCount ?? 0) - (a.downloadsCount ?? 0))
      .slice(0, 12);
  }, [allGames]);

  const topSellersIds = useMemo(() => new Set(topSellers.map((g) => g.id)), [topSellers]);

  const newReleases = useMemo(() => {
    return [...allGames]
      .filter((g) => g.releaseDate && !topSellersIds.has(g.id))
      .sort((a, b) => String(b.releaseDate ?? "").localeCompare(String(a.releaseDate ?? "")))
      .slice(0, 12);
  }, [allGames, topSellersIds]);

  const newReleasesIds = useMemo(() => new Set(newReleases.map((g) => g.id)), [newReleases]);

  const specials = useMemo(() => {
    return [...allGames]
      .filter(
        (g) =>
          g.discountPercent &&
          g.discountPercent > 0 &&
          !topSellersIds.has(g.id) &&
          !newReleasesIds.has(g.id),
      )
      .slice(0, 12);
  }, [allGames, topSellersIds, newReleasesIds]);

  const specialsIds = useMemo(() => new Set(specials.map((g) => g.id)), [specials]);

  // active filters for filter chips
  const activeFilters: { label: string; onRemove: () => void }[] = [];
  if (search.trim())
    activeFilters.push({ label: `Search: ${search.trim()}`, onRemove: () => setSearch("") });
  if (platform !== "all")
    activeFilters.push({ label: platform, onRemove: () => setPlatform("all") });
  if (priceFilter !== "all")
    activeFilters.push({
      label: priceFilter === "free" ? "Free" : "Discounts",
      onRemove: () => setPriceFilter("all"),
    });
  if (activeGenre)
    activeFilters.push({
      label: activeGenre.charAt(0).toUpperCase() + activeGenre.slice(1),
      onRemove: () => setActiveGenre(null),
    });
  const hasActiveFilters = activeFilters.length > 0;

  const visibleGames = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = allGames.filter((game) => {
      if (query) {
        const text = [
          game.title,
          game.description,
          game.publisher,
          ...game.platform,
          ...(game.genres ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!text.includes(query)) return false;
      }
      if (platform !== "all") {
        const norm = PLATFORM_QUERY_VALUE[platform] ?? platform;
        const matched = game.platform.some((p) => p.toLowerCase() === norm.toLowerCase());
        if (!matched) return false;
      }
      if (priceFilter === "free" && !game.isFree) return false;
      if (priceFilter === "discounts" && !game.discountPercent) return false;
      if (
        activeGenre &&
        activeGenre !== "topsellers" &&
        activeGenre !== "newreleases" &&
        activeGenre !== "specials"
      ) {
        const gl = (game.genres ?? []).map((g) => g.toLowerCase());
        if (!gl.includes(activeGenre)) return false;
      }
      return true;
    });
    if (sortBy === "price-low") filtered.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    else if (sortBy === "price-high") filtered.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    else if (sortBy === "release")
      filtered.sort((a, b) =>
        String(b.releaseDate ?? "").localeCompare(String(a.releaseDate ?? "")),
      );
    else if (sortBy === "name") filtered.sort((a, b) => a.title.localeCompare(b.title));
    else filtered.sort((a, b) => (b.downloadsCount ?? 0) - (a.downloadsCount ?? 0));
    return filtered;
  }, [allGames, search, platform, priceFilter, activeGenre, sortBy]);

  // data fetching
  const pageQuery = useMemo(
    () => ({
      search,
      platform,
      freeOnly: priceFilter === "free",
      discountsOnly: priceFilter === "discounts",
      sortBy: sortBy as "relevance" | "release" | "price-low" | "price-high" | "name",
      pageSize: PAGE_SIZE,
    }),
    [search, platform, priceFilter, sortBy],
  );

  const fetchPage = useCallback(
    async (page: number) => {
      const [hosted, catalog] = await Promise.allSettled([
        listPublishedProductsPage({ page, ...pageQuery }),
        listStoreCatalogPage({ page, ...pageQuery }),
      ]);
      const hostedP =
        hosted.status === "fulfilled"
          ? hosted.value.map(keepNonKeyshopPlatforms).filter((p): p is StoreProduct => p !== null)
          : [];
      const catalogP =
        catalog.status === "fulfilled"
          ? catalog.value.map(keepNonKeyshopPlatforms).filter((p): p is StoreProduct => p !== null)
          : [];
      return {
        products: [...hostedP, ...catalogP].filter(
          (p, i, a) => a.findIndex((x) => x.id === p.id) === i,
        ),
        hostedLen: hosted.status === "fulfilled" ? hosted.value.length : 0,
        catalogLen: catalog.status === "fulfilled" ? catalog.value.length : 0,
        bothRejected: hosted.status === "rejected" && catalog.status === "rejected",
      };
    },
    [pageQuery],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setErrorMessage(null);
      const { products: merged, hostedLen, catalogLen, bothRejected } = await fetchPage(0);
      if (cancelled) return;
      setProducts(merged.length > 0 ? merged : LOCAL_FALLBACK);
      setHasMore(hostedLen === PAGE_SIZE || catalogLen === PAGE_SIZE);
      setCatalogPage(0);
      setIsLoading(false);
      if (bothRejected) setErrorMessage("The store catalog could not be loaded.");
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [fetchPage, catalogRetry]);

  async function loadNextPage() {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    const next = catalogPage + 1;
    const { products: nextP, hostedLen, catalogLen, bothRejected } = await fetchPage(next);
    if (nextP.length > 0) {
      setProducts((cur) =>
        [...cur, ...nextP].filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i),
      );
      setCatalogPage(next);
      setHasMore(hostedLen === PAGE_SIZE || catalogLen === PAGE_SIZE);
    } else setHasMore(false);
    if (bothRejected) setErrorMessage("More games could not be loaded.");
    setIsLoadingMore(false);
  }

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setWishlistIds(new Set());
      return;
    }
    void listMyStoreWishlist()
      .then((items) => {
        if (!cancelled) setWishlistIds(new Set(items.map((i) => i.productId)));
      })
      .catch(() => {
        if (!cancelled) setWishlistIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function toggleWishlist(gameId: string) {
    const product = products.find((p) => p.id === gameId);
    if (product?.metadata.localExample === true) {
      setStatusMessage("Local preview games cannot be saved.");
      return;
    }
    if (!user) {
      setErrorMessage("Please sign in to save games.");
      return;
    }
    const isWishlisted = wishlistIds.has(gameId);
    setWishlistIds((cur) => {
      const n = new Set(cur);
      if (isWishlisted) n.delete(gameId);
      else n.add(gameId);
      return n;
    });
    try {
      if (isWishlisted) await removeFromStoreWishlist(gameId);
      else await addToStoreWishlist(gameId);
      setStatusMessage(isWishlisted ? "Removed from wishlist." : "Added to wishlist.");
    } catch (err) {
      setWishlistIds((cur) => {
        const n = new Set(cur);
        if (isWishlisted) n.add(gameId);
        else n.delete(gameId);
        return n;
      });
      setErrorMessage(err instanceof Error ? err.message : "The wishlist could not be saved.");
    }
  }

  async function openStores(gameIds: string[]) {
    if (gameIds.length === 0) return;
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const toOpen = gameIds
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is StoreProduct => Boolean(p));
      if (toOpen.length === 0) throw new Error("No platform game selected.");
      const openUrl = isTauri()
        ? openExternalUrl
        : (url: string) => window.open(url, "_blank", "noopener,noreferrer");
      const results = await Promise.allSettled(
        toOpen.map(async (p) => {
          const url = getPlatformPurchaseUrl(p);
          if (!url) throw new Error(`${p.title} does not have a platform store link yet.`);
          await openUrl(url);
        }),
      );
      const errors = results
        .filter((r) => r.status === "rejected")
        .map((r) => (r as PromiseRejectedResult).reason);
      if (errors.length > 0) throw new Error(errors.join("; "));
      setStatusMessage("The official platform store was opened.");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "The platform store could not be opened.",
      );
    }
  }

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setSearchParams(
      (cur) => {
        const n = new URLSearchParams(cur);
        n.set("game", id);
        return n;
      },
      { replace: true },
    );
  };

  const selectedProduct = selectedId ? (products.find((p) => p.id === selectedId) ?? null) : null;
  const selectedGame = selectedProduct ? mapProductToGame(selectedProduct) : null;

  return (
    <div className="min-h-screen bg-[#f5eedf]">
      {/* Top bar */}
      <div className="border-b-2 border-black bg-[#fff9ed] shadow-[0_3px_0_#171411]">
        <div className="flex items-center gap-4 px-5 py-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center border-2 border-black bg-[#f6edd8] lg:hidden"
          >
            <Menu size={14} />
          </button>
          <div className="neo-title text-xl leading-none text-[#b7102a]">STORE</div>
          <div className="relative max-w-[620px] min-w-[220px] flex-1">
            <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-[#5b403f]" />
            <input
              className="neo-copy w-full border-2 border-black bg-[#f6edd8] py-2 pr-8 pl-9 text-[11px] font-black uppercase outline-none"
              placeholder="Search the store"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer border-none bg-transparent text-[#5b403f]"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="neo-copy border-2 border-black bg-[#f6edd8] px-2 py-2 text-[10px] font-black uppercase outline-none"
          >
            <option value="relevance">Relevance</option>
            <option value="release">Release</option>
            <option value="price-low">Price: Low</option>
            <option value="price-high">Price: High</option>
            <option value="name">Name</option>
          </select>
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="neo-copy hidden items-center gap-1 border-2 border-black bg-[#f6edd8] px-3 py-2 text-[10px] font-black uppercase lg:flex"
          >
            <Filter size={12} /> Filters
          </button>
        </div>
      </div>

      {/* Messages */}
      {errorMessage && (
        <div
          className="flex items-center gap-3 border-b-2 border-black bg-[#f6edd8] px-5 py-2 text-[10px] font-black uppercase"
          role="alert"
        >
          <span className="text-[#b7102a]">{errorMessage}</span>
          <button
            onClick={() => {
              setErrorMessage(null);
              setCatalogRetry((t) => t + 1);
            }}
            className="border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[9px] font-black uppercase"
          >
            Retry
          </button>
        </div>
      )}
      {statusMessage && (
        <div
          className="border-b-2 border-black bg-[#8cf5e4] px-5 py-2 text-[10px] font-black uppercase"
          role="status"
        >
          {statusMessage}
        </div>
      )}

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 border-b-2 border-black bg-[#f6edd8] px-5 py-2">
          <span className="neo-copy text-[9px] font-black text-[#b7102a] uppercase">
            Active filters:
          </span>
          {activeFilters.map((f, i) => (
            <FilterChip key={i} label={f.label} onRemove={f.onRemove} />
          ))}
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setPlatform("all");
              setPriceFilter("all");
              setActiveGenre(null);
            }}
            className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[9px] font-black uppercase"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Main layout */}
      <div className="mx-auto flex w-full min-w-0 gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <StoreSidebar
          activeGenre={activeGenre}
          onGenreChange={setActiveGenre}
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
        />

        <div className="min-w-0 flex-1 overflow-hidden" role="region" aria-label="Product browser">
          {/* Hero */}
          {!isLoading && heroGame && !search && !activeGenre && !hasActiveFilters && (
            <HeroBanner
              game={heroGame}
              onOpenStore={(id) => void openStores([id])}
              onViewDetails={handleSelect}
            />
          )}

          {/* Platform pills */}
          <div className="mb-4 flex flex-wrap gap-1.5">
            {PLATFORM_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                className={`neo-copy border-2 border-black px-3 py-1.5 text-[9px] font-black uppercase transition-colors ${
                  platform === key ? "bg-[#007166] text-white" : "bg-[#fff9ed] hover:bg-[#f6edd8]"
                }`}
                onClick={() => setPlatform(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Price filter chips */}
          <div className="mb-5 flex flex-wrap gap-1.5">
            {(["all", "free", "discounts"] as const).map((f) => (
              <button
                key={f}
                className={`neo-copy border-2 border-black px-2 py-1 text-[9px] font-black uppercase transition-colors ${
                  priceFilter === f ? "bg-[#b7102a] text-white" : "bg-[#f6edd8] hover:bg-[#d8cdbb]"
                }`}
                onClick={() => setPriceFilter(f)}
              >
                {f === "all" ? "All Prices" : f === "free" ? "Free" : "Discounts"}
              </button>
            ))}
          </div>

          {isLoading ? (
            /* Skeleton loading */
            <div>
              <HeroSkeleton />
              <div className="mb-3 flex items-baseline justify-between border-b-2 border-black pb-2">
                <div className="h-6 w-32 animate-pulse bg-[#d8cdbb]" />
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <CapsuleSkeleton key={i} />
                ))}
              </div>
            </div>
          ) : allGames.length === 0 ? (
            <div className="neo-copy py-12 text-center text-[10px] font-black text-[#5b403f] uppercase">
              {search.trim() ? `No games match "${search.trim()}".` : "No games available."}
            </div>
          ) : search.trim() || activeGenre || hasActiveFilters ? (
            /* Search / genre / filter results */
            <>
              <div className="mb-4 flex items-baseline justify-between border-b-2 border-black pb-2">
                <h3 className="neo-title text-xl">
                  {search.trim()
                    ? `Results for "${search.trim()}"`
                    : activeGenre
                      ? activeGenre.charAt(0).toUpperCase() + activeGenre.slice(1)
                      : "Filtered Games"}
                </h3>
                <span className="neo-copy text-[10px] font-black uppercase">
                  {visibleGames.length} results
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                {visibleGames.map((game) => (
                  <CapsuleCard
                    key={game.id}
                    game={game}
                    isWishlisted={wishlistIds.has(game.id)}
                    onClick={handleSelect}
                    onToggleWishlist={toggleWishlist}
                    onOpenStore={(id) => void openStores([id])}
                  />
                ))}
              </div>
              {hasMore && (
                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => void loadNextPage()}
                    disabled={isLoadingMore}
                    className="neo-copy border-2 border-black bg-[#007166] px-6 py-2.5 text-[10px] font-black text-white uppercase shadow-[3px_3px_0_#171411]"
                  >
                    {isLoadingMore ? "Loading..." : "Next page"}
                  </button>
                </div>
              )}
            </>
          ) : (
            /* Home view */
            <>
              <CapsuleRow
                title="Top Sellers"
                games={topSellers}
                wishlistIds={wishlistIds}
                onGameClick={handleSelect}
                onToggleWishlist={toggleWishlist}
                onOpenStore={(id) => void openStores([id])}
              />
              {newReleases.length > 0 && (
                <CapsuleRow
                  title="New Releases"
                  games={newReleases}
                  wishlistIds={wishlistIds}
                  onGameClick={handleSelect}
                  onToggleWishlist={toggleWishlist}
                  onOpenStore={(id) => void openStores([id])}
                />
              )}
              {specials.length > 0 && (
                <CapsuleRow
                  title="Specials"
                  games={specials}
                  wishlistIds={wishlistIds}
                  onGameClick={handleSelect}
                  onToggleWishlist={toggleWishlist}
                  onOpenStore={(id) => void openStores([id])}
                />
              )}
              <CapsuleRow
                title="All Games"
                games={allGames.filter(
                  (g) =>
                    !topSellersIds.has(g.id) && !newReleasesIds.has(g.id) && !specialsIds.has(g.id),
                )}
                wishlistIds={wishlistIds}
                onGameClick={handleSelect}
                onToggleWishlist={toggleWishlist}
                onOpenStore={(id) => void openStores([id])}
              />
              {hasMore && (
                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => void loadNextPage()}
                    disabled={isLoadingMore}
                    className="neo-copy border-2 border-black bg-[#007166] px-6 py-2.5 text-[10px] font-black text-white uppercase shadow-[3px_3px_0_#171411]"
                  >
                    {isLoadingMore ? "Loading..." : "Next page"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Detail overlay */}
      {selectedGame && selectedProduct && (
        <StoreDetailOverlay
          game={selectedGame}
          product={selectedProduct}
          isWishlisted={wishlistIds.has(selectedGame.id)}
          onClose={() => {
            setSelectedId(null);
            setSearchParams(
              (cur) => {
                const n = new URLSearchParams(cur);
                n.delete("game");
                return n;
              },
              { replace: true },
            );
          }}
          onToggleWishlist={() => void toggleWishlist(selectedGame.id)}
          onOpenStore={() => void openStores([selectedGame.id])}
          user={user}
          onStatus={(message, isError) => {
            if (isError) setErrorMessage(message);
            else setStatusMessage(message);
          }}
        />
      )}
    </div>
  );
}
