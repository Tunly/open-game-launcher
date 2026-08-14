import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  buildExportPayload,
  type ExportUserDataHandlerDeps,
  handleExportUserData,
  type JsonObject,
} from "./handler.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const generatedAt = "2026-06-15T13:00:00.000Z";

Deno.test("export user data handler answers CORS and method guards", async () => {
  const deps = stubDeps();
  const optionsResponse = await handleExportUserData(
    new Request("https://functions.example/export-user-data", {
      method: "OPTIONS",
    }),
    deps,
  );

  assertEquals(optionsResponse.status, 200);
  assertEquals(optionsResponse.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(
    optionsResponse.headers.get("Access-Control-Allow-Methods"),
    "GET, POST, OPTIONS",
  );

  const deleteResponse = await handleExportUserData(
    new Request("https://functions.example/export-user-data", {
      method: "DELETE",
    }),
    deps,
  );

  assertEquals(deleteResponse.status, 405);
  assertEquals(await deleteResponse.json(), {
    error: "Method not allowed.",
  });
});

Deno.test("export user data handler requires caller auth before reads", async () => {
  const reads: string[] = [];
  const response = await handleExportUserData(
    new Request("https://functions.example/export-user-data", {
      headers: { Authorization: "Bearer expired" },
      method: "GET",
    }),
    stubDeps({
      authResponse: new Response(
        JSON.stringify({ error: "Invalid or expired session." }),
        { status: 401 },
      ),
      reads,
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(await response.json(), {
    error: "Invalid or expired session.",
  });
  assertEquals(reads, []);
});

Deno.test(
  "export user data payload includes dependent family reads",
  async () => {
    const reads: string[] = [];
    const inReads: Array<{ column: string; table: string; values: string[] }> =
      [];
    const orReads: string[] = [];
    const payload = await buildExportPayload(
      user(),
      payloadDeps({
        inReads,
        orReads,
        reads,
        rowsByTable: {
          family_groups: [{ id: "family-1" }],
          family_members: [
            { family_id: "family-2", id: "membership-1" },
            { family_id: "family-1", id: "membership-2" },
          ],
          friend_links: [{ id: "friend-link-1" }],
          profiles: [{ id: userId, username: "og-user" }],
          store_products: [{ id: "product-1" }],
        },
        rowsByInTable: {
          family_shared_games: [{ family_id: "family-2", id: "shared-1" }],
        },
        rowsByOrTable: {
          friendships: [{ id: "friendship-1" }],
          game_invites: [{ id: "invite-1" }],
        },
      }),
    );

    assertEquals(payload.generatedAt, generatedAt);
    assertEquals(payload.user, {
      appMetadata: { role: "player" },
      createdAt: "2026-06-01T10:00:00.000Z",
      email: "player@example.test",
      id: userId,
      lastSignInAt: "2026-06-15T12:00:00.000Z",
      userMetadata: { nickname: "Player" },
    });
    assertEquals(payload.data.profiles, [{ id: userId, username: "og-user" }]);
    assertEquals(payload.data.friend_links, [{ id: "friend-link-1" }]);
    assertEquals(payload.data.store_products, [{ id: "product-1" }]);
    assertEquals(payload.data.family_shared_games, [
      { family_id: "family-2", id: "shared-1" },
    ]);
    assertEquals(payload.data.friendships, [{ id: "friendship-1" }]);
    assertEquals(payload.data.game_invites, [{ id: "invite-1" }]);
    assertEquals(payload.data.__warnings, []);

    assertEquals(reads.includes(`profiles.id.${userId}`), true);
    assertEquals(reads.includes(`store_products.developer_id.${userId}`), true);
    assertEquals(reads.includes(`mods.user_id.${userId}`), false);
    assertEquals(reads.includes(`store_orders.user_id.${userId}`), false);
    assertEquals(orReads, [
      `friendships:requester_id.eq.${userId},addressee_id.eq.${userId}`,
      `profile_comments:profile_user_id.eq.${userId},author_id.eq.${userId}`,
      `game_invites:sender_id.eq.${userId},receiver_id.eq.${userId}`,
    ]);
    assertEquals(
      reads.includes(`user_blocks.blocker_id.${userId}`),
      true,
    );
    assertEquals(inReads, [
      {
        column: "family_id",
        table: "family_shared_games",
        values: ["family-1", "family-2"],
      },
    ]);
  },
);

Deno.test("export user data excludes incoming block rows and their private reason", async () => {
  const incomingBlockerId = "22222222-2222-4222-8222-222222222222";
  const outgoingBlock = {
    blocked_id: "33333333-3333-4333-8333-333333333333",
    blocker_id: userId,
    id: "outgoing-block",
    reason: "my exportable reason",
  };
  const payload = await buildExportPayload(
    user(),
    payloadDeps({
      rowsByTable: {
        user_blocks: [
          outgoingBlock,
          {
            blocked_id: userId,
            blocker_id: incomingBlockerId,
            id: "incoming-block",
            reason: "incoming blocker's private reason",
          },
        ],
      },
    }),
  );

  assertEquals(payload.data.user_blocks, [outgoingBlock]);
});

Deno.test("export user data payload carries read warnings", async () => {
  const payload = await buildExportPayload(
    { ...user(), app_metadata: "invalid", user_metadata: null },
    payloadDeps({
      warningTables: new Set(["profiles", "store_products"]),
    }),
  );

  assertEquals(payload.user.appMetadata, {});
  assertEquals(payload.user.userMetadata, {});
  assertEquals(payload.data.__warnings, [
    "Skipped missing table profiles.",
    "Skipped missing table store_products.",
  ]);
});

function user() {
  return {
    app_metadata: { role: "player" },
    created_at: "2026-06-01T10:00:00.000Z",
    email: "player@example.test",
    id: userId,
    last_sign_in_at: "2026-06-15T12:00:00.000Z",
    user_metadata: { nickname: "Player" },
  };
}

function stubDeps(
  options: {
    authResponse?: Response;
    inReads?: Array<{ column: string; table: string; values: string[] }>;
    orReads?: string[];
    reads?: string[];
    rowsByInTable?: Record<string, JsonObject[]>;
    rowsByOrTable?: Record<string, JsonObject[]>;
    rowsByTable?: Record<string, JsonObject[]>;
    warningTables?: Set<string>;
  } = {},
): ExportUserDataHandlerDeps {
  return {
    authenticateRequest: async () => options.authResponse ?? { user: user() },
    now: () => new Date(generatedAt),
    readRows: async (table, column, value, warnings) => {
      options.reads?.push(`${table}.${column}.${value}`);
      if (options.warningTables?.has(table)) {
        warnings.push(`Skipped missing table ${table}.`);
        return [];
      }
      return options.rowsByTable?.[table] ?? [];
    },
    readRowsIn: async (table, column, values, warnings) => {
      options.inReads?.push({ column, table, values });
      if (options.warningTables?.has(table)) {
        warnings.push(`Skipped missing table ${table}.`);
        return [];
      }
      return options.rowsByInTable?.[table] ?? [];
    },
    readRowsWithOr: async (table, filter, warnings) => {
      options.orReads?.push(`${table}:${filter}`);
      if (options.warningTables?.has(table)) {
        warnings.push(`Skipped missing table ${table}.`);
        return [];
      }
      return options.rowsByOrTable?.[table] ?? [];
    },
  };
}

function payloadDeps(
  options: Parameters<typeof stubDeps>[0],
): Omit<ExportUserDataHandlerDeps, "authenticateRequest"> {
  const { authenticateRequest: _authenticateRequest, ...deps } = stubDeps(
    options,
  );
  return deps;
}
