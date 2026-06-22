import type {
  PlaytimeIngestionAuthContext,
  PlaytimeIngestionHandlerDeps,
} from "./handler.ts";
import type {
  NormalizedPlaytimeAggregate,
  NormalizedPlaytimeSession,
} from "./playtime-ingestion.ts";

type SupabaseQueryResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

type SupabaseTableClient = {
  in: (
    column: string,
    values: unknown[],
  ) => Promise<SupabaseQueryResult<unknown[]>>;
  insert: (value: unknown) => Promise<SupabaseQueryResult<unknown>>;
  select: (columns: string) => SupabaseTableClient;
  upsert: (
    value: unknown,
    options?: { onConflict?: string },
  ) => Promise<SupabaseQueryResult<unknown>>;
};

type SupabaseAdminClient = {
  from: (table: string) => unknown;
};

type CallerClient = {
  auth: {
    getUser: () => Promise<{
      data?: { user?: { id?: string } | null } | null;
      error?: unknown;
    }>;
  };
};

export type IngestPlaytimeAdapterDeps = {
  createClient: (
    supabaseUrl: string,
    supabaseAnonKey: string,
    options: {
      auth: { autoRefreshToken: false; persistSession: false };
      global: { headers: { Authorization: string } };
    },
  ) => CallerClient;
  supabaseAdmin: SupabaseAdminClient;
  supabaseAnonKey: string;
  supabaseUrl: string;
};

const playtimeIngestionCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-account-deletion-secret, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function createIngestPlaytimeAdapters(
  deps: IngestPlaytimeAdapterDeps,
): PlaytimeIngestionHandlerDeps {
  return {
    authenticateRequest: (request) => authenticateRequest(deps, request),
    findConflictingSessionIds: (auth, sessionIds) =>
      findConflictingSessionIds(
        adminClientFromAuth(auth),
        auth.userId,
        sessionIds,
      ),
    findMissingCatalogGames: (auth, gameIds) =>
      findMissingCatalogGames(adminClientFromAuth(auth), gameIds),
    upsertAggregate: (auth, aggregate) =>
      upsertAggregate(adminClientFromAuth(auth), auth.userId, aggregate),
    upsertSessions: (auth, sessions) =>
      insertSessions(adminClientFromAuth(auth), auth.userId, sessions),
  };
}

async function authenticateRequest(
  deps: Pick<
    IngestPlaytimeAdapterDeps,
    "createClient" | "supabaseAdmin" | "supabaseAnonKey" | "supabaseUrl"
  >,
  request: Request,
): Promise<PlaytimeIngestionAuthContext | Response> {
  const authHeader = request.headers.get("Authorization")?.trim();
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Missing Authorization bearer token." }, 401);
  }

  const token = authHeader.slice(7).trim();
  if (!token || token === deps.supabaseAnonKey) {
    return jsonResponse({ error: "Sign in required." }, 401);
  }

  const callerClient = deps.createClient(
    deps.supabaseUrl,
    deps.supabaseAnonKey,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data?.user?.id) {
    return jsonResponse({ error: "Invalid or expired session." }, 401);
  }

  return {
    adminClient: deps.supabaseAdmin,
    userId: data.user.id,
  };
}

async function findMissingCatalogGames(
  adminClient: SupabaseAdminClient,
  gameIds: string[],
): Promise<string[]> {
  if (gameIds.length === 0) {
    return [];
  }

  const { data, error } = await tableClient(adminClient, "games")
    .select("id")
    .in("id", gameIds);
  if (error) {
    throw error;
  }

  const foundIds = new Set(
    (data ?? [])
      .map((row) => row as { id?: unknown })
      .map((row) => (typeof row.id === "string" ? row.id : null))
      .filter((id): id is string => Boolean(id)),
  );
  return gameIds.filter((gameId) => !foundIds.has(gameId));
}

async function findConflictingSessionIds(
  adminClient: SupabaseAdminClient,
  userId: string,
  sessionIds: string[],
): Promise<string[]> {
  if (sessionIds.length === 0) {
    return [];
  }

  const { data, error } = await tableClient(adminClient, "game_sessions")
    .select("id, user_id")
    .in("id", sessionIds);
  if (error) {
    throw error;
  }

  return (data ?? [])
    .map((row) => row as { id?: unknown; user_id?: unknown })
    .filter((row) => row.user_id !== userId)
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string");
}

async function upsertAggregate(
  adminClient: SupabaseAdminClient,
  userId: string,
  aggregate: NormalizedPlaytimeAggregate,
) {
  const row: Record<string, unknown> = {
    game_id: aggregate.gameId,
    playtime_minutes: aggregate.playtimeMinutes,
    updated_at: new Date().toISOString(),
    user_id: userId,
  };

  if (aggregate.totalSessions !== undefined) {
    row.total_sessions = aggregate.totalSessions;
  }
  if (aggregate.firstPlayedAt !== undefined) {
    row.first_played_at = aggregate.firstPlayedAt;
  }
  if (aggregate.lastPlayedAt !== undefined) {
    row.last_played_at = aggregate.lastPlayedAt;
  }
  if (aggregate.installedVersion !== undefined) {
    row.installed_version = aggregate.installedVersion;
  }

  const { error } = await tableClient(adminClient, "user_game_stats")
    .upsert(row, { onConflict: "user_id,game_id" });
  if (error) {
    throw error;
  }
}

async function insertSessions(
  adminClient: SupabaseAdminClient,
  userId: string,
  sessions: NormalizedPlaytimeSession[],
) {
  const rows = sessions.map((session) => ({
    duration_minutes: session.durationMinutes,
    ended_at: session.endedAt,
    game_id: session.gameId,
    id: session.id,
    launcher_device_id: session.launcherDeviceId,
    platform: session.platform,
    started_at: session.startedAt,
    user_id: userId,
  }));

  const { error } = await tableClient(adminClient, "game_sessions")
    .insert(rows);
  if (error) {
    throw error;
  }
}

function adminClientFromAuth(
  auth: PlaytimeIngestionAuthContext,
): SupabaseAdminClient {
  return auth.adminClient as SupabaseAdminClient;
}

function tableClient(
  adminClient: SupabaseAdminClient,
  table: string,
): SupabaseTableClient {
  return adminClient.from(table) as SupabaseTableClient;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...playtimeIngestionCorsHeaders,
      "Content-Type": "application/json",
    },
  });
}
