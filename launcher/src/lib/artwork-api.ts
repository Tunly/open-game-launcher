import type { Game } from "./types";

/** Real artwork API candidates, in provider/source priority order. */
export function getArtworkApiCandidates(
  game: Pick<Game, "title" | "launcher" | "externalId">,
): string[] {
  const title = game.title.trim();
  if (!title) return [];

  // The desktop detector already resolves RAWG through the Supabase rawg-assets
  // function for Battle.net, GOG, Xbox and other providers. Keep this helper
  // ready for the hydrated metadata fields and never invent a local image.
  const candidates: string[] = [];
  if (game.externalId) {
    candidates.push(
      `https://media.rawg.io/media/games/${encodeURIComponent(game.externalId)}/background.jpg`,
    );
  }
  return candidates;
}
