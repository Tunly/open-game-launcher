/**
 * Steam App ID lookup by normalized game title, used for artwork fallback.
 *
 * When a game from any provider (Xbox, GOG, Battle.net, etc.) has no
 * artwork, the matching Steam cover is shown instead. This table is DATA,
 * not logic: adding a title is a one-line edit, and the prefix-match
 * strategy lives in artwork-resolver.ts.
 */
export const STEAM_APP_IDS_BY_TITLE: Readonly<Record<string, string>> = {
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
export function normalizeArtworkTitle(title: string): string {
  return title.toLowerCase().replace(/[®™©]/g, "").replace(/\s+/g, " ").trim();
}
