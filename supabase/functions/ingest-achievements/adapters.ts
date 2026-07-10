import type { AuthenticatedRequest } from "../_shared/privacy.ts";
import type { NormalizedAchievement } from "./achievement-ingestion.ts";
import type {
  AchievementCatalogGame,
  AchievementDefinitionUpsertResult,
  AchievementIngestionAuthContext,
  AchievementIngestionHandlerDeps,
} from "./handler.ts";

type AdminClient = AuthenticatedRequest["adminClient"];

type SupabaseQueryError = {
  message?: string;
};

type SupabaseQueryResult<T> = {
  data: T | null;
  error: SupabaseQueryError | null;
};

type SupabaseQueryPromise<T> = PromiseLike<SupabaseQueryResult<T>>;

type SupabaseTableClient = {
  eq: (column: string, value: unknown) => SupabaseTableClient;
  in: <T>(column: string, values: unknown[]) => SupabaseQueryPromise<T>;
  maybeSingle: <T>() => Promise<SupabaseQueryResult<T>>;
  select: (columns: string) => SupabaseTableClient;
  upsert: (
    value: unknown,
    options: { onConflict: string },
  ) => SupabaseQueryPromise<unknown>;
};

type SupabaseAdminClient = {
  from: (table: string) => unknown;
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => SupabaseQueryPromise<unknown>;
};

type TrustedAchievementUnlockRpcRow = {
  recorded_achievement_key?: unknown;
};

type AuthenticatedRequestResult = AuthenticatedRequest | Response;

export type AchievementIngestionAdapterDeps = {
  authenticateRequest: (
    request: Request,
  ) => Promise<AuthenticatedRequestResult>;
  getEnv?: (name: string) => string | undefined;
};

export function createAchievementIngestionAdapters(
  deps: AchievementIngestionAdapterDeps,
): AchievementIngestionHandlerDeps {
  return {
    authenticateRequest: (request) => authenticateRequest(deps, request),
    getCatalogGame: (auth, gameId) =>
      getCatalogGame(adminClientFromAuth(auth), gameId),
    recordNewAchievementUnlocks: (
      auth,
      gameId,
      gameTitle,
      achievements,
      achievementIdsByKey,
      launcherDeviceId,
    ) =>
      recordNewAchievementUnlocks(
        adminClientFromAuth(auth),
        auth.userId,
        gameId,
        gameTitle,
        achievements,
        achievementIdsByKey,
        launcherDeviceId,
      ),
    upsertAchievementDefinitions: (
      auth,
      gameId,
      provider,
      syncedAt,
      achievements,
    ) =>
      upsertAchievementDefinitions(
        adminClientFromAuth(auth),
        gameId,
        provider,
        syncedAt,
        achievements,
      ),
  };
}

async function authenticateRequest(
  deps: AchievementIngestionAdapterDeps,
  request: Request,
): Promise<AchievementIngestionAuthContext | Response> {
  const authResult = await deps.authenticateRequest(request);
  if (authResult instanceof Response) {
    return authResult;
  }

  return {
    adminClient: authResult.adminClient,
    hasTrustedAttestation: hasTrustedAttestation(request, deps.getEnv),
    userId: authResult.user.id,
  };
}

function hasTrustedAttestation(
  request: Request,
  getEnv: AchievementIngestionAdapterDeps["getEnv"],
) {
  const expected = getEnv?.("ACHIEVEMENT_INGESTION_ATTESTATION_SECRET")
    ?.trim() ?? "";
  const supplied = request.headers.get("x-achievement-attestation")?.trim() ??
    "";

  // Short secrets are treated as a deployment misconfiguration. This secret
  // belongs only in a trusted provider-verification relay, never in launcher
  // binaries or browser bundles.
  if (expected.length < 32 || supplied.length === 0) {
    return false;
  }

  const expectedBytes = new TextEncoder().encode(expected);
  const suppliedBytes = new TextEncoder().encode(supplied);
  const length = Math.max(expectedBytes.length, suppliedBytes.length);
  let mismatch = expectedBytes.length ^ suppliedBytes.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (expectedBytes[index] ?? 0) ^ (suppliedBytes[index] ?? 0);
  }
  return mismatch === 0;
}

function adminClientFromAuth(
  auth: AchievementIngestionAuthContext,
): SupabaseAdminClient {
  return auth.adminClient as SupabaseAdminClient;
}

async function getCatalogGame(
  adminClient: SupabaseAdminClient,
  gameId: string,
): Promise<AchievementCatalogGame | null> {
  const { data, error } = await tableClient(adminClient, "games")
    .select("id, title")
    .eq("id", gameId)
    .maybeSingle<{ id?: unknown; title?: unknown }>();
  if (error) {
    throw error;
  }
  if (!data || typeof data.id !== "string") {
    return null;
  }
  return {
    id: data.id,
    title: typeof data.title === "string" ? data.title : null,
  };
}

async function upsertAchievementDefinitions(
  adminClient: SupabaseAdminClient,
  gameId: string,
  provider: string,
  syncedAt: string,
  achievements: NormalizedAchievement[],
): Promise<AchievementDefinitionUpsertResult> {
  const rows = achievements.map((achievement) => ({
    description: achievement.description,
    icon_url: achievement.iconUrl,
    key: achievement.key,
    name: achievement.name,
    points: achievement.points,
    rarity: achievement.rarity,
    rarity_percent: achievement.rarityPercent,
  }));

  const { data, error } = await adminClient.rpc(
    "upsert_trusted_achievement_definitions",
    {
      p_achievements: rows,
      p_game_id: gameId,
      p_provider: provider,
      p_synced_at: syncedAt,
    },
  );
  if (error) {
    throw error;
  }

  const resultRows = Array.isArray(data)
    ? data as Array<{
      achievement_id?: unknown;
      achievement_key?: unknown;
      ingestion_accepted?: unknown;
    }>
    : [];
  const accepted = resultRows.some((row) => row.ingestion_accepted === true);

  return {
    accepted,
    achievementIdsByKey: new Map(
      resultRows
        .filter((row) =>
          typeof row.achievement_id === "string" &&
          typeof row.achievement_key === "string"
        )
        .map((row) => [
          row.achievement_key as string,
          row.achievement_id as string,
        ]),
    ),
  };
}

async function recordNewAchievementUnlocks(
  adminClient: SupabaseAdminClient,
  userId: string,
  gameId: string,
  gameTitle: string | null,
  achievements: NormalizedAchievement[],
  achievementIdsByKey: Map<string, string>,
  _launcherDeviceId: string | null,
): Promise<Set<string>> {
  const unlocks = achievements
    .map((achievement) => {
      const achievementId = achievementIdsByKey.get(achievement.key);
      if (!achievementId || !achievement.unlockedAt) {
        return null;
      }

      return {
        achievement_id: achievementId,
        achievement_key: achievement.key,
        achievement_name: achievement.name,
        metadata: {
          provider: achievement.provider,
          provider_confidence: achievement.providerConfidence,
          source_achievement_id: achievement.sourceAchievementId,
        },
        points: achievement.points,
        unlocked_at: achievement.unlockedAt,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (unlocks.length === 0) {
    return new Set();
  }

  const { data, error } = await adminClient
    .rpc("record_trusted_achievement_unlocks", {
      p_game_id: gameId,
      p_game_title: gameTitle,
      // Device ids are deliberately not forwarded into a public-data RPC.
      p_launcher_device_id: null,
      p_unlocks: unlocks,
      p_user_id: userId,
    });
  if (error) {
    throw error;
  }

  const rows = Array.isArray(data)
    ? data as TrustedAchievementUnlockRpcRow[]
    : [];

  return new Set(
    rows
      .map((row: TrustedAchievementUnlockRpcRow) =>
        typeof row.recorded_achievement_key === "string"
          ? row.recorded_achievement_key
          : null
      )
      .filter((key): key is string => Boolean(key)),
  );
}

function tableClient(
  supabaseAdmin: SupabaseAdminClient,
  table: string,
): SupabaseTableClient {
  return supabaseAdmin.from(table) as SupabaseTableClient;
}
