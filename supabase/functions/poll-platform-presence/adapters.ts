import type { PresencePollRunEvidenceRecord } from "./contract.ts";
import {
  type ActivityInsertRow,
  type ExistingPresenceRow,
  type PlatformAccountRow,
  type PlatformPollResult,
  type PlatformType,
  type PollRequest,
  type PresencePollHandlerDeps,
  type PresenceStatus,
  type PresenceUpsertRow,
  type ProviderSkip,
} from "./handler.ts";
import { toPlatformAccount } from "./provider-client.ts";

const pollCacheKey = "presencePollCache";

type SupabaseQueryResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

type SupabaseTableClient = {
  eq: (column: string, value: unknown) => SupabaseTableClient;
  in: (column: string, values: unknown[]) => SupabaseTableClient;
  insert: (value: unknown) => SupabaseTableClient;
  limit: (count: number) => SupabaseTableClient;
  order: (
    column: string,
    options: { ascending: boolean },
  ) => SupabaseTableClient;
  returns: <T>() => Promise<SupabaseQueryResult<T>>;
  select: (columns: string) => SupabaseTableClient;
  update: (value: unknown) => SupabaseTableClient;
  upsert: (value: unknown, options: unknown) => SupabaseTableClient;
};

type SupabaseAdminClient = {
  from: (table: string) => unknown;
};

export type PresencePollAdapterDeps = {
  cadenceMs: number;
  maxBatchSize: number;
  pollPlatformPresence: PresencePollHandlerDeps["pollPlatformPresence"];
  pollSecret: string;
  supabaseAdmin: SupabaseAdminClient;
};

export type PresencePollAdapters = Omit<
  PresencePollHandlerDeps,
  "createRunId" | "now"
>;

export function createPresencePollAdapters(
  deps: PresencePollAdapterDeps,
): PresencePollAdapters {
  return {
    cadenceMs: deps.cadenceMs,
    insertActivityRows: (rows) => insertActivityRows(deps.supabaseAdmin, rows),
    loadExistingPresence: (userIds) =>
      loadExistingPresence(deps.supabaseAdmin, userIds),
    loadPlatformAccounts: (pollRequest) =>
      loadPlatformAccounts(deps.supabaseAdmin, pollRequest),
    maxBatchSize: deps.maxBatchSize,
    pollPlatformPresence: deps.pollPlatformPresence,
    recordPresencePollRun: (evidence) =>
      recordPresencePollRun(deps.supabaseAdmin, evidence),
    upsertPresenceRows: (rows) => upsertPresenceRows(deps.supabaseAdmin, rows),
    verifySecret: (request) =>
      request.headers.get("Authorization")?.trim() ===
        `Bearer ${deps.pollSecret}`,
    writePollCache: (account, fetchedAt, result) =>
      writePollCache(deps.supabaseAdmin, account, fetchedAt, result),
  };
}

async function recordPresencePollRun(
  supabaseAdmin: SupabaseAdminClient,
  evidence: PresencePollRunEvidenceRecord,
) {
  const { error } = await tableClient(supabaseAdmin, "presence_poll_runs")
    .insert(evidence)
    .returns<unknown>();
  if (error) {
    throw new Error(`Presence poll evidence write failed: ${error.message}`);
  }
}

async function upsertPresenceRows(
  supabaseAdmin: SupabaseAdminClient,
  rows: PresenceUpsertRow[],
) {
  const { error } = await tableClient(supabaseAdmin, "user_presence")
    .upsert(rows, { onConflict: "user_id" })
    .returns<unknown>();
  if (error) {
    throw new Error(error.message);
  }
}

async function insertActivityRows(
  supabaseAdmin: SupabaseAdminClient,
  rows: ActivityInsertRow[],
) {
  const { error } = await tableClient(supabaseAdmin, "activity_feed")
    .insert(rows)
    .returns<unknown>();
  if (error) {
    throw new Error(error.message);
  }
}

async function loadPlatformAccounts(
  supabaseAdmin: SupabaseAdminClient,
  pollRequest: PollRequest,
): Promise<PlatformAccountRow[]> {
  let query = tableClient(supabaseAdmin, "platform_accounts")
    .select("id, user_id, platform, platform_user_id, metadata, updated_at");

  if (pollRequest.userIds.length > 0) {
    query = query.in("user_id", pollRequest.userIds);
  }
  if (pollRequest.platforms.length > 0) {
    query = query.in("platform", pollRequest.platforms);
  }

  const { data, error } = await query
    .order("updated_at", { ascending: true })
    .limit(pollRequest.limit)
    .returns<unknown[]>();
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? [])
    .map(toPlatformAccount)
    .filter(Boolean) as PlatformAccountRow[];
}

async function loadExistingPresence(
  supabaseAdmin: SupabaseAdminClient,
  userIds: string[],
) {
  const uniqueUserIds = Array.from(new Set(userIds));
  const byUserId = new Map<string, ExistingPresenceRow>();
  if (uniqueUserIds.length === 0) {
    return byUserId;
  }

  const { data, error } = await tableClient(supabaseAdmin, "user_presence")
    .select("user_id, status, current_game_title, platform, platform_game_id")
    .in("user_id", uniqueUserIds)
    .returns<unknown[]>();
  if (error) {
    throw new Error(error.message);
  }

  for (const row of data ?? []) {
    const record = row as Record<string, unknown>;
    const userId = readString(record, "user_id");
    if (!userId) {
      continue;
    }

    byUserId.set(userId, {
      currentGameTitle: readString(record, "current_game_title"),
      platform: normalizePlatform(readString(record, "platform")),
      platformGameId: readString(record, "platform_game_id"),
      status: normalizePresenceStatus(readString(record, "status")) ??
        "offline",
      userId,
    });
  }

  return byUserId;
}

async function writePollCache(
  supabaseAdmin: SupabaseAdminClient,
  account: PlatformAccountRow,
  fetchedAt: string,
  result: PlatformPollResult | ProviderSkip,
) {
  const cache = "reason" in result
    ? {
      fetchedAt,
      platform: account.platform,
      reason: result.reason,
      retryAfterSeconds: result.retryAfterSeconds,
    }
    : {
      currentGameTitle: result.currentGameTitle,
      fetchedAt,
      platform: result.platform,
      platformGameId: result.platformGameId,
      source: result.source,
      status: result.status,
    };

  const { error } = await tableClient(supabaseAdmin, "platform_accounts")
    .update({ metadata: { ...account.metadata, [pollCacheKey]: cache } })
    .eq("id", account.id)
    .returns<unknown>();
  if (error) {
    throw new Error(error.message);
  }
}

function normalizePlatform(value: string | null): PlatformType | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  const platforms: PlatformType[] = [
    "steam",
    "epic",
    "gog",
    "ea",
    "xbox",
    "battlenet",
    "ubisoft",
    "og",
  ];
  return platforms.includes(normalized as PlatformType)
    ? (normalized as PlatformType)
    : null;
}

function normalizePresenceStatus(value: string | null): PresenceStatus | null {
  if (
    value === "offline" ||
    value === "online" ||
    value === "away" ||
    value === "busy"
  ) {
    return value;
  }

  return null;
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function tableClient(
  supabaseAdmin: SupabaseAdminClient,
  table: string,
): SupabaseTableClient {
  return supabaseAdmin.from(table) as SupabaseTableClient;
}
