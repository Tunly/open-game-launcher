import { useEffect, useMemo, useState, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { Tag } from "lucide-react";

import { EmptyStorePanel } from "../components/store/EmptyStorePanel";
import { StoreProductRow } from "../components/store/StoreProductRow";

import { useCurrentUser } from "../hooks/useCurrentUser";
import {
  addToStoreWishlist,
  listMyStoreWishlist,
  listPublishedProducts,
  removeFromStoreWishlist,
} from "../lib/supabase/store";
import { openExternalUrl } from "../lib/launcher/platform-auth";
import { filterSupportedPlatforms, isKeyResellerName } from "../lib/store-api";
import { listStoreCatalog } from "../lib/supabase/store-catalog";
import { EXAMPLE_STORE_CATALOG } from "../lib/store-example-catalog";
import type { Platform, StoreGame } from "../lib/types";
import type { StoreProduct } from "../lib/types/store";

type PriceFilter = "all" | "free" | "under-15" | "discounts";

function isDesktopPlatform(value: string): value is Platform {
  return value === "windows" || value === "linux" || value === "macos";
}

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
  ].flatMap((value) =>
    value && typeof value === "object" && !Array.isArray(value) ? Object.values(value) : [],
  );
  const storeDetails = [
    product.publisher,
    product.shortDescription,
    ...metadataLinks,
    ...platformLinks,
  ].filter((value): value is string => typeof value === "string");
  if (storeDetails.some(isKeyResellerName)) return null;

  return filterSupportedPlatforms(product);
}

function platformLabel(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function firstText(...values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() ?? "";
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

function getPlatformPurchaseUrl(product: StoreProduct) {
  const metadata = product.metadata;
  const normalizedPlatforms = product.platforms.map((value) => value.trim().toLowerCase());
  const platform =
    normalizedPlatforms.find((value) =>
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
      ].includes(value),
    ) ?? normalizedPlatforms[0];
  const platformUrls =
    metadata.platformUrls ??
    metadata.storeUrls ??
    metadata.storeLinks ??
    metadata.platformLinks ??
    metadata.urls;
  if (platformUrls && typeof platformUrls === "object" && !Array.isArray(platformUrls)) {
    const entries = Object.entries(platformUrls as Record<string, unknown>);
    const platformUrl = readMetadataUrl(
      entries.find(([key]) => key.toLowerCase() === platform)?.[1],
    );
    if (platformUrl) return platformUrl;
  }

  for (const key of ["purchaseUrl", "storeUrl", "platformUrl", "buyUrl"]) {
    const url = readMetadataUrl(metadata[key]);
    if (url) return url;
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
  const platform = game.platform[0] ?? "windows";
  const query = encodeURIComponent(game.title);
  const platformUrl =
    platform === "windows"
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
    status: "published",
    metadata: { platformLinks: { [platform]: platformUrl }, localExample: true },
    createdAt: game.releaseDate ?? "2026-01-01T00:00:00.000Z",
    updatedAt: game.releaseDate ?? "2026-01-01T00:00:00.000Z",
  };
}

const LOCAL_FALLBACK_PRODUCTS = EXAMPLE_STORE_CATALOG.map(mapExampleToStoreProduct);

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
    platform: product.platforms.filter(isDesktopPlatform),
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

export function StorePage() {
  const { user } = useCurrentUser();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [catalogSource, setCatalogSource] = useState<"hosted" | "api" | "mixed" | "local">(
    "hosted",
  );
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("all");
  const [priceFilter] = useState<PriceFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [, setIsProcessing] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [visibleGameLimit, setVisibleGameLimit] = useState(40);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [hideFree, setHideFree] = useState(false);
  const [hideWishlist, setHideWishlist] = useState(false);
  const [sortBy, setSortBy] = useState("relevance");
  const [maxPrice, setMaxPrice] = useState(100);
  const [isFilterSidebarOpen, setIsFilterSidebarOpen] = useState(false);

  useEffect(() => {
    setVisibleGameLimit(40);
  }, [platform, priceFilter, search]);

  useEffect(() => {
    let cancelled = false;

    async function loadStore() {
      setIsLoading(true);
      setErrorMessage(null);
      const [hostedResult, catalogResult] = await Promise.allSettled([
        listPublishedProducts(),
        listStoreCatalog(),
      ]);
      const hostedProducts =
        hostedResult.status === "fulfilled"
          ? hostedResult.value
              .map(keepNonKeyshopPlatforms)
              .filter((product): product is StoreProduct => product !== null)
          : [];
      const catalogProducts =
        catalogResult.status === "fulfilled"
          ? catalogResult.value
              .map(keepNonKeyshopPlatforms)
              .filter((product): product is StoreProduct => product !== null)
          : [];

      if (cancelled) return;

      // Keep developer-published products first, but also show the materialized ITAD catalog.
      const mergedProducts = [...hostedProducts, ...catalogProducts].filter(
        (product, index, all) =>
          all.findIndex((candidate) => candidate.id === product.id) === index,
      );
      if (mergedProducts.length > 0) {
        setProducts(mergedProducts);
        setCatalogSource(
          hostedProducts.length > 0 && catalogProducts.length > 0
            ? "mixed"
            : hostedProducts.length > 0
              ? "hosted"
              : "api",
        );
      } else {
        setProducts(LOCAL_FALLBACK_PRODUCTS);
        setCatalogSource("local");
      }
      setIsLoading(false);
    }

    void loadStore();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setWishlistIds(new Set());
      return;
    }

    void listMyStoreWishlist()
      .then((items) => {
        if (!cancelled) setWishlistIds(new Set(items.map((item) => item.productId)));
      })
      .catch(() => {
        if (!cancelled) setWishlistIds(new Set());
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const gamesById = useMemo(
    () => new Map(products.map((product) => [product.id, mapProductToGame(product)])),
    [products],
  );
  const availablePlatforms = useMemo(
    () =>
      Array.from(new Set(products.flatMap((product) => product.platforms)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [products],
  );
  const visibleGames = useMemo(() => {
    const query = search.trim().toLowerCase();
    const sorted = products
      .filter((product) => {
        const game = gamesById.get(product.id);
        if (!game) return false;
        const text = [
          product.title,
          product.description,
          product.publisher,
          ...product.platforms,
          ...product.genres,
          ...product.tags,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const matchesSearch = !query || text.includes(query);
        const matchesTags =
          selectedTags.length === 0 || selectedTags.every((tag) => text.includes(tag));
        const matchesHideFree = !hideFree || !game.isFree;
        const matchesWishlist = !hideWishlist || !wishlistIds.has(product.id);
        const price = effectivePrice(product);
        const matchesPrice =
          priceFilter === "all" ||
          (hasAvailablePrice(product) && priceFilter === "free" && price === 0) ||
          (hasAvailablePrice(product) && priceFilter === "under-15" && price > 0 && price < 15) ||
          (hasAvailablePrice(product) &&
            priceFilter === "discounts" &&
            product.discountPercent > 0);
        const matchesPriceCap = !hasAvailablePrice(product) || price <= maxPrice;
        return (
          matchesSearch &&
          matchesTags &&
          matchesHideFree &&
          matchesWishlist &&
          matchesPriceCap &&
          (platform === "all" || product.platforms.includes(platform)) &&
          matchesPrice
        );
      })
      .map((product) => gamesById.get(product.id)!)
      .sort((a, b) => {
        if (sortBy === "price-low") return (a.price ?? 0) - (b.price ?? 0);
        if (sortBy === "price-high") return (b.price ?? 0) - (a.price ?? 0);
        if (sortBy === "release")
          return String(b.releaseDate ?? "").localeCompare(String(a.releaseDate ?? ""));
        if (sortBy === "name") return a.title.localeCompare(b.title);
        return (b.downloadsCount ?? 0) - (a.downloadsCount ?? 0);
      });
    return sorted;
  }, [
    gamesById,
    hideFree,
    hideWishlist,
    maxPrice,
    platform,
    priceFilter,
    products,
    search,
    selectedTags,
    sortBy,
    wishlistIds,
  ]);
  const paginatedGames = visibleGames.slice(0, visibleGameLimit);
  const hasMoreGames = paginatedGames.length < visibleGames.length;
  const featuredGames = visibleGames.slice(0, 5);
  async function toggleWishlist(gameId: string) {
    const product = products.find((item) => item.id === gameId);
    if (product?.metadata.localExample === true) {
      setStatusMessage("Lokale Vorschau-Spiele können nicht gespeichert werden.");
      return;
    }
    if (!user) {
      setErrorMessage("Bitte anmelden, um Spiele zu merken.");
      return;
    }

    const isWishlisted = wishlistIds.has(gameId);
    setWishlistIds((current) => {
      const next = new Set(current);
      if (isWishlisted) next.delete(gameId);
      else next.add(gameId);
      return next;
    });

    try {
      if (isWishlisted) await removeFromStoreWishlist(gameId);
      else await addToStoreWishlist(gameId);
    } catch (error) {
      setWishlistIds((current) => {
        const next = new Set(current);
        if (isWishlisted) next.add(gameId);
        else next.delete(gameId);
        return next;
      });
      setErrorMessage(
        error instanceof Error ? error.message : "Die Merkliste konnte nicht gespeichert werden.",
      );
    }
  }

  async function openPlatformStores(gameIds: string[]) {
    if (gameIds.length === 0) return;
    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const productsToOpen = gameIds
        .map((gameId) => products.find((product) => product.id === gameId))
        .filter((product): product is StoreProduct => Boolean(product));
      if (productsToOpen.length === 0) throw new Error("No platform game selected.");

      for (const product of productsToOpen) {
        const platformUrl = getPlatformPurchaseUrl(product);
        if (!platformUrl) {
          throw new Error(`${product.title} does not have a platform store link yet.`);
        }
        if (isTauri()) {
          await openExternalUrl(platformUrl);
        } else {
          window.open(platformUrl, "_blank", "noopener,noreferrer");
        }
      }
      setStatusMessage("The official platform store was opened. The purchase takes place there.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The platform store could not be opened.",
      );
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="min-h-[600px] space-y-6">
      {errorMessage ? (
        <div
          className="neo-copy border-2 border-black bg-[#f6edd8] p-3 text-[10px] font-black uppercase"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}
      {statusMessage ? (
        <div
          className="neo-copy border-2 border-black bg-[#8cf5e4] p-3 text-[10px] font-black uppercase"
          role="status"
        >
          {statusMessage}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b-2 border-black pb-3">
        <button
          className="neo-copy border-2 border-black bg-[#007166] px-3 py-2 text-[10px] font-black text-white uppercase"
          type="button"
          onClick={() => setPlatform("all")}
        >
          All platforms
        </button>
        {availablePlatforms.map((value) => (
          <button
            key={value}
            className={`neo-copy border-2 border-black px-3 py-2 text-[10px] font-black uppercase ${platform === value ? "bg-[#007166] text-white" : "bg-[#fff9ed]"}`}
            type="button"
            onClick={() => setPlatform(value)}
          >
            {platformLabel(value)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 border-b-2 border-black pb-3">
        <label className="neo-copy flex min-w-[240px] flex-1 items-center gap-2 border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase">
          <span className="text-[#b7102a]">⌕</span>
          <span className="sr-only">Search the store</span>
          <input
            className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
            placeholder="Search the store"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          aria-label="Sort by"
          className="neo-copy border-2 border-black bg-[#fff9ed] px-2 text-[10px] font-black uppercase"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value)}
        >
          <option value="relevance">Sort by relevance</option>
          <option value="release">Release date</option>
          <option value="price-low">Price: low to high</option>
          <option value="price-high">Price: high to low</option>
          <option value="name">Name</option>
        </select>
        <button
          className="neo-copy border-2 border-black bg-[#f6edd8] px-3 py-2 text-[10px] font-black uppercase lg:hidden"
          type="button"
          onClick={() => setIsFilterSidebarOpen((open) => !open)}
        >
          {isFilterSidebarOpen ? "Hide filters" : "Show filters"}
        </button>
      </div>

      <section aria-labelledby="featured-games-title" className="space-y-3">
        <div className="flex items-end justify-between border-b-2 border-black pb-2">
          <h2 id="featured-games-title" className="neo-title text-3xl leading-none">
            Featured games
          </h2>
          <span className="neo-copy text-[10px] font-black uppercase">Top picks</span>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          {featuredGames.map((game, index) => {
            const product = products.find((item) => item.id === game.id)!;
            return (
              <button
                key={game.id}
                aria-label={`View featured game ${game.title}`}
                className={`group relative overflow-hidden border-[3px] border-black bg-[#171411] text-left shadow-[4px_4px_0_#171411] ${index === 0 ? "md:row-span-2 md:min-h-[270px]" : "min-h-[128px]"}`}
                type="button"
                onClick={() => openPlatformStores([game.id])}
              >
                {game.coverImageUrl ? (
                  <img
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    src={game.coverImageUrl}
                  />
                ) : null}
                <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_25%,rgba(23,20,17,0.95)_100%)]" />
                <span className="absolute inset-x-0 bottom-0 p-3">
                  <span className="neo-copy block text-[8px] font-black tracking-[0.12em] text-[#8cf5e4] uppercase">
                    {product.platforms[0] ?? "Platform"}
                  </span>
                  <span className="neo-title mt-1 block text-xl leading-none text-[#fff9ed]">
                    {game.title}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section
        className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_250px]"
        aria-label="Product browser"
      >
        <div>
          <div className="mb-4 flex items-end justify-between border-b-2 border-black pb-2">
            <h2 id="store-games-title" className="neo-title text-3xl leading-none">
              All games
            </h2>
            <span className="neo-copy text-[10px] font-black uppercase">
              {visibleGames.length} results
            </span>
          </div>
          {isLoading ? (
            <EmptyStorePanel label="Loading store catalog." />
          ) : visibleGames.length > 0 ? (
            <div className="space-y-3">
              {paginatedGames.map((game) => {
                const product = products.find((item) => item.id === game.id)!;
                return (
                  <StoreProductRow
                    key={game.id}
                    game={game}
                    platforms={product.platforms}
                    isWishlisted={wishlistIds.has(game.id)}
                    onOpenStore={(gameId) => void openPlatformStores([gameId])}
                    onToggleWishlist={(gameId) => void toggleWishlist(gameId)}
                    onViewDetails={() => undefined}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyStorePanel label="No published games match your filters." />
          )}
          {hasMoreGames ? (
            <button
              className="neo-copy mt-4 w-full border-2 border-black bg-[#8cf5e4] px-4 py-3 text-[10px] font-black uppercase"
              type="button"
              onClick={() => setVisibleGameLimit((current) => current + 40)}
            >
              Load more games ({visibleGames.length - paginatedGames.length})
            </button>
          ) : null}
        </div>
        <StoreFilterSidebar
          className={isFilterSidebarOpen ? "block" : "hidden lg:block"}
          hideFree={hideFree}
          hideWishlist={hideWishlist}
          selectedTags={selectedTags}
          onHideFreeChange={setHideFree}
          onHideWishlistChange={setHideWishlist}
          onTagsChange={setSelectedTags}
          maxPrice={maxPrice}
          onMaxPriceChange={setMaxPrice}
        />
      </section>

      <div className="neo-copy flex items-center gap-2 border-2 border-black bg-[#f6edd8] p-3 text-[9px] font-black uppercase">
        <Tag className="h-4 w-4 text-[#b7102a]" />{" "}
        {catalogSource === "local"
          ? "Local example catalog: Open store opens the matching platform store."
          : catalogSource === "mixed" || catalogSource === "api"
            ? "Live games from the store catalog: Open store opens the official platform store."
            : "Open store opens the configured store link for the relevant platform."}
      </div>
    </div>
  );
}

function StoreFilterSidebar({
  className = "",
  hideFree,
  hideWishlist,
  selectedTags,
  onHideFreeChange,
  onHideWishlistChange,
  onTagsChange,
  maxPrice,
  onMaxPriceChange,
}: {
  className?: string;
  hideFree: boolean;
  hideWishlist: boolean;
  selectedTags: string[];
  onHideFreeChange: (value: boolean) => void;
  onHideWishlistChange: (value: boolean) => void;
  onTagsChange: (value: string[]) => void;
  maxPrice: number;
  onMaxPriceChange: (value: number) => void;
}) {
  const tags = ["singleplayer", "indie", "action", "casual", "adventure"];
  const toggleTag = (tag: string) =>
    onTagsChange(
      selectedTags.includes(tag)
        ? selectedTags.filter((value) => value !== tag)
        : [...selectedTags, tag],
    );
  return (
    <aside
      className={`${className} space-y-3 lg:sticky lg:top-4 lg:self-start`}
      aria-label="Store filters sidebar"
    >
      <FilterPanel title="Narrow by price">
        <input
          aria-label="Maximum price"
          className="w-full accent-[#b7102a]"
          type="range"
          min="0"
          max="100"
          value={maxPrice}
          onChange={(event) => onMaxPriceChange(Number(event.target.value))}
        />
        <p className="neo-copy text-[10px] font-black uppercase">
          {maxPrice >= 100 ? "Any price" : `Up to €${maxPrice}`}
        </p>
        <FilterCheck label="Discounts & events" />
        <FilterCheck
          label="Hide free to play items"
          checked={hideFree}
          onChange={onHideFreeChange}
        />
      </FilterPanel>
      <FilterPanel title="Narrow by preferences">
        <FilterCheck label="Hide ignored items" checked />
        <FilterCheck label="Hide items in my library" />
        <FilterCheck
          label="Hide items on my wishlist"
          checked={hideWishlist}
          onChange={onHideWishlistChange}
        />
      </FilterPanel>
      <FilterPanel title="Narrow by tag">
        {tags.map((tag) => (
          <FilterCheck
            key={tag}
            label={tag}
            checked={selectedTags.includes(tag)}
            onChange={() => toggleTag(tag)}
          />
        ))}
        <input
          className="neo-copy w-full border-2 border-black bg-[#fff9ed] px-2 py-2 text-[9px] uppercase"
          placeholder="Search for more tags"
        />
      </FilterPanel>
      {[
        "Show selected types",
        "Narrow by number of players",
        "Narrow by feature",
        "Narrow by controller support",
        "Narrow by accessibility",
        "Narrow by Deck Compatibility",
        "Narrow by VR support",
        "Narrow by OS",
        "Narrow by language",
      ].map((title) => (
        <FilterPanel key={title} title={title} collapsed />
      ))}
    </aside>
  );
}

function FilterPanel({
  title,
  collapsed = false,
  children,
}: {
  title: string;
  collapsed?: boolean;
  children?: ReactNode;
}) {
  return (
    <details
      className="border-2 border-black bg-[#f6edd8] shadow-[3px_3px_0_#171411]"
      open={!collapsed}
    >
      <summary className="neo-copy cursor-pointer list-none bg-[#171411] px-3 py-2 text-[10px] font-black text-[#fff9ed] uppercase">
        {title}
      </summary>
      {children ? <div className="space-y-2 p-3">{children}</div> : null}
    </details>
  );
}

function FilterCheck({
  label,
  checked = false,
  onChange,
}: {
  label: string;
  checked?: boolean;
  onChange?: (value: boolean) => void;
}) {
  return (
    <label className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase">
      <input
        checked={checked}
        className="accent-[#b7102a]"
        type="checkbox"
        onChange={(event) => onChange?.(event.target.checked)}
      />
      {label}
    </label>
  );
}
