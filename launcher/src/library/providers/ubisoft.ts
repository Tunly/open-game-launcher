import { fetchUbisoftOwnedGames } from "../../lib/launcher";
import { isUbisoftDlcEntry } from "../../lib/library-filters-helpers";
import { installedUbiKeys, ownedGameToGame } from "../../lib/library-providers";
import type { Game } from "../../lib/types";
import type { MergeContext, ProviderResult } from "./types";

export async function mergeUbisoftOwned(
  games: Game[],
  context: MergeContext,
): Promise<ProviderResult> {
  void context;
  const warnings: string[] = [];
  const statusMessage: string | null = null;

  try {
    const ubiRaw = await fetchUbisoftOwnedGames();
    const ownedUbiGames = ubiRaw.map(ownedGameToGame).filter((game) => !isUbisoftDlcEntry(game));
    if (ownedUbiGames.length === 0) {
      return { games, warnings, statusMessage };
    }

    const enrichedGames = games.map((game) => {
      const installedKeys = installedUbiKeys([game]);
      if (installedKeys.size === 0) return game;

      const owned = ownedUbiGames.find((candidate) => {
        const numericId = candidate.externalId ?? candidate.id.replace(/^ubisoft-owned-/, "");
        return (
          installedKeys.has(candidate.id) ||
          installedKeys.has(candidate.title.toLowerCase()) ||
          installedKeys.has(numericId) ||
          installedKeys.has(`ubisoft-owned-${numericId}`)
        );
      });
      if (!owned) return game;

      const ownedIconUrls = uniqueArtworkUrls([...(owned.iconUrls ?? []), owned.iconUrl]);
      const ownedLogoUrls = uniqueArtworkUrls([...(owned.logoUrls ?? []), owned.logoUrl]);
      const coverUrl = game.coverUrl ?? owned.coverUrl;
      const iconUrl = game.iconUrl ?? owned.iconUrl;
      const logoUrl = game.logoUrl ?? owned.logoUrl;

      if (!coverUrl && !iconUrl && !logoUrl && !ownedIconUrls.length && !ownedLogoUrls.length) {
        return game;
      }

      return {
        ...game,
        coverUrl,
        iconUrl,
        iconUrls: uniqueArtworkUrls([...(game.iconUrls ?? []), ...ownedIconUrls]),
        logoUrl,
        logoUrls: uniqueArtworkUrls([...(game.logoUrls ?? []), ...ownedLogoUrls]),
      };
    });

    const installed = installedUbiKeys(enrichedGames);
    const uninstalledOwned = ownedUbiGames.filter((og) => {
      const ownedNumericId = og.externalId ?? og.id.replace(/^ubisoft-owned-/, "");
      if (installed.has(og.id) || installed.has(og.title.toLowerCase())) {
        return false;
      }
      if (installed.has(ownedNumericId) || installed.has(`ubisoft-owned-${ownedNumericId}`)) {
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
    warnings.push(`Failed to fetch owned Ubisoft games during load: ${err}`);
    return { games, warnings, statusMessage };
  }
}

function uniqueArtworkUrls(urls: Array<string | undefined>): string[] {
  return urls.filter(
    (url, index, candidates): url is string => Boolean(url) && candidates.indexOf(url) === index,
  );
}
