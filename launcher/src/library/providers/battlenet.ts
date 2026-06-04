import { installedBattlenetIds, ownedGameToGame } from "../../lib/library-providers";
import { STORAGE_KEYS } from "../../lib/storage-keys";
import type { Game } from "../../lib/types";
import type { MergeContext, ProviderResult } from "./types";

export async function mergeBattlenetOwned(
  games: Game[],
  context: MergeContext,
): Promise<ProviderResult> {
  void context;
  const warnings: string[] = [];
  const statusMessage: string | null = null;

  const battlenetGamesStr = localStorage.getItem(STORAGE_KEYS.BATTLENET_GAMES_CACHE);
  if (!battlenetGamesStr) {
    return { games, warnings, statusMessage };
  }

  try {
    const battlenetRaw = JSON.parse(battlenetGamesStr);
    if (!Array.isArray(battlenetRaw) || battlenetRaw.length === 0) {
      return { games, warnings, statusMessage };
    }

    const ownedBattlenetGames = battlenetRaw.map(ownedGameToGame);
    const installed = installedBattlenetIds(games);
    const uninstalledOwned = ownedBattlenetGames.filter((og) => {
      const bnetId = og.id.replace("battlenet-owned-", "");
      const extId = og.externalId || bnetId;
      return (
        !installed.has(bnetId) && !installed.has(extId) && !installed.has(og.title.toLowerCase())
      );
    });

    return {
      games: [...games, ...uninstalledOwned],
      warnings,
      statusMessage,
    };
  } catch (err) {
    warnings.push(`Failed to load Battle.net games from cache: ${err}`);
    return { games, warnings, statusMessage };
  }
}
