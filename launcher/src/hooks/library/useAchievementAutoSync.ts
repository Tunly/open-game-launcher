import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { achievementProviderForGame } from "../../lib/achievement-providers";
import { supportedAchievementSyncGames, type GameGroup } from "../../lib/game-groups";
import { getErrorMessage } from "../../lib/formatters";
import { updateAchievementProviderStatus } from "../../lib/launcher";
import { useActivityLogger } from "../useActivityLogger";
import type { Game } from "../../lib/types";

const ACHIEVEMENT_SYNC_COOLDOWN_MS = 30_000;

type GameAchievementProviderStatus = NonNullable<Game["achievementProviderStatuses"]>[number];

export interface UseAchievementAutoSyncOptions {
  selectedGroup: GameGroup | null;
  setInstalledGames: Dispatch<SetStateAction<Game[]>>;
  setStatusMessage: Dispatch<SetStateAction<string | null>>;
}

export interface UseAchievementAutoSyncResult {
  syncingAchievementGameId: string | null;
  syncAchievementsForGame: (
    game: Game,
    options?: { silent?: boolean; force?: boolean; deferStatus?: boolean },
  ) => Promise<AchievementSyncResult>;
  handleSyncAchievements: () => Promise<void>;
}

interface AchievementSyncResult {
  gameId: string;
  provider: string;
  success: boolean;
  syncedAchievements: number;
  unlockedAchievements: number;
  message: string;
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
    async (
      game: Game,
      options: { silent?: boolean; force?: boolean; deferStatus?: boolean } = {},
    ) => {
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
        return {
          gameId: game.id,
          provider: provider.provider,
          success: false,
          syncedAchievements: 0,
          unlockedAchievements: 0,
          message: provider.message,
        };
      }

      if (!options.silent && !options.force) {
        const last = lastManualAchievementSyncRef.current.get(game.id) ?? 0;
        const elapsed = Date.now() - last;
        if (elapsed < ACHIEVEMENT_SYNC_COOLDOWN_MS) {
          const remaining = Math.ceil((ACHIEVEMENT_SYNC_COOLDOWN_MS - elapsed) / 1000);
          setStatusMessage(`Please wait ${remaining}s before syncing again.`);
          return {
            gameId: game.id,
            provider: provider.provider,
            success: false,
            syncedAchievements: 0,
            unlockedAchievements: 0,
            message: `Please wait ${remaining}s before syncing again.`,
          };
        }
        lastManualAchievementSyncRef.current.set(game.id, Date.now());
      }

      const syncTarget = provider.provider.toUpperCase();

      if (!options.silent) {
        setStatusMessage(`Syncing ${syncTarget} achievements...`);
      }
      setSyncingAchievementGameId(game.id);

      try {
        const response = await provider.sync(game);
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
          if (newUnlocks.length > 0 && !options.silent && !options.deferStatus) {
            setStatusMessage(
              `${newUnlocks.length} new achievement${newUnlocks.length === 1 ? "" : "s"} unlocked!`,
            );
          } else if (!options.silent && !options.deferStatus) {
            setStatusMessage(response.message);
          }
          const nextGame = withAchievementProviderStatus(
            response.game,
            status,
            previous?.achievementProviderStatuses,
          );
          return current.map((game) => (game.id === response.game.id ? nextGame : game));
        });
        return {
          gameId: response.game.id,
          provider: provider.provider,
          success: true,
          syncedAchievements: response.syncedAchievements,
          unlockedAchievements: response.unlockedAchievements,
          message: response.message,
        };
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
        if (!options.silent && !options.deferStatus) {
          setStatusMessage(message);
        } else if (options.silent) {
          console.warn("[OG-Launcher] Auto achievement sync failed:", message);
        }
        return {
          gameId: game.id,
          provider: provider.provider,
          success: false,
          syncedAchievements: 0,
          unlockedAchievements: 0,
          message,
        };
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
      setStatusMessage("No connected achievement provider is available for this game.");
      return;
    }

    const results: AchievementSyncResult[] = [];
    for (const game of candidates) {
      results.push(
        await syncAchievementsForGame(game, {
          force: candidates.length > 1,
          deferStatus: candidates.length > 1,
        }),
      );
    }

    if (results.length <= 1) {
      return;
    }

    const successes = results.filter((result) => result.success);
    const failures = results.filter((result) => !result.success);
    const synced = successes.reduce((sum, result) => sum + result.syncedAchievements, 0);
    const unlocked = successes.reduce((sum, result) => sum + result.unlockedAchievements, 0);

    if (successes.length > 0 && failures.length > 0) {
      setStatusMessage(
        `Synced ${successes.length}/${results.length} achievement providers (${synced} achievements). ${failures.length} provider failed: ${failures.map((result) => result.provider.toUpperCase()).join(", ")}.`,
      );
      return;
    }

    if (successes.length > 0) {
      setStatusMessage(
        unlocked > 0
          ? `Synced ${successes.length} achievement providers: ${unlocked}/${synced} unlocked.`
          : `Synced ${successes.length} achievement providers (${synced} achievements).`,
      );
      return;
    }

    setStatusMessage(
      `Achievement sync failed for ${failures.map((result) => result.provider.toUpperCase()).join(", ")}: ${failures[0]?.message ?? "unknown error"}`,
    );
  };

  useEffect(() => {
    if (!selectedGroup) {
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
