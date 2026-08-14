import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isTauri } from "@tauri-apps/api/core";

import { useCurrentUser } from "../hooks/useCurrentUser";
import {
  addToStoreWishlist,
  listMyStoreWishlist,
  removeFromStoreWishlist,
} from "../lib/supabase/store";
import { queryCatalogPage } from "../lib/supabase/catalog-query";
import { openExternalUrl } from "../lib/launcher/platform-auth";
import { listInstalledGames, launchGame } from "../lib/launcher";
import { EXAMPLE_STORE_CATALOG } from "../lib/store-example-catalog";
import type { Game } from "../lib/types";
import type { StoreProduct } from "../lib/types/store";

import {
  findMatchingLibraryGame,
  getPlatformPurchaseUrl,
  isGameInLibrary,
  mapExampleToStoreProduct,
  mapProductToGame,
  PLATFORM_QUERY_VALUE,
  type PriceFilter,
} from "../components/store/storeHelpers";
import { StoreHeroBanner } from "../components/store/StoreHeroBanner";
import { StoreCapsuleCard } from "../components/store/StoreCapsuleCard";
import { StoreCapsuleRow } from "../components/store/StoreCapsuleRow";
import { StoreSidebar } from "../components/store/StoreSidebar";
import { StoreFilterBar, StorePillFilters } from "../components/store/StoreFilterBar";
import { StoreDetailOverlay } from "../components/store/StoreDetailOverlay";

const LOCAL_FALLBACK = EXAMPLE_STORE_CATALOG.map(mapExampleToStoreProduct);
const PAGE_SIZE = 40;

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

export function StorePage() {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [installedGames, setInstalledGames] = useState<Game[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [catalogPage, setCatalogPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());

  // Filters & navigation state
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [platform, setPlatform] = useState(() => searchParams.get("platform") ?? "all");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeFeature, setActiveFeature] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("game"));
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [sortBy, setSortBy] = useState(() => searchParams.get("sort") ?? "relevance");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Load installed games from library to track ownership
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve(listInstalledGames())
      .then((games) => {
        if (!cancelled && Array.isArray(games)) setInstalledGames(games);
      })
      .catch(() => {
        if (!cancelled) setInstalledGames([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Derived games map & list
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

  // Active filter chips
  const activeFilters = useMemo(() => {
    const list: Array<{ label: string; onRemove: () => void }> = [];
    if (search.trim()) {
      list.push({ label: `Search: ${search.trim()}`, onRemove: () => setSearch("") });
    }
    if (platform !== "all") {
      list.push({ label: `Platform: ${platform}`, onRemove: () => setPlatform("all") });
    }
    if (priceFilter !== "all") {
      let pLabel = "Price filter";
      if (priceFilter === "free") pLabel = "Free";
      else if (priceFilter === "under-10") pLabel = "< 10 €";
      else if (priceFilter === "under-20") pLabel = "< 20 €";
      else if (priceFilter === "discounts") pLabel = "Discounts";
      else if (priceFilter === "big-discounts") pLabel = "Deals (-50%+)";
      list.push({ label: pLabel, onRemove: () => setPriceFilter("all") });
    }
    if (activeCategory) {
      const catLabel =
        activeCategory === "wishlist"
          ? "Wishlist"
          : activeCategory === "topsellers"
            ? "Top Sellers"
            : activeCategory === "newreleases"
              ? "New Releases"
              : activeCategory === "specials"
                ? "Specials & Deals"
                : activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1);
      list.push({ label: `Category: ${catLabel}`, onRemove: () => setActiveCategory(null) });
    }
    if (activeFeature) {
      list.push({
        label: `Feature: ${activeFeature.charAt(0).toUpperCase() + activeFeature.slice(1)}`,
        onRemove: () => setActiveFeature(null),
      });
    }
    return list;
  }, [search, platform, priceFilter, activeCategory, activeFeature]);

  const hasActiveFilters = activeFilters.length > 0;

  // Filtered games computation
  const visibleGames = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = allGames.filter((game) => {
      const product = products.find((p) => p.id === game.id);

      // Search query filter
      if (query) {
        const text = [
          game.title,
          game.description,
          game.publisher,
          ...game.platform,
          ...(game.genres ?? []),
          ...(product?.tags ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!text.includes(query)) return false;
      }

      // Platform filter
      if (platform !== "all") {
        const norm = PLATFORM_QUERY_VALUE[platform] ?? platform;
        const matched = game.platform.some((p) => p.toLowerCase() === norm.toLowerCase());
        if (!matched) return false;
      }

      // Price filter
      if (priceFilter === "free" && !game.isFree) return false;
      if (priceFilter === "under-10" && game.price > 10) return false;
      if (priceFilter === "under-20" && game.price > 20) return false;
      if (priceFilter === "discounts" && (!game.discountPercent || game.discountPercent <= 0))
        return false;
      if (priceFilter === "big-discounts" && (!game.discountPercent || game.discountPercent < 50))
        return false;

      // Wishlist category
      if (activeCategory === "wishlist" && !wishlistIds.has(game.id)) {
        return false;
      }

      // Genre category filter
      if (
        activeCategory &&
        activeCategory !== "wishlist" &&
        activeCategory !== "topsellers" &&
        activeCategory !== "newreleases" &&
        activeCategory !== "specials"
      ) {
        const gl = (game.genres ?? []).map((g) => g.toLowerCase());
        if (!gl.includes(activeCategory)) return false;
      }

      // Feature tag filter
      if (activeFeature) {
        const text = [
          game.tagLine,
          game.description,
          ...(game.genres ?? []),
          ...(product?.tags ?? []),
        ]
          .join(" ")
          .toLowerCase();
        if (!text.includes(activeFeature)) return false;
      }

      return true;
    });

    // Sorting
    if (sortBy === "price-low") filtered.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    else if (sortBy === "price-high") filtered.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    else if (sortBy === "release")
      filtered.sort((a, b) =>
        String(b.releaseDate ?? "").localeCompare(String(a.releaseDate ?? "")),
      );
    else if (sortBy === "name") filtered.sort((a, b) => a.title.localeCompare(b.title));
    else filtered.sort((a, b) => (b.downloadsCount ?? 0) - (a.downloadsCount ?? 0));

    return filtered;
  }, [
    allGames,
    products,
    search,
    platform,
    priceFilter,
    activeCategory,
    activeFeature,
    wishlistIds,
    sortBy,
  ]);

  // Data fetching
  const pageQuery = useMemo(
    () => ({
      search,
      platform,
      freeOnly: priceFilter === "free",
      discountsOnly: priceFilter === "discounts" || priceFilter === "big-discounts",
      sortBy:
        sortBy === "price-low" ||
        sortBy === "price-high" ||
        sortBy === "release" ||
        sortBy === "name"
          ? (sortBy as "price-low" | "price-high" | "release" | "name")
          : ("relevance" as const),
      pageSize: PAGE_SIZE,
    }),
    [search, platform, priceFilter, sortBy],
  );

  // Cross-batch dedup lives in queryCatalogPage; this Set accumulates the
  // ids already shown so a product in both sources is never duplicated.
  const seenProductIdsRef = useRef(new Set<string>());

  const fetchPage = useCallback(
    async (page: number) => {
      const { products, hostedCount, catalogCount, bothFailed } = await queryCatalogPage(
        { page, ...pageQuery },
        seenProductIdsRef.current,
      );
      return {
        products,
        hostedLen: hostedCount,
        catalogLen: catalogCount,
        bothRejected: bothFailed,
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
    } else {
      setHasMore(false);
    }
    if (bothRejected) setErrorMessage("More games could not be loaded.");
    setIsLoadingMore(false);
  }

  // Sync wishlist
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

  async function openSpecificUrl(url: string) {
    if (!url) return;
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const openUrl = isTauri()
        ? openExternalUrl
        : (u: string) => window.open(u, "_blank", "noopener,noreferrer");
      await openUrl(url);
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

  const openInLibrary = (libraryGameId: string) => {
    navigate(`/library?game=${encodeURIComponent(libraryGameId)}`);
  };

  const handlePlay = async (libraryGameId: string) => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await launchGame(libraryGameId);
      setStatusMessage("Launching your installed game.");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "The game could not be launched.");
    }
  };

  const selectedProduct = selectedId ? (products.find((p) => p.id === selectedId) ?? null) : null;
  const selectedGame = selectedProduct ? mapProductToGame(selectedProduct) : null;

  return (
    <div className="min-h-screen bg-[#f5eedf]">
      {/* Top Filter & Search Bar */}
      <StoreFilterBar
        search={search}
        sortBy={sortBy}
        activeFilters={activeFilters}
        onSearchChange={setSearch}
        onSortChange={setSortBy}
        onClearAllFilters={() => {
          setSearch("");
          setPlatform("all");
          setPriceFilter("all");
          setActiveCategory(null);
          setActiveFeature(null);
        }}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
      />

      {/* Messages */}
      {errorMessage && (
        <div
          className="flex items-center gap-3 border-b-2 border-black bg-[#f6edd8] px-5 py-2 text-[10px] font-black uppercase"
          role="alert"
        >
          <span className="text-[#b7102a]">{errorMessage}</span>
          <button
            type="button"
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

      {/* Main Layout Grid */}
      <div className="mx-auto flex w-full min-w-0 gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <StoreSidebar
          activeCategory={activeCategory}
          activeFeature={activeFeature}
          wishlistCount={wishlistIds.size}
          mobileOpen={sidebarOpen}
          onCategoryChange={setActiveCategory}
          onFeatureChange={setActiveFeature}
          onMobileClose={() => setSidebarOpen(false)}
        />

        <div className="min-w-0 flex-1 overflow-hidden" role="region" aria-label="Product browser">
          {/* Platform & Price Pills */}
          <StorePillFilters
            platform={platform}
            priceFilter={priceFilter}
            onPlatformChange={setPlatform}
            onPriceFilterChange={setPriceFilter}
          />

          {/* Hero Banner */}
          {!isLoading &&
            heroGame &&
            !search &&
            !activeCategory &&
            !activeFeature &&
            !hasActiveFilters && (
              <StoreHeroBanner
                game={heroGame}
                isInLibrary={isGameInLibrary(heroGame, installedGames)}
                isInstalled={
                  findMatchingLibraryGame(heroGame, installedGames)?.status === "installed"
                }
                libraryGameId={findMatchingLibraryGame(heroGame, installedGames)?.id ?? null}
                isWishlisted={wishlistIds.has(heroGame.id)}
                onOpenStore={(id) => void openStores([id])}
                onViewDetails={handleSelect}
                onToggleWishlist={toggleWishlist}
                onOpenInLibrary={openInLibrary}
                onPlay={handlePlay}
              />
            )}

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
          ) : search.trim() || activeCategory || activeFeature || hasActiveFilters ? (
            /* Search / Category / Feature results */
            <>
              <div className="mb-4 flex items-baseline justify-between border-b-2 border-black pb-2">
                <h3 className="neo-title text-xl text-[#171411]">
                  {search.trim()
                    ? `Results for "${search.trim()}"`
                    : activeCategory === "wishlist"
                      ? "Your Wishlist"
                      : activeCategory === "topsellers"
                        ? "Top Sellers"
                        : activeCategory === "newreleases"
                          ? "New Releases"
                          : activeCategory === "specials"
                            ? "Specials & Deals"
                            : activeCategory
                              ? activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1)
                              : activeFeature
                                ? `${activeFeature.charAt(0).toUpperCase() + activeFeature.slice(1)} Games`
                                : "Filtered Games"}
                </h3>
                <span className="neo-copy text-[10px] font-black text-[#5b403f] uppercase">
                  {visibleGames.length} results
                </span>
              </div>

              {visibleGames.length === 0 ? (
                <div className="neo-copy py-12 text-center text-[10px] font-black text-[#5b403f] uppercase">
                  {activeCategory === "wishlist"
                    ? "Your wishlist is empty. Browse the store to save your favorite games!"
                    : "No games match the selected filters."}
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {visibleGames.map((game) => {
                    const matchedLib = findMatchingLibraryGame(game, installedGames);
                    return (
                      <StoreCapsuleCard
                        key={game.id}
                        game={game}
                        isInLibrary={matchedLib !== null}
                        isInstalled={matchedLib?.status === "installed"}
                        libraryGameId={matchedLib?.id ?? null}
                        isWishlisted={wishlistIds.has(game.id)}
                        onClick={handleSelect}
                        onToggleWishlist={toggleWishlist}
                        onOpenStore={(id) => void openStores([id])}
                        onOpenInLibrary={openInLibrary}
                        onPlay={handlePlay}
                      />
                    );
                  })}
                </div>
              )}

              {hasMore && (
                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => void loadNextPage()}
                    disabled={isLoadingMore}
                    className="neo-copy border-2 border-black bg-[#007166] px-6 py-2.5 text-[10px] font-black text-white uppercase shadow-[3px_3px_0_#171411] hover:brightness-110 disabled:opacity-50"
                  >
                    {isLoadingMore ? "Loading..." : "Next page"}
                  </button>
                </div>
              )}
            </>
          ) : (
            /* Home Category Rows view */
            <>
              <StoreCapsuleRow
                title="Top Sellers"
                games={topSellers}
                wishlistIds={wishlistIds}
                installedGames={installedGames}
                onGameClick={handleSelect}
                onToggleWishlist={toggleWishlist}
                onOpenStore={(id) => void openStores([id])}
                onOpenInLibrary={openInLibrary}
                onPlay={handlePlay}
                onViewAll={() => setActiveCategory("topsellers")}
              />
              {newReleases.length > 0 && (
                <StoreCapsuleRow
                  title="New Releases"
                  games={newReleases}
                  wishlistIds={wishlistIds}
                  installedGames={installedGames}
                  onGameClick={handleSelect}
                  onToggleWishlist={toggleWishlist}
                  onOpenStore={(id) => void openStores([id])}
                  onOpenInLibrary={openInLibrary}
                  onPlay={handlePlay}
                  onViewAll={() => setActiveCategory("newreleases")}
                />
              )}
              {specials.length > 0 && (
                <StoreCapsuleRow
                  title="Specials & Deals"
                  games={specials}
                  wishlistIds={wishlistIds}
                  installedGames={installedGames}
                  onGameClick={handleSelect}
                  onToggleWishlist={toggleWishlist}
                  onOpenStore={(id) => void openStores([id])}
                  onOpenInLibrary={openInLibrary}
                  onPlay={handlePlay}
                  onViewAll={() => setActiveCategory("specials")}
                />
              )}
              <StoreCapsuleRow
                title="All Games"
                games={allGames.filter(
                  (g) =>
                    !topSellersIds.has(g.id) && !newReleasesIds.has(g.id) && !specialsIds.has(g.id),
                )}
                wishlistIds={wishlistIds}
                installedGames={installedGames}
                onGameClick={handleSelect}
                onToggleWishlist={toggleWishlist}
                onOpenStore={(id) => void openStores([id])}
                onOpenInLibrary={openInLibrary}
                onPlay={handlePlay}
              />
              {hasMore && (
                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => void loadNextPage()}
                    disabled={isLoadingMore}
                    className="neo-copy border-2 border-black bg-[#007166] px-6 py-2.5 text-[10px] font-black text-white uppercase shadow-[3px_3px_0_#171411] hover:brightness-110 disabled:opacity-50"
                  >
                    {isLoadingMore ? "Loading..." : "Next page"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Game Detail Overlay */}
      {selectedGame && selectedProduct && (
        <StoreDetailOverlay
          game={selectedGame}
          product={selectedProduct}
          isWishlisted={wishlistIds.has(selectedGame.id)}
          isInstalled={
            findMatchingLibraryGame(selectedGame, installedGames)?.status === "installed"
          }
          installedGames={installedGames}
          user={user}
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
          onOpenStoreUrl={(url) => void openSpecificUrl(url)}
          onOpenInLibrary={openInLibrary}
          onPlay={handlePlay}
          onStatus={(message, isError) => {
            if (isError) setErrorMessage(message);
            else setStatusMessage(message);
          }}
        />
      )}
    </div>
  );
}
