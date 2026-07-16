import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { achievementProviderForGame } from "../../lib/achievement-providers";
import { supportedAchievementSyncGames, type GameGroup } from "../../lib/game-groups";
import { getErrorMessage } from "../../lib/formatters";
import { getAchievementProviderStatusMessage } from "../../lib/achievement-status";
import {
  persistAchievementProviderStatus,
  syncAchievementProviderGame,
  withAchievementProviderStatus,
  type GameAchievementProviderStatus,
} from "../../lib/achievement-provider-sync";
import { cacheSteamOwnedGameAchievements } from "../../lib/steam-owned-games-cache";
import { ingestTrustedAchievements } from "../../lib/supabase/achievements";
import type { Game } from "../../lib/types";

export interface UseAchievementAutoSyncOptions {
  installedGames?: Game[];
  selectedGroup: GameGroup | null;
  setInstalledGames: Dispatch<SetStateAction<Game[]>>;
  setStatusMessage: Dispatch<SetStateAction<string | null>>;
}

export interface UseAchievementAutoSyncResult {
  syncingAchievementGameId: string | null;
  syncingAchievementGameIds: ReadonlySet<string>;
  syncAchievementsForGame: (game: Game) => Promise<void>;
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
  installedGames,
  selectedGroup,
  setInstalledGames,
  setStatusMessage,
}: UseAchievementAutoSyncOptions): UseAchievementAutoSyncResult {
  const autoAchievementSyncAttemptedRef = useRef<Set<string>>(new Set());
  const installedGamesRef = useRef<Game[]>(installedGames ?? []);
  const [syncingAchievementGameIds, setSyncingAchievementGameIds] = useState<Set<string>>(
    () => new Set(),
  );
  if (installedGames) {
    installedGamesRef.current = installedGames;
  }

  const updateInstalledGame = useCallback(
    (gameId: string, update: (game: Game) => Game) => {
      setInstalledGames((current) => {
        const next = current.map((game) => (game.id === gameId ? update(game) : game));
        installedGamesRef.current = next;
        return next;
      });
    },
    [setInstalledGames],
  );

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
        void persistAchievementProviderStatus(game.id, status);
        updateInstalledGame(game.id, (currentGame) =>
          withAchievementProviderStatus(currentGame, status),
        );
        return;
      }

      const syncTarget = provider.provider.toUpperCase();

      if (!options.silent) {
        setStatusMessage(`Syncing ${syncTarget} achievements...`);
      }
      setSyncingAchievementGameIds((current) => new Set(current).add(game.id));

      let syncedGame: Game | null = null;
      let newUnlocks: NonNullable<Game["achievements"]> = [];

      try {
        const outcome = await syncAchievementProviderGame(game, provider);
        if (!outcome.success) {
          updateInstalledGame(game.id, (currentGame) =>
            withAchievementProviderStatus(
              outcome.game,
              outcome.status,
              currentGame.achievementProviderStatuses,
            ),
          );
          if (!options.silent) {
            setStatusMessage(outcome.status.message);
          } else if (outcome.status.status === "failed") {
            console.warn("[OG-Launcher] Auto achievement sync failed:", outcome.diagnosticMessage);
          }
          return;
        }

        const { response } = outcome;
        syncedGame = response.game;
        cacheSteamOwnedGameAchievements(response.game);
        const previous = installedGamesRef.current.find((candidate) => candidate.id === game.id);
        const previousUnlocked = new Set(
          previous?.achievements
            ?.filter((achievement) => achievement.unlockedAt)
            .map((a) => a.id) ?? [],
        );
        newUnlocks =
          response.game.achievements?.filter(
            (achievement) => achievement.unlockedAt && !previousUnlocked.has(achievement.id),
          ) ?? [];

        const hostedByProviderRelay = response.achievementPersistence === "hosted";
        const ingestion = hostedByProviderRelay
          ? null
          : await ingestTrustedAchievements({
              game: response.game,
              provider: provider.provider,
              providerConfidence: provider.stability,
              syncedAt: response.game.achievementsSyncedAt ?? null,
            });
        const isLocalOnly =
          !hostedByProviderRelay &&
          (ingestion?.persistence === "local_only" || ingestion?.skipped === true);
        const message = isLocalOnly
          ? `${response.message} Local only; hosted profile was not updated.`
          : response.message;
        const status: GameAchievementProviderStatus = {
          source: provider.provider,
          status: "available",
          stability: provider.stability,
          message,
        };
        void persistAchievementProviderStatus(response.game.id, status);

        updateInstalledGame(response.game.id, (currentGame) =>
          withAchievementProviderStatus(
            response.game,
            status,
            currentGame.achievementProviderStatuses,
          ),
        );
        if (newUnlocks.length > 0 && !options.silent) {
          setStatusMessage(
            `${newUnlocks.length} new achievement${newUnlocks.length === 1 ? "" : "s"} unlocked! ${isLocalOnly ? "Saved locally only." : ""}`.trim(),
          );
        } else if (!options.silent) {
          setStatusMessage(message);
        }
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        const diagnosticMessage = syncedGame
          ? `Achievements synced locally, but trusted hosted persistence failed: ${errorMessage}`
          : errorMessage;
        const failedStatus: GameAchievementProviderStatus = {
          source: provider.provider,
          status: "failed",
          stability: provider.stability,
          message: diagnosticMessage,
        };
        const message = getAchievementProviderStatusMessage(failedStatus);
        const status = { ...failedStatus, message };
        void persistAchievementProviderStatus(game.id, status);
        updateInstalledGame(game.id, (currentGame) =>
          withAchievementProviderStatus(
            syncedGame ?? currentGame,
            status,
            currentGame.achievementProviderStatuses,
          ),
        );
        if (!options.silent) {
          setStatusMessage(message);
        } else if (options.silent) {
          console.warn("[OG-Launcher] Auto achievement sync failed:", diagnosticMessage);
        }
      } finally {
        setSyncingAchievementGameIds((current) => {
          const next = new Set(current);
          next.delete(game.id);
          return next;
        });
      }
    },
    [setStatusMessage, updateInstalledGame],
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
    syncingAchievementGameId: syncingAchievementGameIds.values().next().value ?? null,
    syncingAchievementGameIds,
    syncAchievementsForGame,
  };
}
