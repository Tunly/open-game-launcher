import { fetchSteamOwnedGames, openSteamScraperWindow, type OwnedGame } from "../../lib/launcher";
import { normalizeSteamOwnedGames } from "../../lib/steam-owned-games";
import {
  installedSteamAppIds,
  ownedGameToGame,
  readLocalStorageString,
} from "../../lib/library-providers";
import { resolveSteamAppId } from "../../lib/steam-app-id";
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
      const ownedByAppId = new Map(
        ownedGames.flatMap((game) => {
          const appId = resolveSteamAppId(game);
          return appId ? [[appId, game] as const] : [];
        }),
      );
      const gamesWithAchievementSummaries = games.map((game) => {
        const appId = resolveSteamAppId(game);
        const summary = appId ? ownedByAppId.get(appId)?.achievementSummary : undefined;
        return summary ? { ...game, achievementSummary: summary } : game;
      });
      const installed = installedSteamAppIds(games);
      const uninstalledOwned = ownedGames.filter((og) => {
        const appid = og.id.replace("steam-owned-", "");
        return !installed.has(appid) && !installed.has(og.title.toLowerCase());
      });
      return {
        games: [...gamesWithAchievementSummaries, ...uninstalledOwned],
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
