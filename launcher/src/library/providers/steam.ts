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
import {
  readSteamOwnedGamesCache,
  writeSteamOwnedGamesCache,
} from "../../lib/steam-owned-games-cache";
import { STORAGE_KEYS } from "../../lib/storage-keys";
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
  const accountIsCurrent = () =>
    context.shouldApplyResult() && readLocalStorageString(STORAGE_KEYS.STEAM_ID) === steamId;

  let ownedRaw: OwnedGame[] = [];
  let loadedFromAccountCache = false;
  try {
    const cacheStr = context.forceRefresh ? null : readSteamOwnedGamesCache(steamId);
    if (cacheStr !== null) {
      try {
        const parsed: unknown = JSON.parse(cacheStr);
        const normalized = normalizeSteamOwnedGames(parsed);
        if (Array.isArray(parsed) && (parsed.length === 0 || normalized.length > 0)) {
          ownedRaw = normalized;
          loadedFromAccountCache = true;
        } else {
          warnings.push("Steam owned-games cache is malformed and will be refreshed.");
        }
      } catch (err) {
        warnings.push(`Failed to parse steamOwnedGamesCache: ${err}`);
      }
    }

    if (!loadedFromAccountCache) {
      ownedRaw = normalizeSteamOwnedGames(await fetchSteamOwnedGames(steamId));
      if (!accountIsCurrent()) {
        return { games, warnings, statusMessage };
      }
      if (ownedRaw.length > 0) {
        writeSteamOwnedGamesCache(steamId, ownedRaw);
      }
    }

    if (!accountIsCurrent()) {
      return { games, warnings, statusMessage };
    }

    if (!loadedFromAccountCache) {
      void openSteamScraperWindow(steamId).catch((err) => {
        console.warn("Failed to open silent steam scraper window:", err);
      });
    }

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
    if (!accountIsCurrent()) {
      return { games, warnings, statusMessage };
    }
    const msg = String(err);
    warnings.push(`Failed to fetch owned steam games during load: ${msg}`);
    if (msg.includes("400") || msg.includes("403") || msg.includes("Game Details")) {
      statusMessage =
        "Warning: Steam: Please set 'Game Details' to Public in Steam > Profile > Privacy Settings. OG-Launcher will sync automatically.";
    }
    return { games, warnings, statusMessage };
  }
}
