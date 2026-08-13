import type { Game } from "./types";

/**
 * Maps game titles to Steam App IDs for artwork fallback.
 * Used when a game from any provider (Xbox, GOG, Battle.net, etc.)
 * has no artwork — we can still show the real Steam cover.
 */
const STEAM_APP_IDS_BY_TITLE: Record<string, string> = {
  "baba is you": "736260",
  "call of duty": "202970",
  "call of duty: black ops ii": "202970",
  "call of duty®": "202970",
  "dragon ball: sparking! zero": "1790600",
  "euro truck simulator 2": "227300",
  "garry's mod": "4000",
  "jotun: valhalla edition": "323580",
  "out there somewhere": "263980",
  palworld: "1623730",
  pikuniku: "572890",
  "portal 2": "620",
  "powerwash simulator 2": "2361680",
  rematch: "2138720",
  "steamworld dig": "252410",
  "tom clancy's rainbow six siege": "359550",
  "tom clancy's rainbow six siege x": "359550",
  "wallpaper engine": "431960",
};

/** Normalize a title for lookup: lowercase, strip ®™©, collapse whitespace. */
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[®™©]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Returns real Steam CDN artwork URLs for a game when its title is known,
 * regardless of the provider (Steam, Xbox, GOG, Battle.net, etc.).
 */
export function getKnownProviderArtworkCandidates(game: Pick<Game, "title">): string[] {
  const normalized = normalizeTitle(game.title);

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

  const base = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}`;
  return [`${base}/header.jpg`, `${base}/library_hero.jpg`, `${base}/capsule_616x353.jpg`];
}
