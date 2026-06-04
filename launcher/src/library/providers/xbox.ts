import { installedXboxIds, ownedGameToGame } from "../../lib/library-providers";
import { STORAGE_KEYS } from "../../lib/storage-keys";
import type { Game } from "../../lib/types";
import type { MergeContext, ProviderResult } from "./types";

export async function mergeXboxOwned(
  games: Game[],
  context: MergeContext,
): Promise<ProviderResult> {
  void context;
  const warnings: string[] = [];
  const statusMessage: string | null = null;

  const xboxGamesStr = localStorage.getItem(STORAGE_KEYS.XBOX_GAMES_CACHE);
  if (!xboxGamesStr) {
    return { games, warnings, statusMessage };
  }

  try {
    const xboxRaw = JSON.parse(xboxGamesStr);
    if (!Array.isArray(xboxRaw) || xboxRaw.length === 0) {
      return { games, warnings, statusMessage };
    }

    const ownedXboxGames = xboxRaw.map(ownedGameToGame);
    const installed = installedXboxIds(games);
    const uninstalledOwned = ownedXboxGames.filter((og) => {
      const xboxId = og.id.replace("xbox-owned-", "");
      return !installed.has(xboxId) && !installed.has(og.title.toLowerCase());
    });

    return {
      games: [...games, ...uninstalledOwned],
      warnings,
      statusMessage,
    };
  } catch (err) {
    warnings.push(`Failed to load Xbox games from cache: ${err}`);
    return { games, warnings, statusMessage };
  }
}
