import { fetchUbisoftOwnedGames } from "../../lib/launcher";
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
    const ownedUbiGames = ubiRaw.map(ownedGameToGame);
    if (ownedUbiGames.length === 0) {
      return { games, warnings, statusMessage };
    }

    const installed = installedUbiKeys(games);
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
      games: [...games, ...uninstalledOwned],
      warnings,
      statusMessage,
    };
  } catch (err) {
    warnings.push(`Failed to fetch owned Ubisoft games during load: ${err}`);
    return { games, warnings, statusMessage };
  }
}
