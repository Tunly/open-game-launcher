import type { AuthenticatedRequest } from "../_shared/privacy.ts";
import type { NormalizedAchievement } from "./achievement-ingestion.ts";
import type {
  AchievementCatalogGame,
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
    upsertAchievementDefinitions: (auth, gameId, achievements) =>
      upsertAchievementDefinitions(
        adminClientFromAuth(auth),
        gameId,
        achievements,
      ),
  };
}

async function authenticateRequest(
  deps: Pick<AchievementIngestionAdapterDeps, "authenticateRequest">,
  request: Request,
): Promise<AchievementIngestionAuthContext | Response> {
  const authResult = await deps.authenticateRequest(request);
  if (authResult instanceof Response) {
    return authResult;
  }

  return {
    adminClient: authResult.adminClient,
    userId: authResult.user.id,
  };
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
  achievements: NormalizedAchievement[],
): Promise<Map<string, string>> {
  const rows = achievements.map((achievement) => ({
    description: achievement.description,
    game_id: gameId,
    icon_url: achievement.iconUrl,
    is_active: true,
    key: achievement.key,
    name: achievement.name,
    points: achievement.points,
    rarity: achievement.rarity,
    updated_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await tableClient(adminClient, "achievements")
    .upsert(rows, { onConflict: "game_id,key" });
  if (upsertError) {
    throw upsertError;
  }

  const { data, error } = await tableClient(adminClient, "achievements")
    .select("id, key")
    .eq("game_id", gameId)
    .in<Array<{ id?: unknown; key?: unknown }>>(
      "key",
      achievements.map((achievement) => achievement.key),
    );
  if (error) {
    throw error;
  }

  return new Map(
    (data ?? [])
      .filter((row) =>
        typeof row.id === "string" && typeof row.key === "string"
      )
      .map((row) => [row.key as string, row.id as string]),
  );
}

async function recordNewAchievementUnlocks(
  adminClient: SupabaseAdminClient,
  userId: string,
  gameId: string,
  gameTitle: string | null,
  achievements: NormalizedAchievement[],
  achievementIdsByKey: Map<string, string>,
  launcherDeviceId: string | null,
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
      p_launcher_device_id: launcherDeviceId,
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
