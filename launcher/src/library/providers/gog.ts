import { fetchGogOwnedGames, gogGetToken, gogRefreshToken } from "../../lib/launcher";
import { installedGogKeys, ownedGameToGame } from "../../lib/library-providers";
import { clearLegacyGogTokenCopy } from "../../lib/platform-token-storage";
import { STORAGE_KEYS } from "../../lib/storage-keys";
import type { Game } from "../../lib/types";
import type { MergeContext, ProviderResult } from "./types";

export async function mergeGogOwned(games: Game[], context: MergeContext): Promise<ProviderResult> {
  void context;
  const warnings: string[] = [];
  const statusMessage: string | null = null;

  try {
    const backendToken = await gogGetToken();
    const hasGogSession = Boolean(backendToken?.accessToken);

    if (!hasGogSession) {
      clearLegacyGogTokenCopy();
      return { games, warnings, statusMessage };
    }

    try {
      await gogRefreshToken();
      clearLegacyGogTokenCopy();
    } catch {
      // Token refresh failed, proceed with existing token
    }

    const ownedRaw = await fetchGogOwnedGames();
    localStorage.setItem(STORAGE_KEYS.GOG_OWNED_GAMES_CACHE, JSON.stringify(ownedRaw));
    const ownedGogGames = ownedRaw.map(ownedGameToGame);
    if (ownedGogGames.length === 0) {
      return { games, warnings, statusMessage };
    }

    const enrichedGames = games.map((game) => {
      const gameKeys = installedGogKeys([game]);
      if (gameKeys.size === 0) return game;
      const owned = ownedGogGames.find((candidate) => {
        const ownedId = candidate.externalId ?? candidate.id.replace(/^gog-owned-/, "");
        return (
          gameKeys.has(candidate.id) ||
          gameKeys.has(candidate.title.toLowerCase()) ||
          gameKeys.has(ownedId) ||
          gameKeys.has(`gog-owned-${ownedId}`)
        );
      });
      if (!owned) return game;

      const coverUrl = shouldReplaceGogArtwork(game.coverUrl) ? owned.coverUrl : game.coverUrl;
      const logoUrl = shouldReplaceGogArtwork(game.logoUrl) ? owned.logoUrl : game.logoUrl;
      const iconUrl = shouldReplaceGogArtwork(game.iconUrl) ? owned.iconUrl : game.iconUrl;
      if (coverUrl === game.coverUrl && logoUrl === game.logoUrl && iconUrl === game.iconUrl) {
        return game;
      }
      return {
        ...game,
        coverUrl,
        logoUrl,
        iconUrl,
        logoUrls: uniqueGogArtworkUrls([logoUrl, ...(game.logoUrls ?? [])]),
        iconUrls: uniqueGogArtworkUrls([iconUrl, ...(game.iconUrls ?? [])]),
      };
    });

    const installed = installedGogKeys(enrichedGames);
    const uninstalledOwned = ownedGogGames.filter((og) => {
      const ownedId = og.externalId ?? og.id.replace(/^gog-owned-/, "");
      if (installed.has(og.id) || installed.has(og.title.toLowerCase())) {
        return false;
      }
      if (installed.has(ownedId) || installed.has(`gog-owned-${ownedId}`)) {
        return false;
      }
      return true;
    });

    return {
      games: [...enrichedGames, ...uninstalledOwned],
      warnings,
      statusMessage,
    };
  } catch (err) {
    warnings.push(`Failed to fetch owned GOG games during load: ${err}`);
    return { games, warnings, statusMessage };
  }
}

function shouldReplaceGogArtwork(url?: string): boolean {
  return !url || /[\\/]ProgramData[\\/]GOG\.com[\\/]Galaxy[\\/]webcache[\\/]/i.test(url);
}

function uniqueGogArtworkUrls(urls: Array<string | undefined>): string[] {
  return urls.filter(
    (url, index, candidates): url is string => Boolean(url) && candidates.indexOf(url) === index,
  );
}
