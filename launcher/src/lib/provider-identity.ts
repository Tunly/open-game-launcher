import type { Game } from "./types";
import type { OwnedGame } from "./launcher";

/**
 * Provider-identity: every rule about how a provider's games are identified,
 * deduplicated, and launched. This is the single home for the id-prefix and
 * launch-uri knowledge that used to be spread across library-providers.ts,
 * the provider mergers, and useProviderPicking.
 */

/** The provider key for an installed game id (`steam-123`, `epic-owned-abc`, ...). */
export function providerOfGameId(game: Game): string {
  if (game.launcher && game.launcher !== "manual") return game.launcher;
  if (game.id.startsWith("steam-")) return "steam";
  if (game.id.startsWith("epic-")) return "epic";
  if (game.id.startsWith("gog-")) return "gog";
  if (game.id.startsWith("xbox-")) return "xbox";
  if (game.id.startsWith("ubisoft-")) return "ubisoft";
  if (game.id.startsWith("ea-")) return "ea";
  if (game.id.startsWith("battlenet-")) return "battlenet";
  if (game.id.startsWith("gamepass-")) return "gamepass";
  if (game.id.startsWith("ogl-")) return "ogl";
  return "manual";
}

/** The provider key for an owned-game id coming from a provider scrape. */
export function providerOfOwnedId(id: string): string {
  if (id.startsWith("steam-")) return "steam";
  if (id.startsWith("epic-")) return "epic";
  if (id.startsWith("gog-")) return "gog";
  if (id.startsWith("xbox-")) return "xbox";
  if (id.startsWith("ubisoft-")) return "ubisoft";
  if (id.startsWith("ea-")) return "ea";
  if (id.startsWith("battlenet-")) return "battlenet";
  return "manual";
}

/** Stable key used to deduplicate an owned game against installed games. */
export function ownedGameKey(og: OwnedGame): string {
  return og.id.replace(/^steam-owned-/, "steam-").replace(/^ea-owned-/, "ea-");
}

/** Launch uri for an owned game, when the provider defines one. */
export function launchUriForOwnedGame(og: OwnedGame): string | undefined {
  const gogLaunchId = og.externalId ?? og.id.replace(/^gog-owned-/, "");
  const eaLaunchId = og.externalId ?? og.id.replace(/^ea-owned-/, "");
  const steamLaunchId = og.externalId ?? og.id.replace(/^steam-owned-/, "");
  if (og.id.startsWith("steam-owned-") && /^\d+$/.test(steamLaunchId)) {
    return `steam://install/${steamLaunchId}`;
  }
  if (og.id.startsWith("gog-owned-") && gogLaunchId) {
    return `gogalaxy://openGameView/${gogLaunchId}`;
  }
  if (og.id.startsWith("ea-owned-") && eaLaunchId) {
    return `origin://launchgame/${eaLaunchId}`;
  }
  return undefined;
}

/** Does any installed game already represent this owned game? */
export function isAlreadyRepresented(games: Game[], og: OwnedGame): boolean {
  const key = ownedGameKey(og);
  return games.some((game) => game.id === key || game.id === og.id);
}

const XBOX_PACKAGE_FAMILY_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]*_[a-z0-9]{13}$/i;

/** Extract the Xbox package family name from a game id (`xbox-owned-` / `xbox-`). */
export function getXboxPackageFamilyName(gameId: string): string | null {
  let packageFamilyName: string | null = null;
  if (gameId.startsWith("xbox-owned-")) {
    packageFamilyName = gameId.slice("xbox-owned-".length);
  } else if (gameId.startsWith("xbox-")) {
    packageFamilyName = gameId.slice("xbox-".length);
  }

  return packageFamilyName && XBOX_PACKAGE_FAMILY_NAME_PATTERN.test(packageFamilyName)
    ? packageFamilyName
    : null;
}
