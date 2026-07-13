import type {
  PlaytimeIngestionAuthContext,
  PlaytimeIngestionHandlerDeps,
  PlaytimeIngestionWriteResult,
} from "./handler.ts";
import type { NormalizedPlaytimeIngestion } from "./playtime-ingestion.ts";

type SupabaseQueryResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

type SupabaseTableClient = {
  in: (
    column: string,
    values: unknown[],
  ) => Promise<SupabaseQueryResult<unknown[]>>;
  select: (columns: string) => SupabaseTableClient;
};

type SupabaseAdminClient = {
  from: (table: string) => unknown;
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<SupabaseQueryResult<unknown>>;
};

type TrustedPlaytimeRpcRow = {
  accepted?: unknown;
  aggregate_pushed?: unknown;
  owner_conflict_session_ids?: unknown;
  payload_conflict_session_ids?: unknown;
  sessions_pushed?: unknown;
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
    findMissingCatalogGames: (auth, gameIds) =>
      findMissingCatalogGames(adminClientFromAuth(auth), gameIds),
    ingestPlaytime: (auth, ingestion) =>
      ingestPlaytime(
        adminClientFromAuth(auth),
        auth.userId,
        ingestion,
      ),
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
      .map((row) => typeof row.id === "string" ? row.id.toLowerCase() : null)
      .filter((id): id is string => Boolean(id)),
  );
  return gameIds.filter((gameId) => !foundIds.has(gameId.toLowerCase()));
}

async function ingestPlaytime(
  adminClient: SupabaseAdminClient,
  userId: string,
  ingestion: NormalizedPlaytimeIngestion,
): Promise<PlaytimeIngestionWriteResult> {
  const aggregate = ingestion.aggregate
    ? aggregateRpcRow(ingestion.aggregate)
    : null;
  const sessions = ingestion.sessions.map((session) => ({
    duration_minutes: session.durationMinutes,
    ended_at: session.endedAt,
    game_id: session.gameId,
    id: session.id,
    launcher_device_id: session.launcherDeviceId,
    platform: session.platform,
    started_at: session.startedAt,
  }));

  const { data, error } = await adminClient.rpc("ingest_trusted_playtime", {
    p_aggregate: aggregate,
    p_authenticated_user_id: userId,
    p_sessions: sessions,
  });
  if (error) {
    throw error;
  }

  const rpcRows = Array.isArray(data) ? data as TrustedPlaytimeRpcRow[] : [];
  const rpcRow = rpcRows.length === 1 ? rpcRows[0] : null;
  const ownerConflictSessionIds = stringArray(
    rpcRow?.owner_conflict_session_ids,
  );
  const payloadConflictSessionIds = stringArray(
    rpcRow?.payload_conflict_session_ids,
  );
  if (
    !rpcRow ||
    typeof rpcRow.accepted !== "boolean" ||
    typeof rpcRow.aggregate_pushed !== "boolean" ||
    typeof rpcRow.sessions_pushed !== "number" ||
    !Number.isSafeInteger(rpcRow.sessions_pushed) ||
    rpcRow.sessions_pushed < 0 ||
    ownerConflictSessionIds === null ||
    payloadConflictSessionIds === null
  ) {
    throw new Error("Invalid ingest_trusted_playtime RPC response.");
  }

  return {
    accepted: rpcRow.accepted,
    aggregatePushed: rpcRow.aggregate_pushed,
    ownerConflictSessionIds,
    payloadConflictSessionIds,
    sessionsPushed: rpcRow.sessions_pushed,
  };
}

function aggregateRpcRow(
  aggregate: NonNullable<NormalizedPlaytimeIngestion["aggregate"]>,
) {
  const row: Record<string, unknown> = {
    game_id: aggregate.gameId,
    observed_at: aggregate.observedAt,
    operation: aggregate.operation,
    operation_id: aggregate.operationId,
    playtime_minutes: aggregate.playtimeMinutes,
  };

  if (aggregate.sessionCountDelta !== undefined) {
    row.session_count_delta = aggregate.sessionCountDelta;
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

  return row;
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
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
