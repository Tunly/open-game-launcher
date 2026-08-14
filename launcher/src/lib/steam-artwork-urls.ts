/**
 * Single source of truth for Steam CDN artwork URL construction.
 *
 * Every Steam artwork fallback in the app (library fallbacks, provider
 * title-map candidates, custom-artwork candidate picker) used to build the
 * same URL templates by hand. This leaf module owns the templates so a CDN
 * or size change is one edit, not five.
 */

export type SteamArtworkKind =
  "header" | "libraryHero" | "capsule616" | "capsule600x900" | "capsule184" | "logo";

const STEAM_ARTWORK_FILES: Record<SteamArtworkKind, string> = {
  header: "header.jpg",
  libraryHero: "library_hero.jpg",
  capsule616: "capsule_616x353.jpg",
  capsule600x900: "library_600x900.jpg",
  capsule184: "capsule_184x69.jpg",
  logo: "logo.png",
};

/** Build one artwork URL on the primary shared CDN. */
export function steamArtworkUrl(appId: string, kind: SteamArtworkKind): string {
  return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/${STEAM_ARTWORK_FILES[kind]}`;
}

/**
 * All Steam artwork candidates for an app id, in canonical order:
 * header, library hero, 616x353 capsule, 600x900 capsule, 184x69 capsule,
 * logo, then the legacy CDN header/library hero.
 *
 * Consumers slice the list for their own priority order; the first entry is
 * always the header image.
 */
export function steamArtworkUrls(appId: string): string[] {
  const legacy = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}`;
  return [
    steamArtworkUrl(appId, "header"),
    steamArtworkUrl(appId, "libraryHero"),
    steamArtworkUrl(appId, "capsule616"),
    steamArtworkUrl(appId, "capsule600x900"),
    steamArtworkUrl(appId, "capsule184"),
    steamArtworkUrl(appId, "logo"),
    `${legacy}/header.jpg`,
    `${legacy}/library_hero.jpg`,
  ];
}

/** True for ids that look like numeric Steam app ids. */
export function isSteamAppId(value: string): boolean {
  return /^\d{1,10}$/.test(value);
}
