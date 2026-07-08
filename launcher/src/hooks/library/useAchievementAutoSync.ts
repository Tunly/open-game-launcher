import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { achievementProviderForGame } from "../../lib/achievement-providers";
import { supportedAchievementSyncGames, type GameGroup } from "../../lib/game-groups";
import { getErrorMessage } from "../../lib/formatters";
import { updateAchievementProviderStatus } from "../../lib/launcher";
import { ingestTrustedAchievements } from "../../lib/supabase/achievements";
import { useActivityLogger } from "../useActivityLogger";
import type { Game } from "../../lib/types";

type GameAchievementProviderStatus = NonNullable<Game["achievementProviderStatuses"]>[number];

export interface UseAchievementAutoSyncOptions {
  selectedGroup: GameGroup | null;
  setInstalledGames: Dispatch<SetStateAction<Game[]>>;
  setStatusMessage: Dispatch<SetStateAction<string | null>>;
}

export interface UseAchievementAutoSyncResult {
  syncingAchievementGameId: string | null;
}

function withAchievementProviderStatus(
  game: Game,
  status: GameAchievementProviderStatus,
  existingStatuses = game.achievementProviderStatuses ?? [],
): Game {
  const nextStatuses = existingStatuses.filter((entry) => entry.source !== status.source);
  return {
    ...game,
    achievementProviderStatuses: [...nextStatuses, status],
  };
}

function persistAchievementProviderStatus(gameId: string, status: GameAchievementProviderStatus) {
  updateAchievementProviderStatus({ gameId, status }).catch((error) => {
    console.warn("[OG-Launcher] Achievement provider status cache update failed:", error);
  });
}

function achievementSyncAttemptKey(game: Game): string {
  const provider = achievementProviderForGame(game);
  return [
    game.id,
    provider.provider,
    game.launcher,
    game.externalId,
    game.status,
    game.installPath,
    game.executablePath,
    game.launchUri,
  ]
    .map((part) => (typeof part === "string" ? part.trim().toLowerCase() : ""))
    .join("|");
}

export function useAchievementAutoSync({
  selectedGroup,
  setInstalledGames,
  setStatusMessage,
}: UseAchievementAutoSyncOptions): UseAchievementAutoSyncResult {
  const autoAchievementSyncAttemptedRef = useRef<Set<string>>(new Set());
  const [syncingAchievementGameId, setSyncingAchievementGameId] = useState<string | null>(null);
  const { logAchievement } = useActivityLogger();

  const syncAchievementsForGame = useCallback(
    async (game: Game, options: { silent?: boolean } = {}) => {
      const provider = achievementProviderForGame(game);
      if (!provider.isAvailable(game)) {
        const status: GameAchievementProviderStatus = {
          source: provider.provider,
          status: provider.status,
          stability: provider.stability,
          message: provider.message,
        };
        if (!options.silent) {
          setStatusMessage(provider.message);
        }
        persistAchievementProviderStatus(game.id, status);
        setInstalledGames((current) =>
          current.map((currentGame) =>
            currentGame.id === game.id
              ? withAchievementProviderStatus(currentGame, status)
              : currentGame,
          ),
        );
        return;
      }

      const syncTarget = provider.provider.toUpperCase();

      if (!options.silent) {
        setStatusMessage(`Syncing ${syncTarget} achievements...`);
      }
      setSyncingAchievementGameId(game.id);

      try {
        const response = await provider.sync(game);
        void ingestTrustedAchievements({
          game: response.game,
          provider: provider.provider,
          providerConfidence: provider.stability,
          syncedAt: response.game.achievementsSyncedAt ?? null,
        }).catch((error) => {
          console.warn("[OG-Launcher] Trusted achievement ingestion skipped:", error);
        });
        const status: GameAchievementProviderStatus = {
          source: provider.provider,
          status: "available",
          stability: provider.stability,
          message: response.message,
        };
        persistAchievementProviderStatus(response.game.id, status);

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
          const nextGame = withAchievementProviderStatus(
            response.game,
            status,
            previous?.achievementProviderStatuses,
          );
          return current.map((game) => (game.id === response.game.id ? nextGame : game));
        });
      } catch (error) {
        const message = getErrorMessage(error);
        const status: GameAchievementProviderStatus = {
          source: provider.provider,
          status: "failed",
          stability: provider.stability,
          message,
        };
        persistAchievementProviderStatus(game.id, status);
        setInstalledGames((current) =>
          current.map((currentGame) =>
            currentGame.id === game.id
              ? withAchievementProviderStatus(currentGame, status)
              : currentGame,
          ),
        );
        if (!options.silent) {
          setStatusMessage(message);
        } else if (options.silent) {
          console.warn("[OG-Launcher] Auto achievement sync failed:", message);
        }
      } finally {
        setSyncingAchievementGameId(null);
      }
    },
    [logAchievement, setInstalledGames, setStatusMessage],
  );

  useEffect(() => {
    if (!selectedGroup) {
      return;
    }

    const candidates = supportedAchievementSyncGames(selectedGroup);
    if (candidates.length === 0) {
      return;
    }

    for (const game of candidates) {
      const attemptKey = achievementSyncAttemptKey(game);
      if (autoAchievementSyncAttemptedRef.current.has(attemptKey)) {
        continue;
      }

      autoAchievementSyncAttemptedRef.current.add(attemptKey);
      void syncAchievementsForGame(game, { silent: true });
    }
  }, [selectedGroup, syncAchievementsForGame]);

  return {
    syncingAchievementGameId,
  };
}
