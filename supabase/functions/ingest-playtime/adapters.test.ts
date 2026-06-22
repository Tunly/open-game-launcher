import {
  assertEquals,
  assertObjectMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { createIngestPlaytimeAdapters } from "./adapters.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const catalogGameId = "123e4567-e89b-42d3-a456-426614174000";
const secondGameId = "123e4567-e89b-42d3-a456-426614174001";

Deno.test("ingest playtime adapters authenticate via caller client without live Supabase secrets", async () => {
  const baseDeps = deps();
  const calls: unknown[] = [];
  const adapters = createIngestPlaytimeAdapters({
    ...baseDeps,
    createClient: (supabaseUrl, supabaseAnonKey, options) => {
      calls.push({ options, supabaseAnonKey, supabaseUrl });
      return {
        auth: {
          getUser: async () => ({
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
        getUser: async () => ({
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

Deno.test("ingest playtime adapters look up session id conflicts", async () => {
  const operations: Operation[] = [];
  const supabaseAdmin = supabaseStub({
    dataByTable: {
      game_sessions: [
        { id: "own-session", user_id: userId },
        { id: "other-session", user_id: otherUserId },
      ],
    },
    operations,
  });
  const adapters = createIngestPlaytimeAdapters({
    ...deps(),
    supabaseAdmin,
  });

  assertEquals(
    await adapters.findConflictingSessionIds(auth(supabaseAdmin), [
      "own-session",
      "other-session",
    ]),
    ["other-session"],
  );
  assertEquals(operations, [
    { args: ["game_sessions"], method: "from" },
    { args: ["id, user_id"], method: "select", table: "game_sessions" },
    {
      args: ["id", ["own-session", "other-session"]],
      method: "in",
      table: "game_sessions",
    },
  ]);
});

Deno.test("ingest playtime adapters upsert aggregate stats", async () => {
  const operations: Operation[] = [];
  const supabaseAdmin = supabaseStub({ operations });
  const adapters = createIngestPlaytimeAdapters({
    ...deps(),
    supabaseAdmin,
  });

  await adapters.upsertAggregate(auth(supabaseAdmin), {
    firstPlayedAt: "2026-06-10T10:00:00.000Z",
    gameId: catalogGameId,
    installedVersion: "1.2.3",
    lastPlayedAt: "2026-06-15T10:00:00.000Z",
    playtimeMinutes: 42,
    totalSessions: 3,
  });

  assertEquals(operations[0], {
    args: ["user_game_stats"],
    method: "from",
  });
  const upsert = operations[1];
  assertEquals(upsert.method, "upsert");
  assertEquals(upsert.table, "user_game_stats");
  assertObjectMatch(upsert.args[0] as Record<string, unknown>, {
    first_played_at: "2026-06-10T10:00:00.000Z",
    game_id: catalogGameId,
    installed_version: "1.2.3",
    last_played_at: "2026-06-15T10:00:00.000Z",
    playtime_minutes: 42,
    total_sessions: 3,
    user_id: userId,
  });
  assertEquals(
    typeof (upsert.args[0] as Record<string, unknown>).updated_at,
    "string",
  );
  assertEquals(upsert.args[1], { onConflict: "user_id,game_id" });
});

Deno.test("ingest playtime adapters insert session rows", async () => {
  const operations: Operation[] = [];
  const supabaseAdmin = supabaseStub({ operations });
  const adapters = createIngestPlaytimeAdapters({
    ...deps(),
    supabaseAdmin,
  });

  await adapters.upsertSessions(auth(supabaseAdmin), [
    {
      durationMinutes: 60,
      endedAt: "2026-06-15T11:00:00.000Z",
      gameId: catalogGameId,
      id: "session-1",
      launcherDeviceId: "device-1",
      platform: "linux",
      startedAt: "2026-06-15T10:00:00.000Z",
    },
  ]);

  assertEquals(operations, [
    { args: ["game_sessions"], method: "from" },
    {
      args: [[
        {
          duration_minutes: 60,
          ended_at: "2026-06-15T11:00:00.000Z",
          game_id: catalogGameId,
          id: "session-1",
          launcher_device_id: "device-1",
          platform: "linux",
          started_at: "2026-06-15T10:00:00.000Z",
          user_id: userId,
        },
      ]],
      method: "insert",
      table: "game_sessions",
    },
  ]);
});

Deno.test("ingest playtime adapters surface Supabase errors", async () => {
  const supabaseAdmin = supabaseStub({
    errorByTable: {
      games: { message: "catalog read failed" },
    },
  });
  const adapters = createIngestPlaytimeAdapters({
    ...deps(),
    supabaseAdmin,
  });

  let thrown: unknown;
  try {
    await adapters.findMissingCatalogGames(auth(supabaseAdmin), [
      catalogGameId,
    ]);
  } catch (error) {
    thrown = error;
  }

  assertEquals(thrown, { message: "catalog read failed" });
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
        getUser: async () => ({ data: { user: { id: userId } }, error: null }),
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

function supabaseStub(options: {
  dataByTable?: Record<string, unknown[]>;
  errorByTable?: Record<string, { message?: string } | null>;
  operations?: Operation[];
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
        insert(value: unknown) {
          operations.push({ args: [value], method: "insert", table });
          return Promise.resolve(result());
        },
        select(columns: string) {
          operations.push({ args: [columns], method: "select", table });
          return query;
        },
        upsert(value: unknown, options?: unknown) {
          operations.push({
            args: options === undefined ? [value] : [value, options],
            method: "upsert",
            table,
          });
          return Promise.resolve(result());
        },
      };
      return query;
    },
  };
}
