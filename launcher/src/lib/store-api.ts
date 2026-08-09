import type { StoreProduct } from "./types/store";

const KEY_RESELLER_MARKERS = [
  "g2a",
  "kinguin",
  "cdkeys",
  "gamivo",
  "eneba",
  "k4g",
  "hrk",
  "mmoga",
  "instant gaming",
  "driffle",
  "play-asia",
  "yuplay",
];

const SUPPORTED_PLATFORM_ALIASES: Record<string, string> = {
  "battle net": "Battle.net",
  "battle.net": "Battle.net",
  battlenet: "Battle.net",
  "ea app": "EA",
  ea: "EA",
  epic: "Epic Games",
  "epic games": "Epic Games",
  "epic games store": "Epic Games",
  gog: "GOG",
  linux: "Linux",
  mac: "macOS",
  macos: "macOS",
  "mac os": "macOS",
  microsoft: "Xbox",
  "microsoft store": "Xbox",
  origin: "EA",
  steam: "Steam",
  "steam store": "Steam",
  ubisoft: "Ubisoft",
  "ubisoft connect": "Ubisoft",
  xbox: "Xbox",
  "xbox one": "Xbox",
  "xbox series x|s": "Xbox",
  windows: "Windows",
};

export function isKeyResellerName(value: string) {
  const normalized = value.toLowerCase();
  return KEY_RESELLER_MARKERS.some((marker) => normalized.includes(marker));
}

export function normalizeSupportedPlatform(value: string) {
  const normalized = value.trim().toLowerCase().replaceAll("_", " ").replaceAll("-", " ");
  return SUPPORTED_PLATFORM_ALIASES[normalized] ?? null;
}

export function filterSupportedPlatforms(product: StoreProduct): StoreProduct | null {
  const platforms = Array.from(
    new Set(
      product.platforms
        .map(normalizeSupportedPlatform)
        .filter((platform): platform is string => platform !== null),
    ),
  );
  return platforms.length > 0 ? { ...product, platforms } : null;
}
