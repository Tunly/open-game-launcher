import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { createPresencePollAdapters } from "./adapters.ts";
import type { PresencePollRunEvidenceRecord } from "./contract.ts";
import type {
  ActivityInsertRow,
  PlatformAccountRow,
  PlatformPollResult,
  PollRequest,
  PresenceUpsertRow,
  ProviderSkip,
} from "./handler.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const fetchedAt = "2026-06-15T12:00:00.000Z";

Deno.test("presence poll adapters expose runtime config and verify exact bearer secret", () => {
  const adapters = createPresencePollAdapters({
    cadenceMs: 60_000,
    maxBatchSize: 50,
    pollPlatformPresence: async () => providerResult(),
    pollSecret: "presence-secret",
    supabaseAdmin: supabaseStub(),
  });

  assertEquals(adapters.cadenceMs, 60_000);
  assertEquals(adapters.maxBatchSize, 50);
  assertEquals(
    adapters.verifySecret(
      new Request("https://example.test", {
        headers: { Authorization: "Bearer presence-secret" },
      }),
    ),
    true,
  );
  assertEquals(
    adapters.verifySecret(
      new Request("https://example.test", {
        headers: { Authorization: "Bearer presence" },
      }),
    ),
    false,
  );
});

Deno.test("presence poll adapters load platform accounts with filters and provider row normalization", async () => {
  const operations: Operation[] = [];
  const adapters = createPresencePollAdapters({
    cadenceMs: 60_000,
    maxBatchSize: 100,
    pollPlatformPresence: async () => providerResult(),
    pollSecret: "presence-secret",
    supabaseAdmin: supabaseStub({
      dataByTable: {
        platform_accounts: [
          {
            id: "steam-account",
            metadata: { keep: true },
            platform: " STEAM ",
            platform_user_id: " steam-user ",
            updated_at: "2026-06-15T11:00:00.000Z",
            user_id: userId,
          },
          {
            id: "og-account",
            platform: "og",
            platform_user_id: "og-user",
            user_id: userId,
          },
          { id: "missing-user", platform: "epic" },
        ],
        platform_presence_poll_cache: [{
          cache: { fetchedAt: "2026-06-15T11:59:30.000Z" },
          platform_account_id: "steam-account",
        }],
        provider_account_verifications: [{
          platform_account_id: "steam-account",
        }],
      },
      operations,
    }),
  });
  const pollRequest: PollRequest = {
    dryRun: false,
    force: false,
    limit: 25,
    platforms: ["steam", "epic"],
    triggerSource: "scheduled",
    userIds: [userId],
  };

  assertEquals(await adapters.loadPlatformAccounts(pollRequest), [
    {
      id: "steam-account",
      metadata: {
        keep: true,
        presencePollCache: { fetchedAt: "2026-06-15T11:59:30.000Z" },
      },
      platform: "steam",
      platformUserId: "steam-user",
      updatedAt: "2026-06-15T11:00:00.000Z",
      userId,
    },
  ]);
  assertEquals(operations, [
    { args: ["provider_account_verifications"], method: "from" },
    {
      args: ["platform_account_id"],
      method: "select",
      table: "provider_account_verifications",
    },
    {
      args: ["user_id", [userId]],
      method: "in",
      table: "provider_account_verifications",
    },
    {
      args: ["platform", ["steam", "epic"]],
      method: "in",
      table: "provider_account_verifications",
    },
    {
      args: ["updated_at", { ascending: true }],
      method: "order",
      table: "provider_account_verifications",
    },
    {
      args: [25],
      method: "limit",
      table: "provider_account_verifications",
    },
    {
      args: [],
      method: "returns",
      table: "provider_account_verifications",
    },
    { args: ["platform_accounts"], method: "from" },
    {
      args: ["id, user_id, platform, platform_user_id, metadata, updated_at"],
      method: "select",
      table: "platform_accounts",
    },
    {
      args: ["id", ["steam-account"]],
      method: "in",
      table: "platform_accounts",
    },
    {
      args: ["updated_at", { ascending: true }],
      method: "order",
      table: "platform_accounts",
    },
    { args: [25], method: "limit", table: "platform_accounts" },
    { args: [], method: "returns", table: "platform_accounts" },
    { args: ["platform_presence_poll_cache"], method: "from" },
    {
      args: ["platform_account_id, cache"],
      method: "select",
      table: "platform_presence_poll_cache",
    },
    {
      args: ["platform_account_id", ["steam-account"]],
      method: "in",
      table: "platform_presence_poll_cache",
    },
    {
      args: [],
      method: "returns",
      table: "platform_presence_poll_cache",
    },
  ]);
});

Deno.test("presence poll adapters reject unverified account ids and client metadata caches", async () => {
  const operations: Operation[] = [];
  const adapters = createPresencePollAdapters({
    cadenceMs: 60_000,
    maxBatchSize: 100,
    pollPlatformPresence: async () => providerResult(),
    pollSecret: "presence-secret",
    supabaseAdmin: supabaseStub({
      dataByTable: {
        platform_accounts: [{
          id: "unverified-epic-account",
          metadata: {
            presencePollCache: { fetchedAt: "2099-01-01T00:00:00.000Z" },
          },
          platform: "epic",
          platform_user_id: "claimed-provider-id",
          updated_at: fetchedAt,
          user_id: userId,
        }],
        provider_account_verifications: [],
      },
      operations,
    }),
  });

  assertEquals(
    await adapters.loadPlatformAccounts({
      dryRun: false,
      force: false,
      limit: 25,
      platforms: [],
      triggerSource: "scheduled",
      userIds: [],
    }),
    [],
  );
  assertEquals(
    operations.some((operation) =>
      operation.table === "platform_presence_poll_cache"
    ),
    false,
  );
});

Deno.test("presence poll adapters load existing presence with deduped ids and strict status normalization", async () => {
  const emptyOperations: Operation[] = [];
  const emptyAdapters = createPresencePollAdapters({
    cadenceMs: 60_000,
    maxBatchSize: 100,
    pollPlatformPresence: async () => providerResult(),
    pollSecret: "presence-secret",
    supabaseAdmin: supabaseStub({ operations: emptyOperations }),
  });
  assertEquals(await emptyAdapters.loadExistingPresence([]), new Map());
  assertEquals(emptyOperations, []);

  const operations: Operation[] = [];
  const adapters = createPresencePollAdapters({
    cadenceMs: 60_000,
    maxBatchSize: 100,
    pollPlatformPresence: async () => providerResult(),
    pollSecret: "presence-secret",
    supabaseAdmin: supabaseStub({
      dataByTable: {
        user_presence: [
          {
            current_game_title: "  ",
            platform: " EPIC ",
            platform_game_id: " epic-42 ",
            status: "ONLINE",
            user_id: " user-a ",
          },
          {
            current_game_title: "Old Game",
            platform: "unknown",
            status: "away",
            user_id: "user-b",
          },
          { current_game_title: "ignored", status: "online" },
        ],
      },
      operations,
    }),
  });

  const loaded = await adapters.loadExistingPresence([
    "user-a",
    "user-b",
    "user-a",
  ]);
  assertEquals(Array.from(loaded.entries()), [
    [
      "user-a",
      {
        currentGameTitle: null,
        platform: "epic",
        platformGameId: "epic-42",
        status: "offline",
        userId: "user-a",
      },
    ],
    [
      "user-b",
      {
        currentGameTitle: "Old Game",
        platform: null,
        platformGameId: null,
        status: "away",
        userId: "user-b",
      },
    ],
  ]);
  assertEquals(operations, [
    { args: ["user_presence"], method: "from" },
    {
      args: [
        "user_id, status, current_game_title, platform, platform_game_id",
      ],
      method: "select",
      table: "user_presence",
    },
    {
      args: ["user_id", ["user-a", "user-b"]],
      method: "in",
      table: "user_presence",
    },
    { args: [], method: "returns", table: "user_presence" },
  ]);
});

Deno.test("presence poll adapters write result and skip caches to the service-only table", async () => {
  const operations: Operation[] = [];
  const adapters = createPresencePollAdapters({
    cadenceMs: 60_000,
    maxBatchSize: 100,
    pollPlatformPresence: async () => providerResult(),
    pollSecret: "presence-secret",
    supabaseAdmin: supabaseStub({ operations }),
  });
  const account = platformAccount({
    metadata: {
      keep: true,
      presencePollCache: { fetchedAt: "old" },
    },
  });
  const skip: ProviderSkip = {
    reason: "rate-limited",
    retryAfterSeconds: 45,
  };

  await adapters.writePollCache(account, fetchedAt, providerResult());
  await adapters.writePollCache(
    platformAccount({ id: "epic-account", platform: "epic" }),
    fetchedAt,
    skip,
  );

  assertEquals(operations, [
    { args: ["platform_presence_poll_cache"], method: "from" },
    {
      args: [
        {
          cache: {
            currentGameTitle: "Half-Life 3",
            fetchedAt,
            platform: "steam",
            platformGameId: "steam-42",
            source: "steam_web_api",
            status: "online",
          },
          platform_account_id: "account-1",
        },
        { onConflict: "platform_account_id" },
      ],
      method: "upsert",
      table: "platform_presence_poll_cache",
    },
    {
      args: [],
      method: "returns",
      table: "platform_presence_poll_cache",
    },
    { args: ["platform_presence_poll_cache"], method: "from" },
    {
      args: [
        {
          cache: {
            fetchedAt,
            platform: "epic",
            reason: "rate-limited",
            retryAfterSeconds: 45,
          },
          platform_account_id: "epic-account",
        },
        { onConflict: "platform_account_id" },
      ],
      method: "upsert",
      table: "platform_presence_poll_cache",
    },
    {
      args: [],
      method: "returns",
      table: "platform_presence_poll_cache",
    },
  ]);
});

Deno.test("presence poll adapters write presence activity and evidence mutations", async () => {
  const operations: Operation[] = [];
  const adapters = createPresencePollAdapters({
    cadenceMs: 60_000,
    maxBatchSize: 100,
    pollPlatformPresence: async () => providerResult(),
    pollSecret: "presence-secret",
    supabaseAdmin: supabaseStub({ operations }),
  });
  const presenceRows: PresenceUpsertRow[] = [{
    current_game_id: null,
    current_game_title: "Half-Life 3",
    last_heartbeat_at: fetchedAt,
    platform: "steam",
    platform_game_id: "steam-42",
    platform_last_polled_at: fetchedAt,
    platform_source: "steam_web_api",
    status: "online",
    user_id: userId,
  }];
  const activityRows: ActivityInsertRow[] = [{
    game_title: "Half-Life 3",
    metadata: { platform: "steam" },
    type: "game_start",
    user_id: userId,
    visibility: "friends_only",
  }];
  const evidence = presenceEvidence();

  await adapters.upsertPresenceRows(presenceRows);
  await adapters.insertActivityRows(activityRows);
  await adapters.recordPresencePollRun(evidence);

  assertEquals(operations, [
    { args: ["user_presence"], method: "from" },
    {
      args: [presenceRows, { onConflict: "user_id" }],
      method: "upsert",
      table: "user_presence",
    },
    { args: [], method: "returns", table: "user_presence" },
    { args: ["activity_feed"], method: "from" },
    { args: [activityRows], method: "insert", table: "activity_feed" },
    { args: [], method: "returns", table: "activity_feed" },
    { args: ["presence_poll_runs"], method: "from" },
    { args: [evidence], method: "insert", table: "presence_poll_runs" },
    { args: [], method: "returns", table: "presence_poll_runs" },
  ]);

  const errorAdapters = createPresencePollAdapters({
    cadenceMs: 60_000,
    maxBatchSize: 100,
    pollPlatformPresence: async () => providerResult(),
    pollSecret: "presence-secret",
    supabaseAdmin: supabaseStub({
      errorByTable: {
        presence_poll_runs: { message: "insert denied" },
      },
    }),
  });
  await assertRejects(
    () => errorAdapters.recordPresencePollRun(evidence),
    Error,
    "Presence poll evidence write failed: insert denied",
  );
});

type Operation = {
  args: unknown[];
  method: string;
  table?: string;
};

function supabaseStub(options: {
  dataByTable?: Record<string, unknown>;
  errorByTable?: Record<string, { message?: string }>;
  operations?: Operation[];
} = {}) {
  const operations = options.operations ?? [];
  return {
    from: (table: string) => {
      operations.push({ args: [table], method: "from" });
      const query = {
        eq(column: string, value: unknown) {
          operations.push({ args: [column, value], method: "eq", table });
          return query;
        },
        in(column: string, values: unknown[]) {
          operations.push({ args: [column, values], method: "in", table });
          return query;
        },
        insert(value: unknown) {
          operations.push({ args: [value], method: "insert", table });
          return query;
        },
        limit(count: number) {
          operations.push({ args: [count], method: "limit", table });
          return query;
        },
        order(column: string, value: { ascending: boolean }) {
          operations.push({ args: [column, value], method: "order", table });
          return query;
        },
        returns() {
          operations.push({ args: [], method: "returns", table });
          return Promise.resolve({
            data: options.dataByTable?.[table] ?? null,
            error: options.errorByTable?.[table] ?? null,
          });
        },
        select(columns: string) {
          operations.push({ args: [columns], method: "select", table });
          return query;
        },
        update(value: unknown) {
          operations.push({ args: [value], method: "update", table });
          return query;
        },
        upsert(value: unknown, upsertOptions: unknown) {
          operations.push({
            args: [value, upsertOptions],
            method: "upsert",
            table,
          });
          return query;
        },
      };
      return query;
    },
  };
}

function platformAccount(
  overrides: Partial<PlatformAccountRow> = {},
): PlatformAccountRow {
  return {
    id: "account-1",
    metadata: {},
    platform: "steam",
    platformUserId: "steam-user",
    updatedAt: "2026-06-15T11:00:00.000Z",
    userId,
    ...overrides,
  };
}

function providerResult(
  overrides: Partial<PlatformPollResult> = {},
): PlatformPollResult {
  return {
    currentGameTitle: "Half-Life 3",
    platform: "steam",
    platformGameId: "steam-42",
    source: "steam_web_api",
    status: "online",
    ...overrides,
  };
}

function presenceEvidence(): PresencePollRunEvidenceRecord {
  return {
    activity_inserted_count: 1,
    completed_at: fetchedAt,
    dry_run: false,
    forced: false,
    platforms: ["steam"],
    polled_count: 1,
    presence_updated_count: 1,
    provider_result_summary: {
      byPlatform: { steam: 1 },
      byStatus: { online: 1 },
      total: 1,
    },
    requested_user_count: 1,
    run_id: "presence-run-1",
    scanned_count: 1,
    skipped_count: 0,
    skipped_summary: {
      byPlatform: {},
      byReason: {},
      maxRetryAfterSeconds: 0,
      rateLimited: 0,
      total: 0,
    },
    started_at: fetchedAt,
    status: "completed",
    trigger_source: "scheduled",
  };
}
