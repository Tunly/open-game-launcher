import { fetchEpicOwnedGames } from "../../lib/launcher";
import { installedEpicIds, ownedGameToGame } from "../../lib/library-providers";
import { STORAGE_KEYS } from "../../lib/storage-keys";
import type { Game } from "../../lib/types";
import type { MergeContext, ProviderResult } from "./types";

export async function mergeEpicOwned(
  games: Game[],
  context: MergeContext,
): Promise<ProviderResult> {
  void context;
  const warnings: string[] = [];
  const statusMessage: string | null = null;

  const epicTokenStr = localStorage.getItem(STORAGE_KEYS.EPIC_TOKEN);
  if (!epicTokenStr) {
    return { games, warnings, statusMessage };
  }

  try {
    const tokenObj = JSON.parse(epicTokenStr);
    if (!tokenObj || !tokenObj.accessToken) {
      return { games, warnings, statusMessage };
    }

    const ownedRaw = await fetchEpicOwnedGames();
    const ownedEpicGames = ownedRaw.map(ownedGameToGame);
    if (ownedEpicGames.length === 0) {
      return { games, warnings, statusMessage };
    }

    const installed = installedEpicIds(games);
    const uninstalledOwned = ownedEpicGames.filter((og) => {
      const epicParts = og.id.replace("epic-owned-", "").split(":");
      const catalogItemId = epicParts[1] || "";
      const appName = epicParts[2] || "";

      return (
        !installed.has(catalogItemId) &&
        !installed.has(appName) &&
        !installed.has(og.title.toLowerCase())
      );
    });

    return {
      games: [...games, ...uninstalledOwned],
      warnings,
      statusMessage,
    };
  } catch (err) {
    warnings.push(`Failed to fetch owned Epic games during load: ${err}`);
    return { games, warnings, statusMessage };
  }
}
