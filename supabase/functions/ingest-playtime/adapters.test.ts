// deno-lint-ignore-file no-import-prefix
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { createIngestPlaytimeAdapters } from "./adapters.ts";
import type { NormalizedPlaytimeIngestion } from "./playtime-ingestion.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const catalogGameId = "123e4567-e89b-42d3-a456-426614174000";
const secondGameId = "123e4567-e89b-42d3-a456-426614174001";
const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const payloadConflictSessionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const launcherDeviceId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const aggregateOperationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const observedAt = "2026-06-15T12:00:00.000Z";

Deno.test("ingest playtime adapters authenticate via caller client without live Supabase secrets", async () => {
  const baseDeps = deps();
  const calls: unknown[] = [];
  const adapters = createIngestPlaytimeAdapters({
    ...baseDeps,
    createClient: (supabaseUrl, supabaseAnonKey, options) => {
      calls.push({ options, supabaseAnonKey, supabaseUrl });
      return {
        auth: {
          getUser: () =>
            Promise.resolve({
              data: { user: { id: userId } },
              error: null,
            }),
        },
      };
    },
  });

  const missingBearer = await adapters.authenticateRequest(
    new Request("https://example.test"),
  );
  assertEquals(missingBearer instanceof Response, true);
  assertEquals((missingBearer as Response).status, 401);
  assertEquals(await (missingBearer as Response).json(), {
    error: "Missing Authorization bearer token.",
  });

  const anonToken = await adapters.authenticateRequest(
    new Request("https://example.test", {
      headers: { Authorization: "Bearer anon-test" },
    }),
  );
  assertEquals(anonToken instanceof Response, true);
  assertEquals((anonToken as Response).status, 401);
  assertEquals(await (anonToken as Response).json(), {
    error: "Sign in required.",
  });

  assertEquals(
    await adapters.authenticateRequest(
      new Request("https://example.test", {
        headers: { Authorization: "Bearer user-jwt" },
      }),
    ),
    { adminClient: baseDeps.supabaseAdmin, userId },
  );
  assertEquals(calls, [
    {
      options: {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: "Bearer user-jwt" } },
      },
      supabaseAnonKey: "anon-test",
      supabaseUrl: "https://supabase.test",
    },
  ]);
});

Deno.test("ingest playtime adapters reject invalid caller auth", async () => {
  const adapters = createIngestPlaytimeAdapters({
    ...deps(),
    createClient: () => ({
      auth: {
        getUser: () =>
          Promise.resolve({
            data: { user: null },
            error: { message: "bad jwt" },
          }),
      },
    }),
  });

  const response = await adapters.authenticateRequest(
    new Request("https://example.test", {
      headers: { Authorization: "Bearer user-jwt" },
    }),
  );

  assertEquals(response instanceof Response, true);
  assertEquals((response as Response).status, 401);
  assertEquals(await (response as Response).json(), {
    error: "Invalid or expired session.",
  });
});

Deno.test("ingest playtime adapters look up missing catalog games", async () => {
  const operations: Operation[] = [];
  const supabaseAdmin = supabaseStub({
    dataByTable: {
      games: [{ id: catalogGameId }],
    },
    operations,
  });
  const adapters = createIngestPlaytimeAdapters({
    ...deps(),
    supabaseAdmin,
  });

  assertEquals(
    await adapters.findMissingCatalogGames(auth(supabaseAdmin), [
      catalogGameId,
      secondGameId,
    ]),
    [secondGameId],
  );
  assertEquals(operations, [
    { args: ["games"], method: "from" },
    { args: ["id"], method: "select", table: "games" },
    {
      args: ["id", [catalogGameId, secondGameId]],
      method: "in",
      table: "games",
    },
  ]);
});

Deno.test("ingest playtime adapters compare catalog UUIDs canonically", async () => {
  const supabaseAdmin = supabaseStub({
    dataByTable: {
      games: [{ id: catalogGameId }],
    },
  });
  const adapters = createIngestPlaytimeAdapters({
    ...deps(),
    supabaseAdmin,
  });

  assertEquals(
    await adapters.findMissingCatalogGames(auth(supabaseAdmin), [
      catalogGameId.toUpperCase(),
    ]),
    [],
  );
});

Deno.test("ingest playtime adapters send aggregate and sessions through one atomic RPC", async () => {
  const operations: Operation[] = [];
  const supabaseAdmin = supabaseStub({
    operations,
    rpcData: [{
      accepted: true,
      aggregate_pushed: true,
      owner_conflict_session_ids: [],
      payload_conflict_session_ids: [],
      sessions_pushed: 1,
    }],
  });
  const adapters = createIngestPlaytimeAdapters({
    ...deps(),
    supabaseAdmin,
  });

  assertEquals(
    await adapters.ingestPlaytime(auth(supabaseAdmin), ingestion()),
    {
      accepted: true,
      aggregatePushed: true,
      ownerConflictSessionIds: [],
      payloadConflictSessionIds: [],
      sessionsPushed: 1,
    },
  );
  assertEquals(operations, [
    {
      args: [
        "ingest_trusted_playtime",
        {
          p_aggregate: {
            first_played_at: "2026-06-10T10:00:00.000Z",
            game_id: catalogGameId,
            installed_version: "1.2.3",
            last_played_at: "2026-06-15T11:00:00.000Z",
            observed_at: observedAt,
            operation: "snapshot",
            operation_id: aggregateOperationId,
            playtime_minutes: 42,
            session_count_delta: 3,
          },
          p_authenticated_user_id: userId,
          p_sessions: [{
            duration_minutes: 60,
            ended_at: "2026-06-15T11:00:00.000Z",
            game_id: catalogGameId,
            id: sessionId,
            launcher_device_id: launcherDeviceId,
            platform: "linux",
            started_at: "2026-06-15T10:00:00.000Z",
          }],
        },
      ],
      method: "rpc",
    },
  ]);
});

Deno.test("ingest playtime adapters preserve RPC conflict classifications", async () => {
  const operations: Operation[] = [];
  const supabaseAdmin = supabaseStub({
    operations,
    rpcData: [{
      accepted: false,
      aggregate_pushed: false,
      owner_conflict_session_ids: [sessionId],
      payload_conflict_session_ids: [payloadConflictSessionId],
      sessions_pushed: 0,
    }],
  });
  const adapters = createIngestPlaytimeAdapters({
    ...deps(),
    supabaseAdmin,
  });

  assertEquals(
    await adapters.ingestPlaytime(auth(supabaseAdmin), ingestion()),
    {
      accepted: false,
      aggregatePushed: false,
      ownerConflictSessionIds: [sessionId],
      payloadConflictSessionIds: [payloadConflictSessionId],
      sessionsPushed: 0,
    },
  );
  assertEquals(operations.length, 1);
  assertEquals(operations[0].method, "rpc");
});

Deno.test("ingest playtime adapters surface RPC failures and malformed results", async () => {
  const rpcError = { message: "transaction failed" };
  const failedAdmin = supabaseStub({ rpcError });
  const failedAdapters = createIngestPlaytimeAdapters({
    ...deps(),
    supabaseAdmin: failedAdmin,
  });

  let thrown: unknown;
  try {
    await failedAdapters.ingestPlaytime(auth(failedAdmin), ingestion());
  } catch (error) {
    thrown = error;
  }
  assertEquals(thrown, rpcError);

  const malformedAdmin = supabaseStub({ rpcData: [] });
  const malformedAdapters = createIngestPlaytimeAdapters({
    ...deps(),
    supabaseAdmin: malformedAdmin,
  });
  await assertRejects(
    () => malformedAdapters.ingestPlaytime(auth(malformedAdmin), ingestion()),
    Error,
    "Invalid ingest_trusted_playtime RPC response.",
  );
});

type Operation = {
  args: unknown[];
  method: string;
  table?: string;
};

function deps() {
  return {
    createClient: () => ({
      auth: {
        getUser: () =>
          Promise.resolve({
            data: { user: { id: userId } },
            error: null,
          }),
      },
    }),
    supabaseAdmin: supabaseStub(),
    supabaseAnonKey: "anon-test",
    supabaseUrl: "https://supabase.test",
  };
}

function auth(adminClient: unknown) {
  return {
    adminClient,
    userId,
  };
}

function ingestion(): NormalizedPlaytimeIngestion {
  return {
    aggregate: {
      firstPlayedAt: "2026-06-10T10:00:00.000Z",
      gameId: catalogGameId,
      installedVersion: "1.2.3",
      lastPlayedAt: "2026-06-15T11:00:00.000Z",
      observedAt,
      operation: "snapshot",
      operationId: aggregateOperationId,
      playtimeMinutes: 42,
      sessionCountDelta: 3,
    },
    sessions: [{
      durationMinutes: 60,
      endedAt: "2026-06-15T11:00:00.000Z",
      gameId: catalogGameId,
      id: sessionId,
      launcherDeviceId,
      platform: "linux",
      startedAt: "2026-06-15T10:00:00.000Z",
    }],
  };
}

function supabaseStub(options: {
  dataByTable?: Record<string, unknown[]>;
  errorByTable?: Record<string, { message?: string } | null>;
  operations?: Operation[];
  rpcData?: unknown;
  rpcError?: { message?: string } | null;
} = {}) {
  const operations = options.operations ?? [];
  return {
    from: (table: string) => {
      operations.push({ args: [table], method: "from" });
      const result = () => ({
        data: options.dataByTable?.[table] ?? null,
        error: options.errorByTable?.[table] ?? null,
      });
      const query = {
        in(column: string, values: unknown[]) {
          operations.push({ args: [column, values], method: "in", table });
          return Promise.resolve(result());
        },
        select(columns: string) {
          operations.push({ args: [columns], method: "select", table });
          return query;
        },
      };
      return query;
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      operations.push({ args: [name, args], method: "rpc" });
      return Promise.resolve({
        data: options.rpcData ?? null,
        error: options.rpcError ?? null,
      });
    },
  };
}
