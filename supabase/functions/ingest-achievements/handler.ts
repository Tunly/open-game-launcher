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
  hasTrustedAttestation: boolean;
  userId: string;
};

export type AchievementDefinitionUpsertResult = {
  accepted: boolean;
  achievementIdsByKey: Map<string, string>;
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
    provider: string,
    syncedAt: string,
    achievements: NormalizedAchievement[],
  ) => Promise<AchievementDefinitionUpsertResult>;
}

const achievementIngestionCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-achievement-attestation, x-client-info, apikey, content-type",
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

  const unlockedAchievements = ingestion.achievements.filter((achievement) =>
    Boolean(achievement.unlockedAt)
  );

  // A user JWT proves who is calling, not that Steam/Xbox (or any other
  // provider) vouched for the supplied catalog and unlock ids. Keep these
  // payloads local-only until a trusted server-side relay attests them.
  if (!authResult.hasTrustedAttestation) {
    return jsonResponse({
      achievementsSynced: 0,
      newUnlocks: 0,
      ok: true,
      persistence: "local_only",
      receivedAchievements: ingestion.achievements.length,
      receivedUnlocks: unlockedAchievements.length,
      trust: "unverified",
      unlockedCount: 0,
      userId: authResult.userId,
      xpDelta: 0,
    }, 202);
  }

  if (!ingestion.syncedAt) {
    return jsonResponse({
      error: "syncedAt is required for attested achievement ingestion.",
    }, 400);
  }

  const definitionResult = await deps.upsertAchievementDefinitions(
    authResult,
    ingestion.gameId,
    ingestion.provider,
    ingestion.syncedAt,
    ingestion.achievements,
  );
  if (!definitionResult.accepted) {
    return jsonResponse({
      achievementsSynced: 0,
      ignored: true,
      newUnlocks: 0,
      ok: true,
      reason: "out_of_order",
      trust: "attested",
      unlockedCount: 0,
      userId: authResult.userId,
      xpDelta: 0,
    }, 202);
  }

  const achievementIdsByKey = definitionResult.achievementIdsByKey;
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
