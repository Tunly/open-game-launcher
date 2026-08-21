import type { Game } from "./types";

/**
 * Resolve the Steam AppID for a game, if one is derivable.
 *
 * Order of preference:
 * 1. A numeric `externalId` on a Steam-launcher game.
 * 2. The numeric suffix of a `steam-owned-<appid>` or `steam-<appid>` id.
 * 3. A numeric AppID in a `steam://rungameid/<appid>` launch URI.
 *
 * This is the single source of truth for the rule; the achievement provider,
 * the Steam owned-games merger, and the artwork candidate builder all derive
 * AppIDs from it so the prefix list cannot drift between callers.
 */
export function resolveSteamAppId(game: Game): string | null {
  if (game.launcher === "steam" && game.externalId && /^\d+$/.test(game.externalId)) {
    return game.externalId;
  }

  for (const prefix of ["steam-owned-", "steam-"]) {
    if (game.id.startsWith(prefix)) {
      const appId = game.id.slice(prefix.length);
      if (/^\d+$/.test(appId)) {
        return appId;
      }
    }
  }

  const launchUriAppId = game.launchUri?.match(/^steam:\/\/rungameid\/(\d+)$/)?.[1];
  return launchUriAppId ?? null;
}
