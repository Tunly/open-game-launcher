import { Heart, Sparkles, X } from "lucide-react";

import { FEATURE_TAGS, GENRES } from "./storeHelpers";

interface StoreSidebarProps {
  activeCategory: string | null;
  activeFeature: string | null;
  wishlistCount: number;
  mobileOpen: boolean;
  onCategoryChange: (category: string | null) => void;
  onFeatureChange: (feature: string | null) => void;
  onMobileClose: () => void;
}

export function StoreSidebar({
  activeCategory,
  activeFeature,
  wishlistCount,
  mobileOpen,
  onCategoryChange,
  onFeatureChange,
  onMobileClose,
}: StoreSidebarProps) {
  const linkClass = (active: boolean) =>
    `neo-copy w-full flex items-center justify-between text-left text-[10px] font-black uppercase px-3 py-2 border-2 border-black transition-colors ${
      active
        ? "bg-[#007166] text-white shadow-[2px_2px_0_#171411]"
        : "bg-[#f6edd8] text-[#171411] hover:bg-[#d8cdbb]"
    }`;

  const content = (
    <aside className="w-[clamp(200px,14vw,240px)] flex-shrink-0 space-y-1">
      {/* Wishlist Section */}
      <div className="neo-title mb-2 px-3 text-sm text-[#171411]">My Collection</div>
      <button
        aria-label="Filter by wishlist"
        className={linkClass(activeCategory === "wishlist")}
        onClick={() => {
          onCategoryChange(activeCategory === "wishlist" ? null : "wishlist");
          onMobileClose();
        }}
      >
        <span className="flex items-center gap-1.5">
          <Heart
            size={12}
            className={
              activeCategory === "wishlist" ? "fill-white" : "fill-[#b7102a] text-[#b7102a]"
            }
          />
          Wishlist
        </span>
        {wishlistCount > 0 && (
          <span
            className={`neo-copy py-0.2 border border-black px-1.5 text-[9px] font-black ${
              activeCategory === "wishlist"
                ? "bg-[#b7102a] text-white"
                : "bg-[#8cf5e4] text-[#171411]"
            }`}
          >
            {wishlistCount}
          </span>
        )}
      </button>

      {/* Browse Section */}
      <div className="neo-title mt-4 mb-2 px-3 text-sm text-[#171411]">Browse</div>
      <button
        className={linkClass(!activeCategory && !activeFeature)}
        onClick={() => {
          onCategoryChange(null);
          onFeatureChange(null);
          onMobileClose();
        }}
      >
        <span>All Games</span>
      </button>
      <button
        className={linkClass(activeCategory === "topsellers")}
        onClick={() => {
          onCategoryChange(activeCategory === "topsellers" ? null : "topsellers");
          onMobileClose();
        }}
      >
        <span>Top Sellers</span>
      </button>
      <button
        className={linkClass(activeCategory === "newreleases")}
        onClick={() => {
          onCategoryChange(activeCategory === "newreleases" ? null : "newreleases");
          onMobileClose();
        }}
      >
        <span>New Releases</span>
      </button>
      <button
        className={linkClass(activeCategory === "specials")}
        onClick={() => {
          onCategoryChange(activeCategory === "specials" ? null : "specials");
          onMobileClose();
        }}
      >
        <span className="flex items-center gap-1">
          <Sparkles
            size={11}
            className={activeCategory === "specials" ? "text-white" : "text-[#b7102a]"}
          />
          Specials & Deals
        </span>
      </button>

      {/* Genres Section */}
      <div className="neo-title mt-4 mb-2 px-3 text-sm text-[#171411]">Genres</div>
      {GENRES.map((g) => (
        <button
          key={g}
          className={linkClass(activeCategory === g.toLowerCase())}
          onClick={() => {
            onCategoryChange(activeCategory === g.toLowerCase() ? null : g.toLowerCase());
            onMobileClose();
          }}
        >
          <span>{g}</span>
        </button>
      ))}

      {/* Feature & Gameplay Tags */}
      <div className="neo-title mt-4 mb-2 px-3 text-sm text-[#171411]">Features</div>
      {FEATURE_TAGS.map((feat) => (
        <button
          key={feat}
          className={linkClass(activeFeature === feat.toLowerCase())}
          onClick={() => {
            onFeatureChange(activeFeature === feat.toLowerCase() ? null : feat.toLowerCase());
            onMobileClose();
          }}
        >
          <span>{feat}</span>
        </button>
      ))}
    </aside>
  );

  return (
    <>
      <div className="hidden lg:block">{content}</div>
      {mobileOpen && (
        <div
          role="presentation"
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-[#171411]/80 lg:hidden"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onMobileClose();
          }}
        >
          <div className="absolute top-0 bottom-0 left-0 w-[260px] overflow-y-auto border-r-2 border-black bg-[#f5eedf] p-4">
            <div className="mb-4 flex items-center justify-between border-b-2 border-black pb-2">
              <div className="neo-title text-sm text-[#171411]">Store Navigation</div>
              <button
                type="button"
                onClick={onMobileClose}
                className="flex h-7 w-7 items-center justify-center border-2 border-black bg-[#f6edd8] text-xs font-black shadow-[2px_2px_0_#171411]"
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
