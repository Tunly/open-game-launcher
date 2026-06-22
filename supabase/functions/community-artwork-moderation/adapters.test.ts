import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { createCommunityArtworkModerationAdapters } from "./adapters.ts";
import type { CommunityArtworkScanPacket } from "./scan-policy.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const artworkId = "22222222-2222-4222-8222-222222222222";

Deno.test("community artwork moderation adapters authenticate without service-role secrets", async () => {
  const calls: unknown[] = [];
  const adapters = createCommunityArtworkModerationAdapters({
    ...deps(),
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

  assertEquals(
    await adapters.getUserId(new Request("https://example.test")),
    null,
  );
  assertEquals(
    await adapters.getUserId(
      new Request("https://example.test", {
        headers: { Authorization: "Bearer user-jwt" },
      }),
    ),
    userId,
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

Deno.test("community artwork moderation adapters read private active moderator roles", async () => {
  const operations: Operation[] = [];
  const adapters = createCommunityArtworkModerationAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      dataByMethod: { maybeSingle: { role: "lead_moderator" } },
      operations,
    }),
  });

  assertEquals(await adapters.getActiveModeratorRole(userId), "lead_moderator");
  assertEquals(operations, [
    { args: ["private"], method: "schema" },
    {
      args: ["community_artwork_moderators"],
      method: "from",
      schema: "private",
    },
    {
      args: ["role"],
      method: "select",
      schema: "private",
      table: "community_artwork_moderators",
    },
    {
      args: ["user_id", userId],
      method: "eq",
      schema: "private",
      table: "community_artwork_moderators",
    },
    {
      args: ["active", true],
      method: "eq",
      schema: "private",
      table: "community_artwork_moderators",
    },
    {
      args: [],
      method: "maybeSingle",
      schema: "private",
      table: "community_artwork_moderators",
    },
  ]);
});

Deno.test("community artwork moderation adapters map moderator allowlist read errors", async () => {
  const missingAdapters = createCommunityArtworkModerationAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({ dataByMethod: { maybeSingle: null } }),
  });
  assertEquals(await missingAdapters.getActiveModeratorRole(userId), null);

  const errorAdapters = createCommunityArtworkModerationAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      errorByMethod: { maybeSingle: { message: "permission denied" } },
    }),
  });
  await assertRejects(
    () => errorAdapters.getActiveModeratorRole(userId),
    Error,
    "Failed to read moderator allowlist: permission denied",
  );
});

Deno.test("community artwork moderation adapters read artwork scan rows", async () => {
  const operations: Operation[] = [];
  const row = {
    artist_name: "Panel Team",
    description: "Original upload",
    game_id: "steam-42",
    id: artworkId,
    kind: "cover",
    moderation_status: "pending",
    report_count: 2,
    source_url: "https://media.rawg.io/media/games/logo.png",
    storage_path: "user-1/games/steam-42/cover.png",
    tags: ["cover"],
    title: "Launch Cover",
  };
  const adapters = createCommunityArtworkModerationAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      dataByMethod: { maybeSingle: row },
      operations,
    }),
  });

  assertEquals(await adapters.readArtworkForScan(artworkId), row);
  assertEquals(operations, [
    { args: ["community_artwork_items"], method: "from" },
    {
      args: [
        "id, game_id, kind, title, artist_name, description, source_url, storage_path, tags, moderation_status, report_count",
      ],
      method: "select",
      table: "community_artwork_items",
    },
    {
      args: ["id", artworkId],
      method: "eq",
      table: "community_artwork_items",
    },
    {
      args: [],
      method: "maybeSingle",
      table: "community_artwork_items",
    },
  ]);
});

Deno.test("community artwork moderation adapters map artwork scan read errors", async () => {
  const adapters = createCommunityArtworkModerationAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      errorByMethod: { maybeSingle: { message: "artwork read failed" } },
    }),
  });

  await assertRejects(
    () => adapters.readArtworkForScan(artworkId),
    Error,
    "Failed to read community artwork: artwork read failed",
  );
});

Deno.test("community artwork moderation adapters delegate queue and scan RPC calls", async () => {
  const operations: Operation[] = [];
  const adapters = createCommunityArtworkModerationAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      dataByRpc: {
        list_community_artwork_moderation_queue: [{ id: artworkId }],
        scan_community_artwork: { scan_id: "scan-1" },
      },
      operations,
    }),
  });
  const packet: CommunityArtworkScanPacket = {
    metadata: { policyVersion: "test" },
    scanner: "policy_v1",
    signals: ["existing-report-context"],
    summary: "Needs review.",
    verdict: "needs_review",
  };

  assertEquals(
    await adapters.callModerationRpc(
      "list_community_artwork_moderation_queue",
      { p_limit: 25, p_status: "pending" },
    ),
    { data: [{ id: artworkId }], error: null },
  );
  assertEquals(
    await adapters.scanCommunityArtwork(artworkId, packet),
    { data: { scan_id: "scan-1" }, error: null },
  );
  assertEquals(operations, [
    {
      args: [
        "list_community_artwork_moderation_queue",
        { p_limit: 25, p_status: "pending" },
      ],
      method: "rpc",
    },
    {
      args: [
        "scan_community_artwork",
        {
          p_artwork_id: artworkId,
          p_metadata: { policyVersion: "test" },
          p_scanner: "policy_v1",
          p_signals: ["existing-report-context"],
          p_summary: "Needs review.",
          p_verdict: "needs_review",
        },
      ],
      method: "rpc",
    },
  ]);
});

Deno.test("community artwork moderation adapters return RPC errors as handler errors", async () => {
  const adapters = createCommunityArtworkModerationAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      errorByRpc: {
        review_community_artwork: { message: "review rejected" },
        scan_community_artwork: { message: "scan rejected" },
      },
    }),
  });
  const packet: CommunityArtworkScanPacket = {
    metadata: {},
    scanner: "policy_v1",
    signals: [],
    summary: "ok",
    verdict: "passed",
  };

  assertEquals(
    await adapters.callModerationRpc("review_community_artwork", {
      p_artwork_id: artworkId,
    }),
    { data: null, error: { message: "review rejected" } },
  );
  assertEquals(
    await adapters.scanCommunityArtwork(artworkId, packet),
    { data: null, error: { message: "scan rejected" } },
  );
});

type Operation = {
  args: unknown[];
  method: string;
  schema?: string;
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

function supabaseStub(options: {
  dataByMethod?: Record<string, unknown>;
  dataByRpc?: Record<string, unknown>;
  errorByMethod?: Record<string, { message?: string } | null>;
  errorByRpc?: Record<string, { message?: string } | null>;
  operations?: Operation[];
} = {}) {
  const operations = options.operations ?? [];
  const from = (table: string, schema?: string) => {
    operations.push(operation("from", [table], table, schema));
    const result = (method: string) => ({
      data: options.dataByMethod?.[method] ?? null,
      error: options.errorByMethod?.[method] ?? null,
    });
    const query = {
      eq(column: string, value: unknown) {
        operations.push(operation("eq", [column, value], table, schema));
        return query;
      },
      maybeSingle() {
        operations.push(operation("maybeSingle", [], table, schema));
        return Promise.resolve(result("maybeSingle"));
      },
      select(columns: string) {
        operations.push(operation("select", [columns], table, schema));
        return query;
      },
    };
    return query;
  };

  return {
    from: (table: string) => from(table),
    rpc: (name: string, args: Record<string, unknown>) => {
      operations.push({ args: [name, args], method: "rpc" });
      return Promise.resolve({
        data: options.dataByRpc?.[name] ?? null,
        error: options.errorByRpc?.[name] ?? null,
      });
    },
    schema: (schema: string) => {
      operations.push({ args: [schema], method: "schema" });
      return { from: (table: string) => from(table, schema) };
    },
  };
}

function operation(
  method: string,
  args: unknown[],
  table?: string,
  schema?: string,
): Operation {
  return {
    args,
    method,
    ...(schema ? { schema } : {}),
    ...(method !== "from" && table ? { table } : {}),
  };
}
