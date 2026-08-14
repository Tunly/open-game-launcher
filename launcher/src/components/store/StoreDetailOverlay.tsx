import { useEffect, useState } from "react";
import { Check, ExternalLink, Gamepad2, Heart, Monitor, Play, Star, X } from "lucide-react";

import type { Game, StoreGame } from "../../lib/types";
import type { StoreProduct, StoreReview } from "../../lib/types/store";
import {
  extractProductScreenshots,
  findMatchingLibraryGame,
  getAllPlatformPurchaseUrls,
} from "./storeHelpers";
import {
  getMyStoreReview,
  listStoreProductReviews,
  upsertStoreReview,
} from "../../lib/supabase/store";

interface StoreDetailOverlayProps {
  game: StoreGame;
  product: StoreProduct;
  isWishlisted: boolean;
  isInstalled?: boolean;
  installedGames?: Game[];
  user: { id: string } | null;
  onClose: () => void;
  onToggleWishlist: () => void;
  onOpenStoreUrl: (url: string) => void;
  onOpenInLibrary?: (libraryGameId: string) => void;
  onPlay?: (libraryGameId: string) => void;
  onStatus: (message: string, isError?: boolean) => void;
}

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
        <h3 className="neo-title text-lg text-[#171411]">Player Reviews</h3>
        {average !== null && (
          <div className="neo-copy flex items-center gap-2 text-[10px] font-black uppercase">
            <span className="text-[#b7102a]">{average.toFixed(1)} / 5</span>
            <span className="text-[#5b403f]">({reviews.length} reviews)</span>
          </div>
        )}
      </div>

      {/* Write review */}
      <div className="mb-4 border-2 border-black bg-[#f6edd8] p-3 shadow-[2px_2px_0_#000]">
        <div className="neo-copy mb-2 text-[10px] font-black text-[#171411] uppercase">
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
          placeholder="Share your experience with this game..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={isSubmitting}
            className="neo-copy border-2 border-black bg-[#007166] px-4 py-1.5 text-[10px] font-black text-white uppercase shadow-[2px_2px_0_#000] disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : "Save review"}
          </button>
        </div>
      </div>

      {/* Review list */}
      {reviews.length === 0 ? (
        <div className="neo-copy py-4 text-center text-[10px] font-black text-[#5b403f] uppercase">
          No reviews yet. Be the first to share your verdict!
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <div
              key={review.id}
              className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#000]"
            >
              <div className="mb-1 flex items-center justify-between">
                <StarRating value={review.rating} size={12} />
                <span className="neo-copy text-[9px] font-bold text-[#5b403f] uppercase">
                  {new Date(review.createdAt).toLocaleDateString()}
                </span>
              </div>
              {review.title && (
                <div className="neo-title mb-1 text-sm text-[#171411]">{review.title}</div>
              )}
              {review.body && (
                <div className="neo-copy text-xs leading-relaxed text-[#171411]">{review.body}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SystemRequirementsPanel({
  minReqs,
  recReqs,
}: {
  minReqs: Record<string, unknown>;
  recReqs: Record<string, unknown>;
}) {
  const hasMin = minReqs && Object.keys(minReqs).length > 0;
  const hasRec = recReqs && Object.keys(recReqs).length > 0;

  if (!hasMin && !hasRec) return null;

  const renderSpecs = (specs: Record<string, unknown>) => {
    return (
      <div className="space-y-1 text-xs">
        {Object.entries(specs).map(([key, val]) => (
          <div
            key={key}
            className="flex flex-col border-b border-black/20 pb-0.5 text-[11px] sm:flex-row sm:justify-between"
          >
            <span className="neo-copy font-black text-[#5b403f] uppercase">{key}:</span>
            <span className="neo-copy font-bold text-[#171411]">{String(val)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="border-t-2 border-black pt-4">
      <div className="mb-3 flex items-center gap-2">
        <Monitor size={14} className="text-[#007166]" />
        <h3 className="neo-title text-lg text-[#171411]">System Requirements</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {hasMin && (
          <div className="border-2 border-black bg-[#f6edd8] p-3 shadow-[2px_2px_0_#000]">
            <div className="neo-copy mb-2 text-[10px] font-black text-[#b7102a] uppercase">
              Minimum Requirements
            </div>
            {renderSpecs(minReqs)}
          </div>
        )}
        {hasRec && (
          <div className="border-2 border-black bg-[#f6edd8] p-3 shadow-[2px_2px_0_#000]">
            <div className="neo-copy mb-2 text-[10px] font-black text-[#007166] uppercase">
              Recommended Requirements
            </div>
            {renderSpecs(recReqs)}
          </div>
        )}
      </div>
    </div>
  );
}

export function StoreDetailOverlay({
  game,
  product,
  isWishlisted,
  isInstalled = false,
  installedGames = [],
  user,
  onClose,
  onToggleWishlist,
  onOpenStoreUrl,
  onOpenInLibrary,
  onPlay,
  onStatus,
}: StoreDetailOverlayProps) {
  const screenshots = extractProductScreenshots(product);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const platformLinks = getAllPlatformPurchaseUrls(product);
  const matchingLibraryGame = findMatchingLibraryGame(game, installedGames);
  const isInLibrary = matchingLibraryGame !== null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const activeImage = screenshots[selectedImageIndex] ?? game.coverImageUrl;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#171411]/80 p-4 sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${game.title} details`}
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto border-4 border-black bg-[#fff9ed] shadow-[8px_8px_0_#171411]"
      >
        {/* Header / Media Showcase */}
        <div className="relative border-b-2 border-black bg-[#171411]">
          <div className="relative aspect-[16/9] max-h-[360px] w-full overflow-hidden bg-[#24201b]">
            {activeImage ? (
              <img src={activeImage} alt={game.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-4xl font-black text-[#f6edd8]">
                {game.title}
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#fff9ed] via-transparent to-transparent" />

            {/* Badges on preview */}
            <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
              {isInLibrary && (
                <span className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#007166] px-2 py-0.5 text-[10px] font-black text-white uppercase shadow-[2px_2px_0_#000]">
                  <Check size={12} className="stroke-[3]" /> In Library
                </span>
              )}
              {game.discountPercent ? (
                <span className="neo-copy border-2 border-black bg-[#b7102a] px-2 py-0.5 text-[10px] font-black text-white uppercase shadow-[2px_2px_0_#000]">
                  -{game.discountPercent}% OFF
                </span>
              ) : null}
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center border-2 border-black bg-[#f6edd8] text-sm font-black shadow-[2px_2px_0_#171411] hover:bg-[#d8cdbb]"
              aria-label="Close dialog"
            >
              <X size={16} />
            </button>
          </div>

          {/* Screenshot Thumbnails Strip */}
          {screenshots.length > 1 && (
            <div className="flex gap-2 overflow-x-auto border-t-2 border-black bg-[#f6edd8] p-2">
              {screenshots.map((src, idx) => (
                <button
                  key={src + idx}
                  type="button"
                  onClick={() => setSelectedImageIndex(idx)}
                  className={`relative aspect-[16/9] h-12 flex-shrink-0 overflow-hidden border-2 transition-transform ${
                    selectedImageIndex === idx
                      ? "scale-105 border-[#b7102a] shadow-[2px_2px_0_#b7102a]"
                      : "border-black hover:opacity-80"
                  }`}
                >
                  <img
                    src={src}
                    alt={`Screenshot ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="neo-title text-2xl text-[#171411] sm:text-3xl">{game.title}</h2>
            <div className="neo-title text-xl sm:text-2xl">
              {game.originalPrice && game.originalPrice > game.price ? (
                <>
                  <span className="neo-copy mr-2 text-sm text-[#5b403f] line-through">
                    €{game.originalPrice.toFixed(2)}
                  </span>
                  <span className="text-[#b7102a]">€{game.price.toFixed(2)}</span>
                </>
              ) : game.isFree ? (
                <span className="text-[#007166]">Free</span>
              ) : (
                `€${game.price.toFixed(2)}`
              )}
            </div>
          </div>

          {/* Metadata chips */}
          <div className="neo-copy flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-black text-[#5b403f] uppercase">
            {game.publisher && <span>Publisher: {game.publisher}</span>}
            {game.releaseDate && <span>Released: {game.releaseDate}</span>}
            {game.rating && <span>Rating: ★ {game.rating.toFixed(1)}</span>}
          </div>

          {/* Description */}
          <div className="neo-copy text-sm leading-relaxed text-[#171411]">{game.description}</div>

          {/* Genres & Platforms */}
          <div className="space-y-2">
            {game.genres && game.genres.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="neo-copy text-[10px] font-black text-[#5b403f] uppercase">
                  Genres:
                </span>
                {game.genres.map((g) => (
                  <span
                    key={g}
                    className="neo-copy border-2 border-black bg-[#f6edd8] px-2 py-0.5 text-[9px] font-black text-[#171411] uppercase"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {game.platform.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="neo-copy text-[10px] font-black text-[#5b403f] uppercase">
                  Platforms:
                </span>
                {game.platform.map((p) => (
                  <span
                    key={p}
                    className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-0.5 text-[9px] font-black text-[#171411] uppercase"
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Multi-Store Platform Purchase Links */}
          <div className="border-2 border-black bg-[#f6edd8] p-3 shadow-[2px_2px_0_#000]">
            <div className="neo-copy mb-2 text-[10px] font-black text-[#171411] uppercase">
              Official Store Availability ({platformLinks.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {platformLinks.map((link) => (
                <button
                  key={link.platform + link.url}
                  type="button"
                  onClick={() => onOpenStoreUrl(link.url)}
                  className="neo-copy flex items-center gap-1.5 border-2 border-black bg-[#007166] px-3 py-1.5 text-[10px] font-black text-white uppercase shadow-[2px_2px_0_#000] hover:brightness-110"
                >
                  <ExternalLink size={12} /> {link.label}
                </button>
              ))}
            </div>
          </div>

          {/* System Requirements */}
          <SystemRequirementsPanel
            minReqs={product.minSystemRequirements}
            recReqs={product.recSystemRequirements}
          />

          {/* Reviews */}
          <ReviewSection productId={product.id} user={user} onStatus={onStatus} />
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-black bg-[#f6edd8] p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleWishlist}
              className={`neo-copy flex items-center gap-1.5 border-2 border-black px-4 py-2 text-[10px] font-black uppercase shadow-[2px_2px_0_#171411] transition-colors ${
                isWishlisted
                  ? "bg-[#b7102a] text-white"
                  : "bg-[#fff9ed] text-[#171411] hover:bg-[#f6edd8]"
              }`}
            >
              <Heart size={14} className={isWishlisted ? "fill-current" : ""} />
              {isWishlisted ? "In Wishlist" : "Add to Wishlist"}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="neo-copy border-2 border-black bg-[#f6edd8] px-4 py-2 text-[10px] font-black uppercase shadow-[2px_2px_0_#171411] hover:bg-[#d8cdbb]"
            >
              Close
            </button>
            {isInstalled && matchingLibraryGame && onPlay ? (
              <button
                type="button"
                onClick={() => onPlay(matchingLibraryGame.id)}
                className="neo-copy flex items-center gap-1.5 border-2 border-black bg-[#b7102a] px-4 py-2 text-[10px] font-black text-white uppercase shadow-[2px_2px_0_#171411] hover:brightness-110"
              >
                <Play size={14} /> Spielen
              </button>
            ) : isInLibrary && matchingLibraryGame && onOpenInLibrary ? (
              <button
                type="button"
                onClick={() => onOpenInLibrary(matchingLibraryGame.id)}
                className="neo-copy flex items-center gap-1.5 border-2 border-black bg-[#007166] px-4 py-2 text-[10px] font-black text-white uppercase shadow-[2px_2px_0_#171411] hover:brightness-110"
              >
                <Gamepad2 size={14} /> In Bibliothek öffnen
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (platformLinks[0]) onOpenStoreUrl(platformLinks[0].url);
                }}
                className="neo-copy flex items-center gap-1.5 border-2 border-black bg-[#007166] px-4 py-2 text-[10px] font-black text-white uppercase shadow-[2px_2px_0_#171411] hover:brightness-110"
              >
                <ExternalLink size={14} /> Open Main Store
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
