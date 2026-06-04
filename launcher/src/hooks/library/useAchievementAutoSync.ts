import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { syncGameAchievements } from "../../lib/launcher";
import { supportedAchievementSyncGames, type GameGroup } from "../../lib/game-groups";
import { getErrorMessage, getGameSource } from "../../lib/formatters";
import { STORAGE_KEYS } from "../../lib/storage-keys";
import { useActivityLogger } from "../useActivityLogger";
import type { Game } from "../../lib/types";

const ACHIEVEMENT_SYNC_COOLDOWN_MS = 30_000;

function readLocalStorageString(key: string) {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return "";
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : "";
  } catch {
    const trimmed = raw.trim();
    if (trimmed.length >= 2) {
      const first = trimmed[0];
      const last = trimmed[trimmed.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        return trimmed.slice(1, -1);
      }
    }
    return trimmed;
  }
}

function getSteamAppId(game: Game) {
  if (game.launcher === "steam" && game.externalId && /^\d+$/.test(game.externalId)) {
    return game.externalId;
  }

  for (const prefix of ["steam-owned-", "steam-"]) {
    if (game.id.startsWith(prefix)) {
      const appId = game.id.slice(prefix.length);
      if (/^\d+$/.test(appId)) {
        return appId;
      }
    }
  }

  const launchUriAppId = game.launchUri?.match(/^steam:\/\/rungameid\/(\d+)$/)?.[1];
  return launchUriAppId ?? null;
}

export interface UseAchievementAutoSyncOptions {
  selectedGroup: GameGroup | null;
  setInstalledGames: Dispatch<SetStateAction<Game[]>>;
  setStatusMessage: Dispatch<SetStateAction<string | null>>;
}

export interface UseAchievementAutoSyncResult {
  syncingAchievementGameId: string | null;
  syncAchievementsForGame: (
    game: Game,
    options?: { silent?: boolean; force?: boolean },
  ) => Promise<void>;
  handleSyncAchievements: () => Promise<void>;
}

export function useAchievementAutoSync({
  selectedGroup,
  setInstalledGames,
  setStatusMessage,
}: UseAchievementAutoSyncOptions): UseAchievementAutoSyncResult {
  const autoAchievementSyncAttemptedRef = useRef<Set<string>>(new Set());
  const lastManualAchievementSyncRef = useRef<Map<string, number>>(new Map());
  const [syncingAchievementGameId, setSyncingAchievementGameId] = useState<string | null>(null);
  const { logAchievement } = useActivityLogger();

  const syncAchievementsForGame = useCallback(
    async (game: Game, options: { silent?: boolean; force?: boolean } = {}) => {
      let steamId: string | null = null;
      const syncSource = getGameSource(game);

      if (syncSource !== "xbox") {
        const hasSteamAppId = Boolean(getSteamAppId(game));
        if (!hasSteamAppId) {
          if (!options.silent) {
            setStatusMessage(`${game.title} does not expose a Steam AppID for achievement sync.`);
          }
          return;
        }

        steamId = readLocalStorageString(STORAGE_KEYS.STEAM_ID);
        if (!steamId) {
          if (!options.silent) {
            setStatusMessage("Steam achievement sync needs a connected Steam account in Settings.");
          }
          return;
        }
      }

      if (!options.silent && !options.force) {
        const last = lastManualAchievementSyncRef.current.get(game.id) ?? 0;
        const elapsed = Date.now() - last;
        if (elapsed < ACHIEVEMENT_SYNC_COOLDOWN_MS) {
          const remaining = Math.ceil((ACHIEVEMENT_SYNC_COOLDOWN_MS - elapsed) / 1000);
          setStatusMessage(`Please wait ${remaining}s before syncing again.`);
          return;
        }
        lastManualAchievementSyncRef.current.set(game.id, Date.now());
      }

      const syncTarget = syncSource === "xbox" ? "Xbox" : "Steam";

      if (!options.silent) {
        setStatusMessage(`Syncing ${syncTarget} achievements...`);
      }
      setSyncingAchievementGameId(game.id);

      try {
        const response = await syncGameAchievements(game, steamId || undefined);

        setInstalledGames((current) => {
          const previous = current.find((g) => g.id === response.game.id);
          const previousUnlocked = new Set(
            previous?.achievements?.filter((a) => a.unlockedAt).map((a) => a.id) ?? [],
          );
          const newUnlocks =
            response.game.achievements?.filter(
              (a) => a.unlockedAt && !previousUnlocked.has(a.id),
            ) ?? [];
          for (const unlock of newUnlocks) {
            void logAchievement(response.game.id, response.game.title, unlock.name ?? null, {
              achievementId: unlock.id,
              rarity: unlock.rarity ?? null,
            });
          }
          if (newUnlocks.length > 0 && !options.silent) {
            setStatusMessage(
              `${newUnlocks.length} new achievement${newUnlocks.length === 1 ? "" : "s"} unlocked!`,
            );
          } else if (!options.silent) {
            setStatusMessage(response.message);
          }
          return current.map((game) => (game.id === response.game.id ? response.game : game));
        });
      } catch (error) {
        if (!options.silent) {
          setStatusMessage(getErrorMessage(error));
        } else {
          console.warn("[OG-Launcher] Auto achievement sync failed:", getErrorMessage(error));
        }
      } finally {
        setSyncingAchievementGameId(null);
      }
    },
    [logAchievement, setInstalledGames, setStatusMessage],
  );

  const handleSyncAchievements = async () => {
    if (!selectedGroup) {
      return;
    }

    const candidates = supportedAchievementSyncGames(selectedGroup);
    if (candidates.length === 0) {
      setStatusMessage("No Steam or Xbox variant is available for achievement sync.");
      return;
    }

    for (const game of candidates) {
      await syncAchievementsForGame(game, { force: candidates.length > 1 });
    }
  };

  useEffect(() => {
    if (!selectedGroup || selectedGroup.achievements.length > 0) {
      return;
    }

    const candidates = supportedAchievementSyncGames(selectedGroup).filter(
      (game) => !game.achievements?.length,
    );
    if (candidates.length === 0) {
      return;
    }

    for (const game of candidates) {
      if (autoAchievementSyncAttemptedRef.current.has(game.id)) {
        continue;
      }

      if (getGameSource(game) === "steam" && !readLocalStorageString(STORAGE_KEYS.STEAM_ID)) {
        continue;
      }

      autoAchievementSyncAttemptedRef.current.add(game.id);
      void syncAchievementsForGame(game, { silent: true });
    }
  }, [selectedGroup, syncAchievementsForGame]);

  return {
    syncingAchievementGameId,
    syncAchievementsForGame,
    handleSyncAchievements,
  };
}
