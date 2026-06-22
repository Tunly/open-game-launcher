import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { createExportUserDataAdapters } from "./adapters.ts";
import type { JsonObject } from "./handler.ts";

const userId = "11111111-1111-4111-8111-111111111111";

Deno.test("export user data adapters bridge auth responses and users", async () => {
  const calls: string[] = [];
  const unauthorized = new Response(
    JSON.stringify({ error: "Invalid or expired session." }),
    { status: 401 },
  );
  const adapters = createExportUserDataAdapters({
    adminClient: supabaseStub(),
    authenticateRequest: async (request) => {
      calls.push(request.url);
      return request.headers.has("Authorization")
        ? {
          user: {
            email: "player@example.test",
            id: userId,
          },
        }
        : unauthorized;
    },
  });

  assertEquals(
    await adapters.authenticateRequest(new Request("https://example.test")),
    unauthorized,
  );
  assertEquals(
    await adapters.authenticateRequest(
      new Request("https://example.test/export", {
        headers: { Authorization: "Bearer user-jwt" },
      }),
    ),
    {
      user: {
        email: "player@example.test",
        id: userId,
      },
    },
  );
  assertEquals(calls, [
    "https://example.test/",
    "https://example.test/export",
  ]);
});

Deno.test("export user data adapters read owner-scoped rows by equality", async () => {
  const operations: Operation[] = [];
  const adapters = createExportUserDataAdapters({
    adminClient: supabaseStub({
      dataByTable: { profiles: [{ id: userId, username: "og-user" }] },
      operations,
    }),
    authenticateRequest: async () => ({ user: { id: userId } }),
  });
  const warnings: string[] = [];

  assertEquals(
    await adapters.readRows("profiles", "id", userId, warnings),
    [{ id: userId, username: "og-user" }],
  );
  assertEquals(warnings, []);
  assertEquals(operations, [
    { args: ["profiles"], method: "from" },
    { args: ["*"], method: "select", table: "profiles" },
    { args: ["id", userId], method: "eq", table: "profiles" },
  ]);
});

Deno.test("export user data adapters read dependent rows with in filters", async () => {
  const operations: Operation[] = [];
  const adapters = createExportUserDataAdapters({
    adminClient: supabaseStub({
      dataByTable: { store_order_items: [{ id: "item-1" }] },
      operations,
    }),
    authenticateRequest: async () => ({ user: { id: userId } }),
  });
  const warnings: string[] = [];

  assertEquals(
    await adapters.readRowsIn(
      "store_order_items",
      "order_id",
      ["order-1", "order-2"],
      warnings,
    ),
    [{ id: "item-1" }],
  );
  assertEquals(warnings, []);
  assertEquals(operations, [
    { args: ["store_order_items"], method: "from" },
    { args: ["*"], method: "select", table: "store_order_items" },
    {
      args: ["order_id", ["order-1", "order-2"]],
      method: "in",
      table: "store_order_items",
    },
  ]);
});

Deno.test("export user data adapters skip empty in filters without Supabase reads", async () => {
  const operations: Operation[] = [];
  const adapters = createExportUserDataAdapters({
    adminClient: supabaseStub({ operations }),
    authenticateRequest: async () => ({ user: { id: userId } }),
  });

  assertEquals(
    await adapters.readRowsIn("mod_files", "mod_version_id", [], []),
    [],
  );
  assertEquals(operations, []);
});

Deno.test("export user data adapters read bidirectional rows with exact or filters", async () => {
  const operations: Operation[] = [];
  const adapters = createExportUserDataAdapters({
    adminClient: supabaseStub({
      dataByTable: { friendships: [{ id: "friendship-1" }] },
      operations,
    }),
    authenticateRequest: async () => ({ user: { id: userId } }),
  });
  const warnings: string[] = [];
  const filter = `requester_id.eq.${userId},addressee_id.eq.${userId}`;

  assertEquals(
    await adapters.readRowsWithOr("friendships", filter, warnings),
    [{ id: "friendship-1" }],
  );
  assertEquals(warnings, []);
  assertEquals(operations, [
    { args: ["friendships"], method: "from" },
    { args: ["*"], method: "select", table: "friendships" },
    { args: [filter], method: "or", table: "friendships" },
  ]);
});

Deno.test("export user data adapters map missing relations to warnings", async () => {
  const adapters = createExportUserDataAdapters({
    adminClient: supabaseStub({
      errorByTable: {
        missing_by_postgres: Object.assign(new Error("relation missing"), {
          code: "42P01",
        }),
        missing_by_postgrest: Object.assign(new Error("schema cache missing"), {
          code: "PGRST205",
        }),
      },
    }),
    authenticateRequest: async () => ({ user: { id: userId } }),
  });
  const warnings: string[] = [];

  assertEquals(
    await adapters.readRows("missing_by_postgres", "user_id", userId, warnings),
    [],
  );
  assertEquals(
    await adapters.readRowsIn(
      "missing_by_postgrest",
      "owner_id",
      [userId],
      warnings,
    ),
    [],
  );
  assertEquals(warnings, [
    "Skipped missing table missing_by_postgres.",
    "Skipped missing table missing_by_postgrest.",
  ]);
});

Deno.test("export user data adapters reject non-missing Supabase errors", async () => {
  const adapters = createExportUserDataAdapters({
    adminClient: supabaseStub({
      errorByTable: {
        profiles: Object.assign(new Error("permission denied"), {
          code: "42501",
        }),
      },
    }),
    authenticateRequest: async () => ({ user: { id: userId } }),
  });

  await assertRejects(
    () => adapters.readRows("profiles", "id", userId, []),
    Error,
    "permission denied",
  );
});

type Operation = {
  args: unknown[];
  method: string;
  table?: string;
};

function supabaseStub(options: {
  dataByTable?: Record<string, JsonObject[] | null>;
  errorByTable?: Record<string, (Error & { code?: string }) | null>;
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
        eq(column: string, value: string) {
          operations.push({ args: [column, value], method: "eq", table });
          return Promise.resolve(result());
        },
        in(column: string, values: string[]) {
          operations.push({ args: [column, values], method: "in", table });
          return Promise.resolve(result());
        },
        or(filter: string) {
          operations.push({ args: [filter], method: "or", table });
          return Promise.resolve(result());
        },
        select(columns: string) {
          operations.push({ args: [columns], method: "select", table });
          return query;
        },
      };
      return query;
    },
  };
}
