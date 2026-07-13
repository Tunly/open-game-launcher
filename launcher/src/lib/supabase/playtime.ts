import type { Game, PlaySession } from "../types";
import { getCurrentSessionUserId, getSupabaseClient, isSupabaseConfigured } from "./client";
import {
  handleError,
  isMissingSchemaError,
  rowNullableString,
  rowNumber,
  rowString,
  type UnknownRecord,
} from "./helpers";
import { isTrustedIngestionStrictMode, trustedIngestionStrictModeError } from "./trusted-ingestion";

type PlaytimeSyncInput = {
  game: Game;
  playtimeMinutes?: number | null;
  lastPlayedAt?: string | null;
  countSessionStart?: boolean;
};

type TrustedPlaytimeAggregatePayload = {
  firstPlayedAt?: string | null;
  gameId: string;
  installedVersion?: string | null;
  lastPlayedAt?: string | null;
  observedAt: string;
  operation: "snapshot" | "correction";
  operationId: string;
  playtimeMinutes: number;
  sessionCountDelta?: number;
};

type TrustedPlaytimeSessionPayload = {
  durationMinutes: number | null;
  endedAt: string | null;
  gameId: string;
  id: string;
  launcherDeviceId: string | null;
  platform: GameSessionPlatform | null;
  startedAt: string;
};

type TrustedPlaytimePayload = {
  aggregate?: TrustedPlaytimeAggregatePayload;
  sessions?: TrustedPlaytimeSessionPayload[];
};

type SupabaseFunctionErrorLike = {
  code?: string;
  context?: { status?: number };
  message?: string;
  name?: string;
  status?: number;
};

type SupabaseFunctionInvoker = (
  functionName: string,
  options: { body: TrustedPlaytimePayload },
) => Promise<{ data: unknown; error: SupabaseFunctionErrorLike | null }>;

type TrustedPlaytimeIngestionResult = {
  aggregatePushed: boolean;
  sessionsPushed: number;
};

type SupabasePlaytimeRpcInvoker = (
  functionName: "ingest_trusted_playtime",
  args: {
    p_aggregate: Record<string, unknown>;
    p_authenticated_user_id: string;
    p_sessions: never[];
  },
) => Promise<{
  data: unknown;
  error: SupabaseFunctionErrorLike | null;
}>;

const catalogGameCacheTtlMs = 5 * 60_000;
const catalogGameIdCache = new Map<string, { catalogGameId: string | null; expiresAt: number }>();
const catalogGameIdRequests = new Map<string, Promise<string | null>>();

function isFresh(expiresAt: number) {
  return expiresAt > Date.now();
}

function slugifyTitle(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function externalIdKey(game: Game) {
  if (!game.launcher || game.launcher === "unknown" || game.launcher === "manual") {
    return null;
  }
  if (game.externalId) {
    return { launcher: game.launcher, id: game.externalId };
  }

  const prefix = `${game.launcher}-owned-`;
  if (game.id.startsWith(prefix)) {
    return { launcher: game.launcher, id: game.id.slice(prefix.length) };
  }

  return null;
}

function catalogGameCacheKey(game: Game) {
  const external = externalIdKey(game);
  if (external) {
    return `external:${external.launcher}:${external.id}`;
  }

  const slug = game.slug || slugifyTitle(game.title);
  if (slug) {
    return `slug:${slug}`;
  }

  const title = game.title.trim().toLowerCase();
  return title ? `title:${title}` : null;
}

async function loadCatalogGameId(game: Game): Promise<string | null> {
  const client = getSupabaseClient();
  const external = externalIdKey(game);

  if (external) {
    const { data, error } = await client
      .from("games")
      .select("id, external_ids")
      .contains("external_ids", { [external.launcher]: external.id })
      .limit(1)
      .maybeSingle();

    if (isMissingSchemaError(error)) {
      return null;
    }
    handleError(error);

    const id = data ? rowString(data as UnknownRecord, "id") : "";
    if (id) {
      return id;
    }
  }

  const slug = game.slug || slugifyTitle(game.title);
  if (slug) {
    const { data, error } = await client
      .from("games")
      .select("id, slug")
      .eq("slug", slug)
      .limit(1)
      .maybeSingle();

    if (isMissingSchemaError(error)) {
      return null;
    }
    handleError(error);

    const id = data ? rowString(data as UnknownRecord, "id") : "";
    if (id) {
      return id;
    }
  }

  if (!game.title.trim()) {
    return null;
  }

  const { data, error } = await client
    .from("games")
    .select("id, title")
    .eq("title", game.title)
    .limit(1)
    .maybeSingle();

  if (isMissingSchemaError(error)) {
    return null;
  }
  handleError(error);

  return data ? rowNullableString(data as UnknownRecord, "id") : null;
}

async function resolveCatalogGameId(game: Game): Promise<string | null> {
  const key = catalogGameCacheKey(game);
  if (!key) {
    return null;
  }

  const cached = catalogGameIdCache.get(key);
  if (cached && isFresh(cached.expiresAt)) {
    return cached.catalogGameId;
  }

  const pending = catalogGameIdRequests.get(key);
  if (pending) {
    return pending;
  }

  const request = loadCatalogGameId(game);
  catalogGameIdRequests.set(key, request);

  try {
    const catalogGameId = await request;
    catalogGameIdCache.set(key, {
      catalogGameId,
      expiresAt: Date.now() + catalogGameCacheTtlMs,
    });
    return catalogGameId;
  } finally {
    catalogGameIdRequests.delete(key);
  }
}

export function clearPlaytimeSupabaseCaches() {
  catalogGameIdCache.clear();
  catalogGameIdRequests.clear();
}

export { resolveCatalogGameId };

function getTrustedPlaytimeInvoker(client: unknown): SupabaseFunctionInvoker | null {
  const functions = (client as { functions?: { invoke?: SupabaseFunctionInvoker } }).functions;
  return typeof functions?.invoke === "function" ? functions.invoke.bind(functions) : null;
}

function getPlaytimeRpcInvoker(client: unknown): SupabasePlaytimeRpcInvoker | null {
  const rpc = (client as { rpc?: SupabasePlaytimeRpcInvoker }).rpc;
  return typeof rpc === "function" ? rpc.bind(client) : null;
}

function trustedPlaytimeResult(data: unknown): TrustedPlaytimeIngestionResult | null {
  const candidate = Array.isArray(data) ? data[0] : data;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const aggregatePushed = record.aggregatePushed ?? record.aggregate_pushed;
  const sessionsPushed = record.sessionsPushed ?? record.sessions_pushed;
  if (
    typeof aggregatePushed !== "boolean" ||
    typeof sessionsPushed !== "number" ||
    !Number.isSafeInteger(sessionsPushed) ||
    sessionsPushed < 0
  ) {
    return null;
  }

  return { aggregatePushed, sessionsPushed };
}

function aggregateRpcRow(aggregate: TrustedPlaytimeAggregatePayload) {
  return {
    game_id: aggregate.gameId,
    observed_at: aggregate.observedAt,
    operation: aggregate.operation,
    operation_id: aggregate.operationId,
    playtime_minutes: aggregate.playtimeMinutes,
    ...(aggregate.sessionCountDelta !== undefined
      ? { session_count_delta: aggregate.sessionCountDelta }
      : {}),
    ...(aggregate.firstPlayedAt !== undefined ? { first_played_at: aggregate.firstPlayedAt } : {}),
    ...(aggregate.lastPlayedAt !== undefined ? { last_played_at: aggregate.lastPlayedAt } : {}),
    ...(aggregate.installedVersion !== undefined
      ? { installed_version: aggregate.installedVersion }
      : {}),
  };
}

export function isTrustedPlaytimeIngestionUnavailable(error: unknown) {
  const typedError = (error ?? {}) as SupabaseFunctionErrorLike;
  const status = typedError.status ?? typedError.context?.status ?? null;
  const message = String(typedError.message ?? "").toLowerCase();
  const name = String(typedError.name ?? "").toLowerCase();

  return (
    status === 404 ||
    status === 503 ||
    name.includes("fetch") ||
    message.includes("failed to fetch") ||
    message.includes("function not found") ||
    message.includes("not found") ||
    message.includes("networkerror")
  );
}

async function tryTrustedPlaytimeIngestion(
  payload: TrustedPlaytimePayload,
): Promise<TrustedPlaytimeIngestionResult | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  const invokeFunction = getTrustedPlaytimeInvoker(getSupabaseClient());
  if (!invokeFunction) {
    return null;
  }

  const { data, error } = await invokeFunction("ingest-playtime", { body: payload });
  if (!error) {
    const result = trustedPlaytimeResult(data);
    if (!result) {
      throw new Error("Trusted playtime ingestion returned an invalid response.");
    }
    return result;
  }

  if (isTrustedPlaytimeIngestionUnavailable(error)) {
    return null;
  }

  handleError({ message: error.message ?? "Trusted playtime ingestion failed." });
  return null;
}

async function tryAuthenticatedPlaytimeAggregate(
  userId: string,
  aggregate: TrustedPlaytimeAggregatePayload,
): Promise<TrustedPlaytimeIngestionResult | null> {
  const client = getSupabaseClient();
  const invokeRpc = getPlaytimeRpcInvoker(client);
  if (!invokeRpc) {
    return null;
  }

  const { data, error } = await invokeRpc("ingest_trusted_playtime", {
    p_aggregate: aggregateRpcRow(aggregate),
    p_authenticated_user_id: userId,
    p_sessions: [],
  });
  if (error) {
    const normalizedError = {
      code: error.code,
      message: error.message ?? "Playtime aggregate RPC failed.",
    };
    if (isMissingSchemaError(normalizedError)) {
      return null;
    }
    handleError(normalizedError);
  }

  const result = trustedPlaytimeResult(data);
  if (!result) {
    throw new Error("Playtime aggregate RPC returned an invalid response.");
  }
  return result;
}

export async function syncGamePlaytimeStats(input: PlaytimeSyncInput) {
  if (!isSupabaseConfigured) {
    return;
  }

  // Capture the observation before any remote reads. Concurrent calls can
  // finish out of order, but the database can still identify which snapshot
  // was actually observed first.
  const observedAt = new Date().toISOString();
  const operationId = crypto.randomUUID();

  const client = getSupabaseClient();
  const userId = await getCurrentSessionUserId();
  if (!userId) {
    return;
  }

  const catalogGameId = await resolveCatalogGameId(input.game);
  if (!catalogGameId) {
    return;
  }

  const { data: existingData, error: existingError } = await client
    .from("user_game_stats")
    .select("playtime_minutes, first_played_at")
    .eq("user_id", userId)
    .eq("game_id", catalogGameId)
    .maybeSingle();

  if (isMissingSchemaError(existingError)) {
    return;
  }
  handleError(existingError);

  const existing = (existingData ?? {}) as UnknownRecord;
  const nextPlaytime = Math.max(
    rowNumber(existing, "playtime_minutes"),
    input.playtimeMinutes ?? input.game.playtimeMinutes ?? 0,
  );
  const lastPlayedAt =
    input.lastPlayedAt ?? input.game.lastPlayedAt ?? input.game.lastPlayed ?? null;
  const firstPlayedAt = rowNullableString(existing, "first_played_at") ?? lastPlayedAt;
  const aggregate: TrustedPlaytimeAggregatePayload = {
    firstPlayedAt,
    gameId: catalogGameId,
    installedVersion: input.game.version,
    lastPlayedAt,
    observedAt,
    operation: "snapshot",
    operationId,
    playtimeMinutes: nextPlaytime,
    ...(input.countSessionStart ? { sessionCountDelta: 1 } : {}),
  };

  const trustedResult = await tryTrustedPlaytimeIngestion({ aggregate });
  if (trustedResult) {
    return;
  }

  const rpcResult = await tryAuthenticatedPlaytimeAggregate(userId, aggregate);
  if (rpcResult) {
    return;
  }

  if (isTrustedIngestionStrictMode()) {
    throw trustedIngestionStrictModeError(
      "playtime",
      "ingest-playtime and aggregate RPC unavailable",
    );
  }
}

// ---------------------------------------------------------------------------
// Extended playtime: session CRUD + aggregate editing (FEATURE_PLAN §14
// "Manuelle Korrektur"). The Rust poller owns writes to the local
// `play_sessions` table; this layer mirrors them to Supabase `game_sessions`
// and exposes the manual-edit operations for the UI panel.
// ---------------------------------------------------------------------------

export type GameSessionPlatform = "windows" | "linux" | "macos" | "web" | "unknown";

export type GameSessionRow = {
  id: string;
  gameId: string;
  catalogGameId: string;
  launcherDeviceId: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  platform: GameSessionPlatform | null;
  gameTitle?: string | null;
  gameCoverUrl?: string | null;
};

export type GameSessionPatch = {
  startedAt?: string;
  endedAt?: string | null;
  durationMinutes?: number | null;
};

export type GameSessionListResult = {
  sessions: GameSessionRow[];
  total: number;
};

export type GetUserPlaySessionsOptions = {
  since?: Date;
  until?: Date;
  gameId?: string;
  limit?: number;
};

export type UserPlaySession = GameSessionRow;

const userPlaySessionPageSize = 1_000;
const userPlaySessionSelect =
  "id, game_id, launcher_device_id, started_at, ended_at, duration_minutes, platform, games(title, cover_url)";

type UserPlaySessionCursor = {
  id: string;
  startedAt: string;
};

function userPlaySessionCursorFilter(cursor: UserPlaySessionCursor): string {
  return `started_at.lt.${cursor.startedAt},and(started_at.eq.${cursor.startedAt},id.lt.${cursor.id})`;
}

function lastUserPlaySessionCursor(rows: UnknownRecord[]): UserPlaySessionCursor | null {
  const lastRow = rows.at(-1);
  if (!lastRow) return null;

  const id = rowString(lastRow, "id");
  const startedAt = rowString(lastRow, "started_at");
  return id && startedAt ? { id, startedAt } : null;
}

function asGameSessionRow(row: UnknownRecord): GameSessionRow {
  const platform = rowNullableString(row, "platform") as GameSessionPlatform | null;
  return {
    id: rowString(row, "id"),
    gameId: rowString(row, "game_id"),
    catalogGameId: rowString(row, "game_id"),
    launcherDeviceId: rowNullableString(row, "launcher_device_id"),
    startedAt: rowString(row, "started_at"),
    endedAt: rowNullableString(row, "ended_at"),
    durationMinutes: rowNumber(row, "duration_minutes"),
    platform: platform,
    gameTitle: rowNullableString(row, "game_title"),
    gameCoverUrl: rowNullableString(row, "game_cover_url"),
  };
}

function relatedGameRecord(row: UnknownRecord): UnknownRecord | null {
  const relatedGame = row.games;
  if (relatedGame && typeof relatedGame === "object" && !Array.isArray(relatedGame)) {
    return relatedGame as UnknownRecord;
  }

  const firstRelatedGame = Array.isArray(relatedGame) ? relatedGame[0] : null;
  return firstRelatedGame && typeof firstRelatedGame === "object"
    ? (firstRelatedGame as UnknownRecord)
    : null;
}

function asUserPlaySessionRow(row: UnknownRecord): UserPlaySession {
  const relatedGame = relatedGameRecord(row);
  const relatedTitle = relatedGame ? rowNullableString(relatedGame, "title") : null;
  const legacyTitle = rowNullableString(row, "game_title");
  const candidateTitle = (relatedTitle ?? legacyTitle)?.trim() ?? "";
  const gameId = rowString(row, "game_id");

  return {
    ...asGameSessionRow(row),
    gameTitle: candidateTitle && candidateTitle !== gameId ? candidateTitle : "Unknown Game",
    gameCoverUrl:
      (relatedGame ? rowNullableString(relatedGame, "cover_url") : null) ??
      rowNullableString(row, "game_cover_url"),
  };
}

/**
 * Paginated fetch of `game_sessions` rows for a single game. Resolves the
 * local `Game` to the Supabase `games` catalog id first, so the panel can
 * paginate without doing the join in React.
 */
export async function listGameSessions(
  game: Game,
  options: { page: number; pageSize: number },
): Promise<GameSessionListResult> {
  if (!isSupabaseConfigured) {
    return { sessions: [], total: 0 };
  }
  const client = getSupabaseClient();
  const userId = await getCurrentSessionUserId();
  if (!userId) {
    return { sessions: [], total: 0 };
  }

  const catalogGameId = await resolveCatalogGameId(game);
  if (!catalogGameId) {
    return { sessions: [], total: 0 };
  }

  const from = options.page * options.pageSize;
  const to = from + options.pageSize - 1;

  const [rowsResult, countResult] = await Promise.all([
    client
      .from("game_sessions")
      .select("id, game_id, launcher_device_id, started_at, ended_at, duration_minutes, platform")
      .eq("user_id", userId)
      .eq("game_id", catalogGameId)
      .order("started_at", { ascending: false })
      .range(from, to),
    client
      .from("game_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("game_id", catalogGameId),
  ]);

  if (isMissingSchemaError(rowsResult.error) || isMissingSchemaError(countResult.error)) {
    return { sessions: [], total: 0 };
  }
  handleError(rowsResult.error);
  handleError(countResult.error);

  const rows = (rowsResult.data ?? []) as UnknownRecord[];
  const total = countResult.count ?? rows.length;
  return {
    sessions: rows.map(asGameSessionRow),
    total,
  };
}

/**
 * Patch a single `game_sessions` row owned by the current user. Empty patches
 * short-circuit to `true` (no network call) so the UI can call this
 * unconditionally.
 */
export async function updateGameSession(id: string, patch: GameSessionPatch): Promise<boolean> {
  if (
    !patch ||
    (patch.startedAt === undefined &&
      patch.endedAt === undefined &&
      patch.durationMinutes === undefined)
  ) {
    return true;
  }
  if (!isSupabaseConfigured) {
    return false;
  }
  const client = getSupabaseClient();
  const userId = await getCurrentSessionUserId();
  if (!userId) {
    return false;
  }
  if (isTrustedIngestionStrictMode()) {
    throw trustedIngestionStrictModeError("playtime", "direct game session edit blocked");
  }

  const update: Record<string, unknown> = {};
  if (patch.startedAt !== undefined) update.started_at = patch.startedAt;
  if (patch.endedAt !== undefined) update.ended_at = patch.endedAt;
  if (patch.durationMinutes !== undefined && patch.durationMinutes !== null) {
    update.duration_minutes = Math.max(0, Math.floor(patch.durationMinutes));
  }

  const { error } = await client
    .from("game_sessions")
    .update(update as never)
    .eq("id", id)
    .eq("user_id", userId);

  if (isMissingSchemaError(error)) return false;
  handleError(error);
  return !error;
}

/**
 * Upsert the aggregate `user_game_stats.playtime_minutes` row for the given
 * user + game. Negative values are floored to zero so the poller + UI can
 * never push a negative total.
 */
export async function updateUserGamePlaytime(
  userId: string,
  gameId: string,
  playtimeMinutes: number,
): Promise<void> {
  if (!isSupabaseConfigured) return;
  if (!userId || !gameId) return;
  const safeMinutes = Math.max(0, Math.floor(playtimeMinutes));
  const aggregate: TrustedPlaytimeAggregatePayload = {
    gameId,
    observedAt: new Date().toISOString(),
    operation: "correction",
    operationId: crypto.randomUUID(),
    playtimeMinutes: safeMinutes,
  };

  const currentUserId = await getCurrentSessionUserId();
  if (!currentUserId) {
    return;
  }
  if (currentUserId !== userId) {
    throw new Error("You cannot update another user's playtime.");
  }

  const trustedResult = await tryTrustedPlaytimeIngestion({ aggregate });
  if (trustedResult) {
    if (!trustedResult.aggregatePushed) {
      throw new Error("The playtime correction was not applied. Please retry.");
    }
    return;
  }

  const rpcResult = await tryAuthenticatedPlaytimeAggregate(userId, aggregate);
  if (rpcResult) {
    if (!rpcResult.aggregatePushed) {
      throw new Error("The playtime correction was not applied. Please retry.");
    }
    return;
  }

  if (isTrustedIngestionStrictMode()) {
    throw trustedIngestionStrictModeError(
      "playtime",
      "ingest-playtime and aggregate RPC unavailable",
    );
  }
  throw new Error("The playtime sync service is unavailable. Please retry.");
}

/**
 * Fetches all `game_sessions` rows for the current user in a time range,
 * joining catalog metadata (title, cover). Used by the Activity section.
 */
export async function getUserPlaySessions(
  options: GetUserPlaySessionsOptions = {},
): Promise<UserPlaySession[]> {
  if (!isSupabaseConfigured) return [];
  const client = getSupabaseClient();
  const userId = await getCurrentSessionUserId();
  if (!userId) return [];

  const requestedLimit =
    options.limit !== undefined && Number.isFinite(options.limit) && options.limit > 0
      ? Math.floor(options.limit)
      : null;
  const rows: UnknownRecord[] = [];
  let cursor: UserPlaySessionCursor | null = null;

  while (requestedLimit === null || rows.length < requestedLimit) {
    const pageSize = Math.min(
      userPlaySessionPageSize,
      requestedLimit === null ? userPlaySessionPageSize : requestedLimit - rows.length,
    );
    let query = client
      .from("game_sessions")
      .select(userPlaySessionSelect)
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .order("id", { ascending: false });

    if (options.since) {
      query = query.gte("started_at", options.since.toISOString());
    }
    if (options.until) {
      query = query.lt("started_at", options.until.toISOString());
    }
    if (options.gameId) {
      query = query.eq("game_id", options.gameId);
    }
    if (cursor) {
      query = query.or(userPlaySessionCursorFilter(cursor));
    }

    const { data, error } = await query.limit(pageSize);
    if (isMissingSchemaError(error)) return [];
    handleError(error);

    const pageRows = (data ?? []) as UnknownRecord[];
    rows.push(...pageRows);
    if (pageRows.length === 0) {
      break;
    }

    const nextCursor = lastUserPlaySessionCursor(pageRows);
    if (
      !nextCursor ||
      (cursor && nextCursor.id === cursor.id && nextCursor.startedAt === cursor.startedAt)
    ) {
      break;
    }
    cursor = nextCursor;
  }

  return rows.map(asUserPlaySessionRow);
}

/**
 * Returns the calendar years represented in the current user's sessions.
 * Only the timestamp and cursor columns are read so Activity can build its
 * year selector without downloading every complete session row.
 */
export async function getUserPlaySessionYears(): Promise<number[]> {
  if (!isSupabaseConfigured) return [];
  const client = getSupabaseClient();
  const userId = await getCurrentSessionUserId();
  if (!userId) return [];

  const years = new Set<number>();
  const currentYear = new Date().getFullYear();
  let cursor: UserPlaySessionCursor | null = null;

  while (true) {
    let query = client
      .from("game_sessions")
      .select("started_at, id")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .order("id", { ascending: false });

    if (cursor) {
      query = query.or(userPlaySessionCursorFilter(cursor));
    }

    const { data, error } = await query.limit(userPlaySessionPageSize);

    if (isMissingSchemaError(error)) return [];
    handleError(error);

    const pageRows = (data ?? []) as UnknownRecord[];
    for (const row of pageRows) {
      const startedAt = rowNullableString(row, "started_at");
      if (!startedAt) continue;

      const timestamp = Date.parse(startedAt);
      if (!Number.isFinite(timestamp)) continue;

      const year = new Date(timestamp).getFullYear();
      if (Number.isInteger(year) && year > 0 && year <= currentYear) {
        years.add(year);
      }
    }

    if (pageRows.length === 0) {
      break;
    }

    const nextCursor = lastUserPlaySessionCursor(pageRows);
    if (
      !nextCursor ||
      (cursor && nextCursor.id === cursor.id && nextCursor.startedAt === cursor.startedAt)
    ) {
      break;
    }
    cursor = nextCursor;
  }

  return Array.from(years).sort((left, right) => right - left);
}

export type GameSessionsSyncOutcome = {
  pushed: number;
  pushedIds: string[];
  skipped: number;
  failed: number;
};

function gameLookupFromSession(session: PlaySession): Game {
  const launcherPrefixes: Array<[NonNullable<Game["launcher"]>, string]> = [
    ["steam", "steam-owned-"],
    ["epic", "epic-owned-"],
    ["ubisoft", "ubisoft-owned-"],
    ["ea", "ea-owned-"],
    ["battlenet", "battlenet-owned-"],
    ["gog", "gog-owned-"],
    ["xbox", "xbox-owned-"],
  ];
  const launcher = launcherPrefixes.find(([, prefix]) => session.gameId.startsWith(prefix))?.[0];

  return {
    description: "",
    id: session.gameId,
    launcher,
    platform: "windows",
    status: "installed",
    title: "",
    version: "",
  };
}

/**
 * Pushes a batch of locally-stored play sessions to the Supabase
 * `game_sessions` table. Returns counts so the caller can log/display
 * progress. The caller is responsible for marking the local rows as synced
 * afterwards via the Rust Tauri command.
 */
export async function syncGameSessions(sessions: PlaySession[]): Promise<GameSessionsSyncOutcome> {
  const outcome: GameSessionsSyncOutcome = { pushed: 0, pushedIds: [], skipped: 0, failed: 0 };

  if (!isSupabaseConfigured) {
    return { ...outcome, skipped: sessions.length };
  }
  if (sessions.length === 0) {
    return outcome;
  }

  const client = getSupabaseClient();
  const userId = await getCurrentSessionUserId();
  if (!userId) {
    return { ...outcome, skipped: sessions.length };
  }

  const uniqueGameIds = Array.from(new Set(sessions.map((session) => session.gameId)));
  const catalogGameIds = new Map<string, string | null>();
  await Promise.all(
    uniqueGameIds.map(async (gameId) => {
      const session = sessions.find((candidate) => candidate.gameId === gameId);
      catalogGameIds.set(
        gameId,
        session ? await resolveCatalogGameId(gameLookupFromSession(session)) : null,
      );
    }),
  );

  const rows = [];
  for (const session of sessions) {
    const catalogGameId = catalogGameIds.get(session.gameId) ?? null;
    if (!catalogGameId) {
      outcome.skipped += 1;
      continue;
    }

    rows.push({
      id: session.id,
      user_id: userId,
      game_id: catalogGameId,
      started_at: new Date(session.startedAt * 1000).toISOString(),
      ended_at: new Date(session.endedAt * 1000).toISOString(),
      duration_minutes: session.durationMinutes,
      platform: session.platform,
      launcher_device_id: session.launcherDeviceId,
    });
  }

  if (rows.length === 0) {
    return outcome;
  }

  const trustedSessions = rows.map((row) => ({
    durationMinutes: row.duration_minutes,
    endedAt: row.ended_at,
    gameId: row.game_id,
    id: row.id,
    launcherDeviceId: row.launcher_device_id,
    platform: row.platform,
    startedAt: row.started_at,
  }));
  const trustedResult = await tryTrustedPlaytimeIngestion({ sessions: trustedSessions });
  if (trustedResult) {
    outcome.pushed = rows.length;
    outcome.pushedIds = rows.map((row) => row.id);
    return outcome;
  }

  if (isTrustedIngestionStrictMode()) {
    throw trustedIngestionStrictModeError("playtime", "ingest-playtime unavailable");
  }

  const { error } = await client.from("game_sessions").upsert(rows, { onConflict: "id" });
  if (error) {
    if (isMissingSchemaError(error)) {
      return { ...outcome, skipped: outcome.skipped + rows.length };
    }
    handleError(error);
    return { ...outcome, failed: outcome.failed + rows.length };
  }

  outcome.pushed = rows.length;
  outcome.pushedIds = rows.map((row) => row.id);
  return outcome;
}

/**
 * Delete a single `game_sessions` row owned by the current user. Used by the
 * manual-correction UI panel.
 */
export async function deleteGameSession(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  if (!id) return false;
  const client = getSupabaseClient();
  const userId = await getCurrentSessionUserId();
  if (!userId) return false;
  if (isTrustedIngestionStrictMode()) {
    throw trustedIngestionStrictModeError("playtime", "direct game session delete blocked");
  }

  const { error } = await client.from("game_sessions").delete().eq("id", id).eq("user_id", userId);

  if (isMissingSchemaError(error)) return false;
  handleError(error);
  return !error;
}
