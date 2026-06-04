import { ownedGameToGame } from "../../lib/library-providers";
import { STORAGE_KEYS } from "../../lib/storage-keys";
import type { Game } from "../../lib/types";
import type { MergeContext, ProviderResult } from "./types";

export async function mergeGamePassOwned(
  games: Game[],
  context: MergeContext,
): Promise<ProviderResult> {
  void context;
  const warnings: string[] = [];
  const statusMessage: string | null = null;

  const gamePassGamesStr = localStorage.getItem(STORAGE_KEYS.GAME_PASS_CATALOG_CACHE);
  if (!gamePassGamesStr) {
    return { games, warnings, statusMessage };
  }

  try {
    const gamePassRaw = JSON.parse(gamePassGamesStr);
    if (!Array.isArray(gamePassRaw) || gamePassRaw.length === 0) {
      return { games, warnings, statusMessage };
    }

    const gamePassGames = gamePassRaw.map(ownedGameToGame);
    return {
      games: [...games, ...gamePassGames],
      warnings,
      statusMessage,
    };
  } catch (err) {
    warnings.push(`Failed to load Game Pass catalog from cache: ${err}`);
    return { games, warnings, statusMessage };
  }
}
