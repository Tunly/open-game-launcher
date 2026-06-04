import {
  fetchSteamOwnedGames,
  normalizeSteamOwnedGames,
  openSteamScraperWindow,
  type OwnedGame,
} from "../../lib/launcher";
import {
  installedSteamAppIds,
  ownedGameToGame,
  readLocalStorageString,
} from "../../lib/library-providers";
import { STEAM_OWNED_GAMES_CACHE_VERSION, STORAGE_KEYS } from "../../lib/storage-keys";
import type { Game } from "../../lib/types";
import type { MergeContext, ProviderResult } from "./types";

export async function mergeSteamOwned(
  games: Game[],
  context: MergeContext,
): Promise<ProviderResult> {
  const warnings: string[] = [];
  let statusMessage: string | null = null;

  const steamId = readLocalStorageString(STORAGE_KEYS.STEAM_ID);
  if (!steamId) {
    return { games, warnings, statusMessage };
  }

  let ownedRaw: OwnedGame[] = [];
  try {
    const cacheStr = localStorage.getItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE);
    const cacheVersion = localStorage.getItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE_VERSION);
    if (!context.forceRefresh && cacheVersion === STEAM_OWNED_GAMES_CACHE_VERSION && cacheStr) {
      try {
        ownedRaw = normalizeSteamOwnedGames(JSON.parse(cacheStr));
      } catch (err) {
        warnings.push(`Failed to parse steamOwnedGamesCache: ${err}`);
      }
    }

    if (ownedRaw.length === 0) {
      ownedRaw = normalizeSteamOwnedGames(await fetchSteamOwnedGames(steamId));
      if (ownedRaw.length > 0) {
        localStorage.setItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE, JSON.stringify(ownedRaw));
        localStorage.setItem(
          STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE_VERSION,
          STEAM_OWNED_GAMES_CACHE_VERSION,
        );
      }
    }

    void openSteamScraperWindow(steamId).catch((err) => {
      console.warn("Failed to open silent steam scraper window:", err);
    });

    if (ownedRaw.length > 0) {
      const ownedGames = ownedRaw.map(ownedGameToGame);
      const installed = installedSteamAppIds(games);
      const uninstalledOwned = ownedGames.filter((og) => {
        const appid = og.id.replace("steam-owned-", "");
        return !installed.has(appid) && !installed.has(og.title.toLowerCase());
      });
      return {
        games: [...games, ...uninstalledOwned],
        warnings,
        statusMessage,
      };
    }

    return { games, warnings, statusMessage };
  } catch (err) {
    const msg = String(err);
    warnings.push(`Failed to fetch owned steam games during load: ${msg}`);
    if (msg.includes("400") || msg.includes("403") || msg.includes("Game Details")) {
      statusMessage =
        "Warning: Steam: Please set 'Game Details' to Public in Steam > Profile > Privacy Settings. OG-Launcher will sync automatically.";
    }
    return { games, warnings, statusMessage };
  }
}
