import type { Game } from "./types";

export function getSteamArtworkFallbacks(
  game: Pick<Game, "id" | "launcher" | "externalId">,
): string[] {
  if (game.launcher !== "steam" && !game.id.startsWith("steam-")) return [];

  const appId = game.externalId ?? game.id.match(/^steam-(?:owned-)?(\d+)$/)?.[1];
  if (!appId || !/^\d{1,10}$/.test(appId)) return [];

  const base = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}`;
  return [
    `${base}/header.jpg`,
    `${base}/library_hero.jpg`,
    `${base}/capsule_616x353.jpg`,
    `${base}/library_600x900.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`,
  ];
}

export function getSteamArtworkFallback(
  game: Pick<Game, "id" | "launcher" | "externalId">,
): string | undefined {
  return getSteamArtworkFallbacks(game)[0];
}

function remoteTextArtwork(title: string): string {
  return `https://placehold.co/600x338/171411/fffaf0.png?text=${encodeURIComponent(title || "Game")}`;
}

/** Adds a real provider image when possible and a remote last-resort image candidate. */
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
