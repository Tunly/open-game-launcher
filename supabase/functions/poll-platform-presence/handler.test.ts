import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  type ActivityInsertRow,
  type ExistingPresenceRow,
  handlePresencePoll,
  type PlatformAccountRow,
  type PlatformPollResult,
  type PresencePollHandlerDeps,
  type PresenceUpsertRow,
  type ProviderSkip,
} from "./handler.ts";

const userId = "11111111-1111-4111-8111-111111111111";

Deno.test("presence poll handler answers CORS and method guards without auth", async () => {
  const deps = stubDeps({
    verifySecret: () => {
      throw new Error("secret should not be checked");
    },
  });

  const optionsResponse = await handlePresencePoll(
    new Request("https://functions.example/poll-platform-presence", {
      method: "OPTIONS",
    }),
    deps,
  );
  assertEquals(optionsResponse.status, 200);
  assertEquals(optionsResponse.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(
    optionsResponse.headers.get("Access-Control-Allow-Methods"),
    "POST, OPTIONS",
  );

  const getResponse = await handlePresencePoll(
    new Request("https://functions.example/poll-platform-presence", {
      method: "GET",
    }),
    deps,
  );
  assertEquals(getResponse.status, 405);
  assertEquals(await getResponse.json(), { error: "Method not allowed." });
});

Deno.test("presence poll handler rejects unauthorized before database access", async () => {
  let loadCalls = 0;
  let runIdCalls = 0;
  const response = await handlePresencePoll(
    jsonRequest({ dryRun: true }, false),
    stubDeps({
      createRunId: () => {
        runIdCalls += 1;
        return "run-should-not-be-created";
      },
      loadPlatformAccounts: async () => {
        loadCalls += 1;
        return [];
      },
      verifySecret: () => false,
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(await response.json(), { error: "Unauthorized." });
  assertEquals(loadCalls, 0);
  assertEquals(runIdCalls, 0);
});

Deno.test("presence poll handler dry-run skips fresh cache and records evidence without writes", async () => {
  const writes = makeWriteSpies();
  const response = await handlePresencePoll(
    jsonRequest({
      dryRun: true,
      platforms: ["steam", "epic"],
      triggerSource: "hosted_deploy_gate",
    }),
    stubDeps({
      ...writes.deps,
      loadPlatformAccounts: async () => [
        account({
          id: "cached-steam",
          metadata: {
            presencePollCache: { fetchedAt: "2026-06-15T12:00:05.000Z" },
          },
          platform: "steam",
        }),
        account({ id: "missing-epic", platform: "epic" }),
      ],
      pollPlatformPresence: async () => ({ reason: "missing-provider" }),
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    activityInserted: 0,
    cadenceSeconds: 60,
    dryRun: true,
    evidenceRecorded: true,
    polled: 0,
    presenceUpdated: 0,
    runId: "presence-run-1",
    scanned: 2,
    skipped: [
      { accountId: "cached-steam", platform: "steam", reason: "cached" },
      {
        accountId: "missing-epic",
        platform: "epic",
        reason: "missing-provider",
      },
    ],
    triggerSource: "hosted_deploy_gate",
  });
  assertEquals(writes.pollCaches.length, 0);
  assertEquals(writes.presenceRows.length, 0);
  assertEquals(writes.activityRows.length, 0);
  assertEquals(writes.evidenceRecords[0], {
    activity_inserted_count: 0,
    completed_at: "2026-06-15T12:00:20.000Z",
    dry_run: true,
    forced: false,
    platforms: ["steam", "epic"],
    polled_count: 0,
    presence_updated_count: 0,
    provider_result_summary: {
      byPlatform: {},
      byStatus: {},
      total: 0,
    },
    requested_user_count: 0,
    run_id: "presence-run-1",
    scanned_count: 2,
    skipped_count: 2,
    skipped_summary: {
      byPlatform: { epic: 1, steam: 1 },
      byReason: { cached: 1, "missing-provider": 1 },
      maxRetryAfterSeconds: 0,
      rateLimited: 0,
      total: 2,
    },
    started_at: "2026-06-15T12:00:00.000Z",
    status: "dry_run",
    trigger_source: "hosted_deploy_gate",
  });
});

Deno.test("presence poll handler live run writes best presence result and game-start activity", async () => {
  const writes = makeWriteSpies();
  const response = await handlePresencePoll(
    jsonRequest({ triggerSource: "scheduled" }),
    stubDeps({
      ...writes.deps,
      loadExistingPresence: async () => new Map(),
      loadPlatformAccounts: async () => [
        account({ id: "steam-account", platform: "steam" }),
        account({ id: "epic-account", platform: "epic" }),
      ],
      pollPlatformPresence: async (pollAccount) =>
        pollAccount.platform === "epic"
          ? result({
            currentGameTitle: "Better Game",
            platform: "epic",
            platformGameId: "epic-42",
            source: "epic_bridge",
          })
          : result({ status: "online" }),
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    activityInserted: 1,
    cadenceSeconds: 60,
    dryRun: false,
    evidenceRecorded: true,
    polled: 2,
    presenceUpdated: 1,
    runId: "presence-run-1",
    scanned: 2,
    skipped: [],
    triggerSource: "scheduled",
  });
  assertEquals(writes.pollCaches.map((entry) => entry.fetchedAt), [
    "2026-06-15T12:00:10.000Z",
    "2026-06-15T12:00:10.000Z",
  ]);
  assertEquals(writes.presenceRows, [
    {
      current_game_id: null,
      current_game_title: "Better Game",
      last_heartbeat_at: "2026-06-15T12:00:10.000Z",
      platform: "epic",
      platform_game_id: "epic-42",
      platform_last_polled_at: "2026-06-15T12:00:10.000Z",
      platform_source: "epic_bridge",
      status: "online",
      user_id: userId,
    },
  ]);
  assertEquals(writes.activityRows, [
    {
      game_title: "Better Game",
      metadata: {
        platform: "epic",
        platformGameId: "epic-42",
        platformSource: "epic_bridge",
      },
      type: "game_start",
      user_id: userId,
      visibility: "friends_only",
    },
  ]);
  assertEquals(writes.evidenceRecords[0].provider_result_summary, {
    byPlatform: { epic: 1, steam: 1 },
    byStatus: { online: 2 },
    total: 2,
  });
});

Deno.test("presence poll handler live run caches provider skips without presence writes", async () => {
  const writes = makeWriteSpies();
  const response = await handlePresencePoll(
    jsonRequest({}),
    stubDeps({
      ...writes.deps,
      loadPlatformAccounts: async () => [account({ platform: "steam" })],
      pollPlatformPresence: async () => ({
        reason: "rate-limited",
        retryAfterSeconds: 45,
      }),
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    activityInserted: 0,
    cadenceSeconds: 60,
    dryRun: false,
    evidenceRecorded: true,
    polled: 0,
    presenceUpdated: 0,
    runId: "presence-run-1",
    scanned: 1,
    skipped: [
      {
        accountId: "account-1",
        platform: "steam",
        reason: "rate-limited",
        retryAfterSeconds: 45,
      },
    ],
    triggerSource: "manual",
  });
  assertEquals(writes.pollCaches, [
    {
      accountId: "account-1",
      fetchedAt: "2026-06-15T12:00:10.000Z",
      result: { reason: "rate-limited", retryAfterSeconds: 45 },
    },
  ]);
  assertEquals(writes.presenceRows.length, 0);
  assertEquals(writes.activityRows.length, 0);
  assertEquals(writes.evidenceRecords[0].skipped_summary, {
    byPlatform: { steam: 1 },
    byReason: { "rate-limited": 1 },
    maxRetryAfterSeconds: 45,
    rateLimited: 1,
    total: 1,
  });
});

Deno.test("presence poll handler force bypasses fresh cache", async () => {
  let pollCalls = 0;
  const response = await handlePresencePoll(
    jsonRequest({ dryRun: true, force: true }),
    stubDeps({
      loadPlatformAccounts: async () => [
        account({
          metadata: {
            presencePollCache: { fetchedAt: "2026-06-15T12:00:09.000Z" },
          },
        }),
      ],
      pollPlatformPresence: async () => {
        pollCalls += 1;
        return result();
      },
    }),
  );

  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(body.polled, 1);
  assertEquals(body.skipped, []);
  assertEquals(pollCalls, 1);
});

Deno.test("presence poll handler records game-stop activity when a game ends", async () => {
  const writes = makeWriteSpies();
  const existing: ExistingPresenceRow = {
    currentGameTitle: "Old Game",
    platform: "steam",
    platformGameId: "old-game",
    status: "online",
    userId,
  };
  const response = await handlePresencePoll(
    jsonRequest({}),
    stubDeps({
      ...writes.deps,
      loadExistingPresence: async () => new Map([[userId, existing]]),
      loadPlatformAccounts: async () => [account({ platform: "steam" })],
      pollPlatformPresence: async () =>
        result({
          currentGameTitle: null,
          platformGameId: null,
          status: "offline",
        }),
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(writes.activityRows, [
    {
      game_title: "Old Game",
      metadata: {
        platform: "steam",
        platformGameId: null,
        platformSource: "steam_web_api",
      },
      type: "game_stop",
      user_id: userId,
      visibility: "friends_only",
    },
  ]);
});

Deno.test("presence poll handler maps dependency errors to 500 without evidence", async () => {
  const writes = makeWriteSpies();
  const response = await handlePresencePoll(
    jsonRequest({ dryRun: true }),
    stubDeps({
      ...writes.deps,
      loadPlatformAccounts: async () => {
        throw new Error("read failed");
      },
    }),
  );

  assertEquals(response.status, 500);
  assertEquals(await response.json(), { error: "read failed" });
  assertEquals(writes.evidenceRecords.length, 0);
});

function jsonRequest(body: Record<string, unknown>, authorized = true) {
  return new Request("https://functions.example/poll-platform-presence", {
    body: JSON.stringify(body),
    headers: authorized
      ? {
        Authorization: "Bearer test-secret",
        "Content-Type": "application/json",
      }
      : { "Content-Type": "application/json" },
    method: "POST",
  });
}

function account(
  overrides: Partial<PlatformAccountRow> = {},
): PlatformAccountRow {
  return {
    id: "account-1",
    metadata: {},
    platform: "steam",
    platformUserId: "platform-user-1",
    updatedAt: "2026-06-15T11:00:00.000Z",
    userId,
    ...overrides,
  };
}

function result(
  overrides: Partial<PlatformPollResult> = {},
): PlatformPollResult {
  return {
    currentGameTitle: null,
    platform: "steam",
    platformGameId: null,
    source: "steam_web_api",
    status: "online",
    ...overrides,
  };
}

function makeWriteSpies() {
  const pollCaches: Array<{
    accountId: string;
    fetchedAt: string;
    result: PlatformPollResult | ProviderSkip;
  }> = [];
  const presenceRows: PresenceUpsertRow[] = [];
  const activityRows: ActivityInsertRow[] = [];
  const evidenceRecords: Array<Record<string, unknown>> = [];

  return {
    activityRows,
    deps: {
      insertActivityRows: async (rows: ActivityInsertRow[]) => {
        activityRows.push(...rows);
      },
      recordPresencePollRun: async (evidence: Record<string, unknown>) => {
        evidenceRecords.push(evidence);
      },
      upsertPresenceRows: async (rows: PresenceUpsertRow[]) => {
        presenceRows.push(...rows);
      },
      writePollCache: async (
        pollAccount: PlatformAccountRow,
        fetchedAt: string,
        pollResult: PlatformPollResult | ProviderSkip,
      ) => {
        pollCaches.push({
          accountId: pollAccount.id,
          fetchedAt,
          result: pollResult,
        });
      },
    },
    evidenceRecords,
    pollCaches,
    presenceRows,
  };
}

function stubDeps(
  overrides: Partial<PresencePollHandlerDeps> = {},
): PresencePollHandlerDeps {
  let nowIndex = 0;
  const dates = [
    "2026-06-15T12:00:00.000Z",
    "2026-06-15T12:00:10.000Z",
    "2026-06-15T12:00:20.000Z",
  ];

  return {
    cadenceMs: 60_000,
    createRunId: () => "presence-run-1",
    insertActivityRows: async () => {},
    loadExistingPresence: async () => new Map(),
    loadPlatformAccounts: async () => [],
    maxBatchSize: 50,
    now: () => new Date(dates[Math.min(nowIndex++, dates.length - 1)]),
    pollPlatformPresence: async () => result(),
    recordPresencePollRun: async () => {},
    upsertPresenceRows: async () => {},
    verifySecret: (request) =>
      request.headers.get("Authorization") === "Bearer test-secret",
    writePollCache: async () => {},
    ...overrides,
  };
}
