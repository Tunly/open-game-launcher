import {
  buildPresencePollRunEvidence,
  parsePollRequestBody,
  type PresencePollPlatform,
  type PresencePollRunEvidenceRecord,
  type PresencePollSkipReason,
  type PresencePollStatus,
  type PresencePollTriggerSource,
} from "./contract.ts";

export type PlatformType = PresencePollPlatform;
export type PresenceStatus = PresencePollStatus;

export type PlatformAccountRow = {
  id: string;
  metadata: Record<string, unknown>;
  platform: PlatformType;
  platformUserId: string;
  updatedAt: string;
  userId: string;
};

export type ExistingPresenceRow = {
  currentGameTitle: string | null;
  platform: PlatformType | null;
  platformGameId: string | null;
  status: PresenceStatus | "invisible";
  userId: string;
};

export type PlatformPollResult = {
  currentGameTitle: string | null;
  platform: PlatformType;
  platformGameId: string | null;
  source: string;
  status: PresenceStatus;
};

export type ProviderSkip = {
  reason: PresencePollSkipReason;
  retryAfterSeconds?: number;
};

export type PresenceUpsertRow = {
  current_game_id: null;
  current_game_title: string | null;
  last_heartbeat_at: string;
  platform: PlatformType;
  platform_game_id: string | null;
  platform_last_polled_at: string;
  platform_source: string;
  status: PresenceStatus;
  user_id: string;
};

export type ActivityInsertRow = {
  game_title: string | null;
  metadata: Record<string, unknown>;
  type: "game_start" | "game_stop";
  user_id: string;
  visibility: "friends_only";
};

export type PollRequest = {
  dryRun: boolean;
  force: boolean;
  limit: number;
  platforms: PlatformType[];
  triggerSource: PresencePollTriggerSource;
  userIds: string[];
};

export interface PresencePollHandlerDeps {
  cadenceMs: number;
  createRunId?: () => string;
  insertActivityRows: (rows: ActivityInsertRow[]) => Promise<void>;
  loadExistingPresence: (
    userIds: string[],
  ) => Promise<Map<string, ExistingPresenceRow>>;
  loadPlatformAccounts: (
    pollRequest: PollRequest,
  ) => Promise<PlatformAccountRow[]>;
  maxBatchSize: number;
  now?: () => Date;
  pollPlatformPresence: (
    account: PlatformAccountRow,
  ) => Promise<PlatformPollResult | ProviderSkip>;
  recordPresencePollRun: (
    evidence: PresencePollRunEvidenceRecord,
  ) => Promise<void>;
  upsertPresenceRows: (rows: PresenceUpsertRow[]) => Promise<void>;
  verifySecret: (request: Request) => boolean;
  writePollCache: (
    account: PlatformAccountRow,
    fetchedAt: string,
    result: PlatformPollResult | ProviderSkip,
  ) => Promise<void>;
}

const presencePollCorsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

const pollCacheKey = "presencePollCache";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...presencePollCorsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function now(deps: PresencePollHandlerDeps): Date {
  return deps.now?.() ?? new Date();
}

export async function handlePresencePoll(
  request: Request,
  deps: PresencePollHandlerDeps,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: presencePollCorsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  if (!deps.verifySecret(request)) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  try {
    const pollRequest = await parsePollRequest(request, deps.maxBatchSize);
    const runId = deps.createRunId?.() ?? crypto.randomUUID();
    const startedAt = now(deps);
    const accounts = await deps.loadPlatformAccounts(pollRequest);
    const existingPresence = await deps.loadExistingPresence(
      accounts.map((account) => account.userId),
    );

    const polledAt = now(deps);
    const nowIso = polledAt.toISOString();
    const providerResults: Array<{
      account: PlatformAccountRow;
      result: PlatformPollResult;
    }> = [];
    const skips: Array<{
      accountId: string;
      platform: PlatformType;
      reason: ProviderSkip["reason"];
      retryAfterSeconds?: number;
    }> = [];

    for (const account of accounts) {
      const cache = readPollCache(account.metadata);
      if (
        !pollRequest.force &&
        isFresh(cache?.fetchedAt, polledAt, deps.cadenceMs)
      ) {
        skips.push({
          accountId: account.id,
          platform: account.platform,
          reason: "cached",
        });
        continue;
      }

      const pollResult = await deps.pollPlatformPresence(account);
      if ("reason" in pollResult) {
        skips.push({
          accountId: account.id,
          platform: account.platform,
          reason: pollResult.reason,
          retryAfterSeconds: pollResult.retryAfterSeconds,
        });
        if (!pollRequest.dryRun) {
          await deps.writePollCache(account, nowIso, pollResult);
        }
        continue;
      }

      providerResults.push({ account, result: pollResult });
      if (!pollRequest.dryRun) {
        await deps.writePollCache(account, nowIso, pollResult);
      }
    }

    const selectedResults = selectBestResultsByUser(providerResults);
    const presenceRows = selectedResults.map(({ account, result }) =>
      toPresenceUpsertRow(account.userId, result, nowIso)
    );
    const activityRows = selectedResults.flatMap(({ account, result }) =>
      toActivityRows(
        existingPresence.get(account.userId),
        account.userId,
        result,
      )
    );

    if (!pollRequest.dryRun && presenceRows.length > 0) {
      await deps.upsertPresenceRows(presenceRows);
    }

    if (!pollRequest.dryRun && activityRows.length > 0) {
      await deps.insertActivityRows(activityRows);
    }

    const evidence = buildPresencePollRunEvidence({
      activityInsertedCount: pollRequest.dryRun ? 0 : activityRows.length,
      completedAt: now(deps).toISOString(),
      dryRun: pollRequest.dryRun,
      forced: pollRequest.force,
      platforms: pollRequest.platforms,
      polledCount: providerResults.length,
      presenceUpdatedCount: pollRequest.dryRun ? 0 : presenceRows.length,
      providerResults: providerResults.map(({ result }) => result),
      requestedUserCount: pollRequest.userIds.length,
      runId,
      scannedCount: accounts.length,
      skipped: skips,
      startedAt: startedAt.toISOString(),
      triggerSource: pollRequest.triggerSource,
    });
    await deps.recordPresencePollRun(evidence);

    return jsonResponse({
      activityInserted: pollRequest.dryRun ? 0 : activityRows.length,
      cadenceSeconds: Math.floor(deps.cadenceMs / 1000),
      dryRun: pollRequest.dryRun,
      evidenceRecorded: true,
      polled: providerResults.length,
      presenceUpdated: pollRequest.dryRun ? 0 : presenceRows.length,
      runId: evidence.run_id,
      scanned: accounts.length,
      skipped: skips,
      triggerSource: evidence.trigger_source,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error
          ? error.message
          : "Presence polling failed.",
      },
      500,
    );
  }
}

async function parsePollRequest(
  request: Request,
  maxBatchSize: number,
): Promise<PollRequest> {
  const body = await request.json().catch(() => ({}));
  return parsePollRequestBody(body, maxBatchSize) as PollRequest;
}

function selectBestResultsByUser(
  results: Array<{ account: PlatformAccountRow; result: PlatformPollResult }>,
) {
  const byUserId = new Map<
    string,
    { account: PlatformAccountRow; result: PlatformPollResult }
  >();

  for (const entry of results) {
    const current = byUserId.get(entry.account.userId);
    if (
      !current ||
      presenceScore(entry.result) < presenceScore(current.result)
    ) {
      byUserId.set(entry.account.userId, entry);
    }
  }

  return Array.from(byUserId.values());
}

function toPresenceUpsertRow(
  userId: string,
  result: PlatformPollResult,
  nowIso: string,
): PresenceUpsertRow {
  return {
    current_game_id: null,
    current_game_title: result.currentGameTitle,
    last_heartbeat_at: nowIso,
    platform: result.platform,
    platform_game_id: result.platformGameId,
    platform_last_polled_at: nowIso,
    platform_source: result.source,
    status: result.status,
    user_id: userId,
  };
}

function toActivityRows(
  existing: ExistingPresenceRow | undefined,
  userId: string,
  result: PlatformPollResult,
): ActivityInsertRow[] {
  const previousGameKey = existing?.platformGameId ??
    existing?.currentGameTitle ?? null;
  const nextGameKey = result.platformGameId ?? result.currentGameTitle;
  const metadata = {
    platform: result.platform,
    platformGameId: result.platformGameId,
    platformSource: result.source,
  };

  if (nextGameKey && previousGameKey !== nextGameKey) {
    return [
      {
        game_title: result.currentGameTitle,
        metadata,
        type: "game_start",
        user_id: userId,
        visibility: "friends_only",
      },
    ];
  }

  if (
    existing?.currentGameTitle &&
    !nextGameKey &&
    existing.platform === result.platform
  ) {
    return [
      {
        game_title: existing.currentGameTitle,
        metadata,
        type: "game_stop",
        user_id: userId,
        visibility: "friends_only",
      },
    ];
  }

  return [];
}

function readPollCache(metadata: Record<string, unknown>) {
  const value = metadata[pollCacheKey];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as { fetchedAt?: unknown })
    : null;
}

function isFresh(value: unknown, polledAt: Date, cadenceMs: number) {
  if (typeof value !== "string") {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && polledAt.getTime() - timestamp <
      cadenceMs;
}

function presenceScore(result: PlatformPollResult) {
  if (result.currentGameTitle) {
    return 0;
  }
  if (result.status === "online") {
    return 1;
  }
  if (result.status === "busy" || result.status === "away") {
    return 2;
  }
  return 3;
}
