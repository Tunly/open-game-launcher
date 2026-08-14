/**
 * Deep module: game artwork resolution.
 *
 * "Show a cover for this game" was previously answered by a chain of six
 * modules with duplicated steamstatic URL builders and a hand-maintained
 * title map. This module owns the whole ordered strategy in one place:
 *
 *   custom override -> provider metadata (IGDB) -> title-map Steam ->
 *   id-derived Steam -> placeholder
 *
 * Callers hand in the game and whatever sources they already have; the
 * resolution order and the URL construction are single-sourced here.
 */

import { applyCustomArtwork, type GameCustomArtwork } from "./custom-artwork";
import { applyIgdbArtwork, type IgdbAssetResponse } from "./supabase/igdb-artwork";
import type { Game } from "./types";
import { isSteamAppId, steamArtworkUrls } from "./steam-artwork-urls";
import { normalizeArtworkTitle, STEAM_APP_IDS_BY_TITLE } from "./artwork-title-map";

/** External artwork sources a caller can already have resolved. */
export interface ArtworkSources {
  /** User-chosen override artwork. */
  custom?: GameCustomArtwork;
  /** IGDB assets fetched for the game title. */
  igdb?: IgdbAssetResponse | null;
}

/** Id-derived Steam artwork candidates (header first), when the game is a Steam game. */
export function getSteamArtworkFallbacks(
  game: Pick<Game, "id" | "launcher" | "externalId">,
): string[] {
  if (game.launcher !== "steam" && !game.id.startsWith("steam-")) return [];

  const appId = game.externalId ?? game.id.match(/^steam-(?:owned-)?(\d+)$/)?.[1];
  if (!appId || !isSteamAppId(appId)) return [];

  const urls = steamArtworkUrls(appId);
  // header, library_hero, capsule_616x353, library_600x900, legacy header, legacy library_hero
  return [urls[0], urls[1], urls[2], urls[3], urls[6], urls[7]];
}

export function getSteamArtworkFallback(
  game: Pick<Game, "id" | "launcher" | "externalId">,
): string | undefined {
  return getSteamArtworkFallbacks(game)[0];
}

function remoteTextArtwork(title: string): string {
  return `https://placehold.co/600x338/171411/fffaf0.png?text=${encodeURIComponent(title || "Game")}`;
}

/**
 * Adds a real provider image when possible and a remote last-resort image
 * candidate. Preserves any existing artwork and appends candidates to the
 * icon/logo URL lists.
 */
export function applyArtworkFallback(game: Game): Game {
  const providerArtwork = getSteamArtworkFallback(game);
  const steamCandidates = getSteamArtworkFallbacks(game);
  const fallback = providerArtwork ?? remoteTextArtwork(game.title);
  const existingArtwork = [game.coverUrl, game.iconUrl, game.logoUrl].filter(Boolean) as string[];
  const iconUrls = [
    ...new Set([
      ...(game.iconUrl ? [game.iconUrl] : []),
      ...(game.iconUrls ?? []),
      ...steamCandidates,
      fallback,
    ]),
  ];
  const logoUrls = [
    ...new Set([
      ...(game.logoUrl ? [game.logoUrl] : []),
      ...(game.logoUrls ?? []),
      ...steamCandidates,
      fallback,
    ]),
  ];

  return {
    ...game,
    ...(existingArtwork.length === 0
      ? { coverUrl: fallback, iconUrl: fallback, logoUrl: fallback }
      : {}),
    iconUrls,
    logoUrls,
  };
}

/**
 * Title-map Steam artwork candidates for a game from any provider,
 * using the app id table (data) with exact-then-prefix lookup.
 */
export function getKnownProviderArtworkCandidates(game: Pick<Game, "title">): string[] {
  const normalized = normalizeArtworkTitle(game.title);

  // 1. Exact match first
  let appId = STEAM_APP_IDS_BY_TITLE[normalized];

  // 2. Prefix match: if "Call of Duty®" doesn't match exactly,
  //    try "call of duty" (the longest prefix that matches)
  if (!appId) {
    for (const [key, id] of Object.entries(STEAM_APP_IDS_BY_TITLE)) {
      if (normalized.startsWith(key) || key.startsWith(normalized)) {
        appId = id;
        break;
      }
    }
  }

  if (!appId) return [];

  const urls = steamArtworkUrls(appId);
  return [urls[0], urls[1], urls[2]];
}

/**
 * Resolve the final artwork for a game through the ordered strategy:
 * provider metadata (IGDB) -> title-map Steam -> custom override ->
 * id-derived Steam -> placeholder. The explicit user choice is applied
 * last so it always wins over auto-resolved sources. Pure: sources are
 * inputs, no fetching.
 */
export function resolveGameArtwork(game: Game, sources: ArtworkSources = {}): Game {
  let current = game;
  if (sources.igdb) {
    current = applyIgdbArtwork(current, sources.igdb);
  }

  const titleMapCandidates = getKnownProviderArtworkCandidates(current);
  if (titleMapCandidates.length > 0) {
    current = {
      ...current,
      coverUrl: current.coverUrl ?? titleMapCandidates[0],
      iconUrl: current.iconUrl ?? titleMapCandidates[0],
      logoUrl: current.logoUrl ?? titleMapCandidates[0],
      iconUrls: [...new Set([...(current.iconUrls ?? []), ...titleMapCandidates])],
      logoUrls: [...new Set([...(current.logoUrls ?? []), ...titleMapCandidates])],
    };
  }

  // User override last: it must beat everything auto-resolved above.
  if (sources.custom) {
    current = applyCustomArtwork(current, sources.custom);
  }

  return applyArtworkFallback(current);
}

/** Convenience re-export for callers building Steam candidate lists. */
export { steamArtworkUrl, steamArtworkUrls } from "./steam-artwork-urls";
