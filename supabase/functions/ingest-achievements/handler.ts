import {
  AchievementIngestionValidationError,
  normalizeAchievementIngestionPayload,
  type NormalizedAchievement,
  summarizeAchievementXp,
} from "./achievement-ingestion.ts";

export type AchievementCatalogGame = {
  id: string;
  title: string | null;
};

export type AchievementIngestionAuthContext = {
  adminClient?: unknown;
  userId: string;
};

type AchievementIngestionAuthResult =
  | AchievementIngestionAuthContext
  | Response;

export interface AchievementIngestionHandlerDeps {
  authenticateRequest: (
    request: Request,
  ) => Promise<AchievementIngestionAuthResult>;
  getCatalogGame: (
    auth: AchievementIngestionAuthContext,
    gameId: string,
  ) => Promise<AchievementCatalogGame | null>;
  recordNewAchievementUnlocks: (
    auth: AchievementIngestionAuthContext,
    gameId: string,
    gameTitle: string | null,
    achievements: NormalizedAchievement[],
    achievementIdsByKey: Map<string, string>,
    launcherDeviceId: string | null,
  ) => Promise<Set<string>>;
  upsertAchievementDefinitions: (
    auth: AchievementIngestionAuthContext,
    gameId: string,
    achievements: NormalizedAchievement[],
  ) => Promise<Map<string, string>>;
}

const achievementIngestionCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-account-deletion-secret, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...achievementIngestionCorsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export async function handleAchievementIngestion(
  request: Request,
  deps: AchievementIngestionHandlerDeps,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: achievementIngestionCorsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authResult = await deps.authenticateRequest(request);
  if (authResult instanceof Response) {
    return authResult;
  }

  let ingestion;
  try {
    ingestion = normalizeAchievementIngestionPayload(
      await request.json().catch(() => null),
    );
  } catch (error) {
    if (error instanceof AchievementIngestionValidationError) {
      return jsonResponse(
        { error: error.message, details: error.details },
        400,
      );
    }
    throw error;
  }

  const catalogGame = await deps.getCatalogGame(authResult, ingestion.gameId);
  if (!catalogGame) {
    return jsonResponse(
      { error: "Unknown catalog game id.", missingGameIds: [ingestion.gameId] },
      404,
    );
  }

  const achievementIdsByKey = await deps.upsertAchievementDefinitions(
    authResult,
    ingestion.gameId,
    ingestion.achievements,
  );
  const missingDefinitionKeys = ingestion.achievements
    .map((achievement) => achievement.key)
    .filter((key) => !achievementIdsByKey.has(key));
  if (missingDefinitionKeys.length > 0) {
    return jsonResponse(
      {
        error: "Achievement definitions could not be resolved.",
        missingDefinitionKeys,
      },
      409,
    );
  }

  const unlockedAchievements = ingestion.achievements.filter((achievement) =>
    Boolean(achievement.unlockedAt)
  );
  const insertedUnlockKeys = unlockedAchievements.length > 0
    ? await deps.recordNewAchievementUnlocks(
      authResult,
      ingestion.gameId,
      catalogGame.title,
      unlockedAchievements,
      achievementIdsByKey,
      ingestion.launcherDeviceId,
    )
    : new Set<string>();
  const { newUnlocks, xpDelta } = summarizeAchievementXp(
    unlockedAchievements,
    insertedUnlockKeys,
  );

  return jsonResponse({
    achievementsSynced: ingestion.achievements.length,
    newUnlocks,
    ok: true,
    unlockedCount: unlockedAchievements.length,
    userId: authResult.userId,
    xpDelta,
  });
}
