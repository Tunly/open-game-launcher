import type { Game } from "./types";

export type CustomArtworkKind = "cover" | "icon" | "logo";

export interface GameCustomArtwork {
  coverUrl?: string;
  iconUrl?: string;
  logoUrl?: string;
  updatedAt?: number;
}

export type CustomArtworkMap = Record<string, GameCustomArtwork>;

function uniqueStrings(values: Array<string | undefined>): string[] {
  return values.filter(
    (value, index, allValues): value is string =>
      Boolean(value) && allValues.indexOf(value) === index,
  );
}

export function applyCustomArtwork(game: Game, artwork?: GameCustomArtwork): Game {
  if (!artwork?.coverUrl && !artwork?.iconUrl && !artwork?.logoUrl) {
    return game;
  }

  return {
    ...game,
    coverUrl: artwork.coverUrl ?? game.coverUrl,
    iconUrl: artwork.iconUrl ?? game.iconUrl,
    iconUrls: uniqueStrings([artwork.iconUrl, game.iconUrl, ...(game.iconUrls ?? [])]),
    logoUrl: artwork.logoUrl ?? game.logoUrl,
    logoUrls: uniqueStrings([artwork.logoUrl, game.logoUrl, ...(game.logoUrls ?? [])]),
  };
}

export function hasCustomArtwork(artwork?: GameCustomArtwork | null): boolean {
  return Boolean(artwork?.coverUrl || artwork?.iconUrl || artwork?.logoUrl);
}
