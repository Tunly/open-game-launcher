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

type PlaytimeSyncInput = {
  game: Game;
  playtimeMinutes?: number | null;
  lastPlayedAt?: string | null;
  countSessionStart?: boolean;
};

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

export async function syncGamePlaytimeStats(input: PlaytimeSyncInput) {
  if (!isSupabaseConfigured) {
    return;
  }

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
    .select("playtime_minutes, total_sessions, first_played_at")
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
  const row = {
    user_id: userId,
    game_id: catalogGameId,
    playtime_minutes: nextPlaytime,
    last_played_at: lastPlayedAt,
    first_played_at: firstPlayedAt,
    installed_version: input.game.version,
    ...(input.countSessionStart
      ? { total_sessions: rowNumber(existing, "total_sessions") + 1 }
      : {}),
  };

  const { error } = await client
    .from("user_game_stats")
    .upsert(row, { onConflict: "user_id,game_id" });

  if (isMissingSchemaError(error)) {
    return;
  }
  handleError(error);
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
  const client = getSupabaseClient();
  const safeMinutes = Math.max(0, Math.floor(playtimeMinutes));
  const { error } = await client.from("user_game_stats").upsert(
    {
      user_id: userId,
      game_id: gameId,
      playtime_minutes: safeMinutes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,game_id" },
  );
  if (isMissingSchemaError(error)) return;
  handleError(error);
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

  let query = client
    .from("game_sessions")
    .select("id, game_id, launcher_device_id, started_at, ended_at, duration_minutes, platform")
    .eq("user_id", userId)
    .order("started_at", { ascending: false });

  if (options.since) {
    query = query.gte("started_at", options.since.toISOString());
  }
  if (options.until) {
    query = query.lte("started_at", options.until.toISOString());
  }
  if (options.gameId) {
    query = query.eq("game_id", options.gameId);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (isMissingSchemaError(error)) return [];
  handleError(error);

  const rows = (data ?? []) as UnknownRecord[];
  return rows.map(asGameSessionRow);
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

  const { error } = await client.from("game_sessions").delete().eq("id", id).eq("user_id", userId);

  if (isMissingSchemaError(error)) return false;
  handleError(error);
  return !error;
}
