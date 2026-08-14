import type { Game, StoreGame } from "../../lib/types";
import type { StoreProduct } from "../../lib/types/store";
import { filterSupportedPlatforms, isKeyResellerName } from "../../lib/store-api";

export type PriceFilter = "all" | "free" | "under-10" | "under-20" | "discounts" | "big-discounts";

export const GENRES = [
  "Action",
  "Adventure",
  "Casual",
  "Indie",
  "Multiplayer",
  "Puzzle",
  "Racing",
  "RPG",
  "Simulation",
  "Sports",
  "Strategy",
] as const;

export const FEATURE_TAGS = ["Singleplayer", "Multiplayer", "Co-op", "PvP", "Controller"] as const;

export const PLATFORM_FILTERS: Array<{ key: string; label: string }> = [
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

export const PLATFORM_QUERY_VALUE: Record<string, string> = {
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

export interface PlatformStoreLink {
  platform: string;
  label: string;
  url: string;
}

export function keepNonKeyshopPlatforms(product: StoreProduct): StoreProduct | null {
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

export function firstText(...values: Array<string | null | undefined>) {
  return values.find((v) => typeof v === "string" && v.trim())?.trim() ?? "";
}

export function hasAvailablePrice(product: StoreProduct) {
  return product.metadata.priceUnavailable !== true;
}

export function effectivePrice(product: StoreProduct) {
  const price = product.priceCents / 100;
  return Math.round(price * Math.max(0, 100 - product.discountPercent)) / 100;
}

export function readMetadataUrl(value: unknown): string | null {
  return typeof value === "string" && /^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim())
    ? value.trim()
    : null;
}

export function isAllowedPlatformUrl(value: string): boolean {
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

export function formatPlatformDisplayName(platform: string): string {
  const norm = platform.toLowerCase();
  if (norm === "steam") return "Steam";
  if (norm === "gog") return "GOG";
  if (norm === "epic" || norm === "epic games") return "Epic Games";
  if (norm === "xbox") return "Xbox";
  if (norm === "ea") return "EA";
  if (norm === "ubisoft") return "Ubisoft";
  if (norm === "battlenet" || norm === "battle.net") return "Battle.net";
  if (norm === "windows") return "Microsoft Store";
  return platform.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getAllPlatformPurchaseUrls(product: StoreProduct): PlatformStoreLink[] {
  const metadata = product.metadata ?? {};
  const links: PlatformStoreLink[] = [];
  const addedUrls = new Set<string>();

  // Check structured metadata dictionaries
  const platformUrls =
    metadata.platformUrls ??
    metadata.storeUrls ??
    metadata.storeLinks ??
    metadata.platformLinks ??
    metadata.urls;

  if (platformUrls && typeof platformUrls === "object" && !Array.isArray(platformUrls)) {
    for (const [key, value] of Object.entries(platformUrls as Record<string, unknown>)) {
      const url = readMetadataUrl(value);
      if (url && isAllowedPlatformUrl(url) && !addedUrls.has(url)) {
        links.push({
          platform: key.toLowerCase(),
          label: formatPlatformDisplayName(key),
          url,
        });
        addedUrls.add(url);
      }
    }
  }

  // Check direct URL keys
  for (const key of ["purchaseUrl", "storeUrl", "platformUrl", "buyUrl"]) {
    const url = readMetadataUrl(metadata[key]);
    if (url && isAllowedPlatformUrl(url) && !addedUrls.has(url)) {
      let platKey = "store";
      if (url.includes("steampowered") || url.startsWith("steam:")) platKey = "steam";
      else if (url.includes("gog.com")) platKey = "gog";
      else if (url.includes("epicgames")) platKey = "epic games";
      else if (url.includes("xbox.com") || url.startsWith("ms-windows-store:")) platKey = "xbox";
      else if (url.includes("microsoft.com")) platKey = "windows";
      else if (url.includes("ea.com")) platKey = "ea";
      else if (url.includes("ubisoft.com")) platKey = "ubisoft";
      else if (url.includes("battle.net")) platKey = "battle.net";

      links.push({
        platform: platKey,
        label: formatPlatformDisplayName(platKey),
        url,
      });
      addedUrls.add(url);
    }
  }

  // Fallback generation for each listed platform if no explicit URL was provided
  const externalId = metadata.externalId ?? metadata.appId ?? metadata.storeId;
  const id =
    typeof externalId === "string" || typeof externalId === "number"
      ? encodeURIComponent(String(externalId))
      : null;
  const title = encodeURIComponent(product.title);

  for (const rawPlat of product.platforms) {
    const p = rawPlat.trim().toLowerCase();
    let genUrl = "";
    if (p === "steam") {
      genUrl = id ? `steam://store/${id}` : `https://store.steampowered.com/search/?term=${title}`;
    } else if (p === "epic" || p === "epic games") {
      genUrl = `https://store.epicgames.com/en-US/p/${encodeURIComponent(product.slug)}`;
    } else if (p === "gog") {
      genUrl = `https://www.gog.com/en/game/${encodeURIComponent(product.slug)}`;
    } else if (p === "xbox") {
      genUrl = id
        ? `ms-windows-store://pdp/?productid=${id}`
        : `https://www.xbox.com/en-US/search?q=${title}`;
    } else if (p === "ea") {
      genUrl = `https://www.ea.com/games/${encodeURIComponent(product.slug)}`;
    } else if (p === "ubisoft") {
      genUrl = `https://store.ubisoft.com/${encodeURIComponent(product.slug)}`;
    } else if (p === "battlenet" || p === "battle.net") {
      genUrl = `https://us.shop.battle.net/en-us/family/${encodeURIComponent(product.slug)}`;
    } else if (p === "windows") {
      genUrl = `https://apps.microsoft.com/search?query=${title}`;
    }

    if (genUrl && !addedUrls.has(genUrl)) {
      links.push({
        platform: p,
        label: formatPlatformDisplayName(p),
        url: genUrl,
      });
      addedUrls.add(genUrl);
    }
  }

  if (links.length === 0) {
    const defaultUrl = `https://store.steampowered.com/search/?term=${title}`;
    links.push({
      platform: "steam",
      label: "Steam",
      url: defaultUrl,
    });
  }

  return links;
}

export function getPlatformPurchaseUrl(product: StoreProduct): string {
  const links = getAllPlatformPurchaseUrls(product);
  return (
    links[0]?.url ??
    `https://store.steampowered.com/search/?term=${encodeURIComponent(product.title)}`
  );
}

export function mapExampleToStoreProduct(game: StoreGame): StoreProduct {
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
    status: "published",
    metadata: { platformLinks: { [p]: platformUrl }, localExample: true },
    createdAt: game.releaseDate ?? "2026-01-01T00:00:00.000Z",
    updatedAt: game.releaseDate ?? "2026-01-01T00:00:00.000Z",
  };
}

export function mapProductToGame(product: StoreProduct): StoreGame {
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

export function extractProductScreenshots(product: StoreProduct): string[] {
  const metadata = product.metadata ?? {};
  const candidates: string[] = [];

  const rawScreenshots =
    metadata.screenshots ?? metadata.screenshotUrls ?? metadata.images ?? metadata.gallery;

  if (Array.isArray(rawScreenshots)) {
    for (const item of rawScreenshots) {
      if (typeof item === "string" && item.trim()) {
        candidates.push(item.trim());
      } else if (item && typeof item === "object") {
        const url =
          (item as Record<string, unknown>).url ?? (item as Record<string, unknown>).path_full;
        if (typeof url === "string" && url.trim()) candidates.push(url.trim());
      }
    }
  }

  if (candidates.length === 0 && product.coverImageUrl) {
    candidates.push(product.coverImageUrl);
  }

  return candidates;
}

export function findMatchingLibraryGame(
  game: StoreGame | StoreProduct,
  installedGames: Game[],
): Game | null {
  if (!installedGames || installedGames.length === 0) return null;
  const gameTitleLower = game.title.trim().toLowerCase();
  const gameSlugLower = "slug" in game && game.slug ? game.slug.trim().toLowerCase() : "";
  const gameId = game.id;

  for (const installed of installedGames) {
    if (installed.id === gameId) return installed;
    const instTitle = installed.title.trim().toLowerCase();
    if (instTitle === gameTitleLower) return installed;
    // Check clean titles (without colon / subtitle if exact start match)
    if (
      gameTitleLower.length > 4 &&
      (instTitle.startsWith(gameTitleLower) || gameTitleLower.startsWith(instTitle))
    ) {
      return installed;
    }
    if (gameSlugLower && installed.id.toLowerCase().includes(gameSlugLower)) return installed;
  }
  return null;
}

export function isGameInLibrary(game: StoreGame | StoreProduct, installedGames: Game[]): boolean {
  return findMatchingLibraryGame(game, installedGames) !== null;
}
