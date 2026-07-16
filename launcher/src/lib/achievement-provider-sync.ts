import type { AchievementProvider } from "./achievement-providers";
import {
  getAchievementProviderDisplayName,
  getAchievementProviderStatusMessage,
} from "./achievement-status";
import {
  achievementProviderSyncGameKey,
  coordinateAchievementProviderSync,
} from "./achievement-sync-coordinator";
import { getErrorMessage } from "./formatters";
import { updateAchievementProviderStatus } from "./launcher";
import type { Game, SyncGameAchievementsResponse } from "./types";

export type GameAchievementProviderStatus = NonNullable<
  Game["achievementProviderStatuses"]
>[number];

type AchievementProviderSyncSuccess = {
  diagnosticMessage: null;
  game: Game;
  response: SyncGameAchievementsResponse;
  status: GameAchievementProviderStatus;
  success: true;
};

type AchievementProviderSyncFailure = {
  diagnosticMessage: string;
  game: Game;
  response: null;
  status: GameAchievementProviderStatus;
  success: false;
};

export type AchievementProviderSyncOutcome =
  AchievementProviderSyncSuccess | AchievementProviderSyncFailure;

function normalizeSource(source: string) {
  return source
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isExpectedProviderUnavailable(provider: AchievementProvider, message: string) {
  if (normalizeSource(provider.provider) !== "epic") {
    return false;
  }

  const noReadableLocalData =
    /\b(?:no local epic achievement cache found|local epic achievement cache did not contain readable achievements)\b/i.test(
      message,
    );
  const noPublicDefinitions = /\bno public epic achievement page matched\b/i.test(message);
  const emptyReadableCache =
    /\blocal epic achievement cache did not contain readable achievements\b/i.test(message);

  return emptyReadableCache || (noReadableLocalData && noPublicDefinitions);
}

export function withAchievementProviderStatus(
  game: Game,
  status: GameAchievementProviderStatus,
  existingStatuses = game.achievementProviderStatuses ?? [],
): Game {
  return {
    ...game,
    achievementProviderStatuses: [
      ...existingStatuses.filter(
        (entry) => normalizeSource(entry.source) !== normalizeSource(status.source),
      ),
      status,
    ],
  };
}

export async function persistAchievementProviderStatus(
  gameId: string,
  status: GameAchievementProviderStatus,
) {
  if (/^(?:steam|epic|gog|ea|ubisoft|battlenet|xbox)-owned-.+/i.test(gameId)) {
    // Provider-owned inventory entries are frontend overlays, not native
    // collection rows. Their status remains on the in-memory/snapshot game;
    // attempting a native update would only produce a misleading missing-row
    // warning and must not create an incomplete local game record.
    return;
  }
  try {
    await updateAchievementProviderStatus({ gameId, status });
  } catch (error) {
    console.warn("[OG-Launcher] Achievement provider status update failed:", error);
  }
}

function validateProviderResponse(
  game: Game,
  provider: AchievementProvider,
  response: SyncGameAchievementsResponse,
) {
  const achievements = response.game.achievements ?? [];
  if (
    !response.success ||
    response.game.id !== game.id ||
    response.syncedAchievements <= 0 ||
    achievements.length === 0
  ) {
    throw new Error(
      `${getAchievementProviderDisplayName(provider.provider)} returned no achievement definitions for ${game.title}.`,
    );
  }
}

export function syncAchievementProviderGame(
  game: Game,
  provider: AchievementProvider,
): Promise<AchievementProviderSyncOutcome> {
  return coordinateAchievementProviderSync({
    gameKey: achievementProviderSyncGameKey(game, provider.provider),
    provider: provider.provider,
    sync: async () => {
      try {
        const response = await provider.sync(game);
        validateProviderResponse(game, provider, response);
        const status: GameAchievementProviderStatus = {
          message: response.message,
          source: provider.provider,
          stability: provider.stability,
          status: "available",
        };
        await persistAchievementProviderStatus(response.game.id, status);
        return {
          diagnosticMessage: null,
          game: withAchievementProviderStatus(response.game, status),
          response,
          status,
          success: true,
        };
      } catch (error) {
        const diagnosticMessage = getErrorMessage(error);
        const expectedUnavailable = isExpectedProviderUnavailable(provider, diagnosticMessage);
        const failedStatus: GameAchievementProviderStatus = {
          message: diagnosticMessage,
          source: provider.provider,
          stability: provider.stability,
          status: expectedUnavailable ? "not_connected" : "failed",
        };
        const status = {
          ...failedStatus,
          message: getAchievementProviderStatusMessage(failedStatus),
        };
        await persistAchievementProviderStatus(game.id, status);
        return {
          diagnosticMessage,
          game: withAchievementProviderStatus(game, status),
          response: null,
          status,
          success: false,
        };
      }
    },
  });
}
