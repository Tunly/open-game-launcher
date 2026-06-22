import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { createRequestAccountDeletionAdapters } from "./adapters.ts";
import type {
  CreateDeletionRequestInput,
  DeletionRequestRow,
} from "./handler.ts";

const userId = "11111111-1111-4111-8111-111111111111";

Deno.test("request account deletion adapters bridge auth responses and user ids", async () => {
  const unauthorized = new Response(
    JSON.stringify({ error: "Invalid or expired session." }),
    { status: 401 },
  );
  const adapters = createRequestAccountDeletionAdapters({
    authenticateRequest: async (request) =>
      request.headers.has("Authorization")
        ? { user: { id: userId } }
        : unauthorized,
    supabaseAdmin: supabaseStub(),
  });

  assertEquals(
    await adapters.authenticateRequest(new Request("https://example.test")),
    unauthorized,
  );
  assertEquals(
    await adapters.authenticateRequest(
      new Request("https://example.test", {
        headers: { Authorization: "Bearer user-jwt" },
      }),
    ),
    { userId },
  );
});

Deno.test("request account deletion adapters read active pending or processing requests", async () => {
  const operations: Operation[] = [];
  const active = deletionRow({ status: "processing" });
  const adapters = createRequestAccountDeletionAdapters({
    authenticateRequest: async () => ({ user: { id: userId } }),
    supabaseAdmin: supabaseStub({
      dataByMethod: { maybeSingle: active },
      operations,
    }),
  });

  assertEquals(await adapters.findActiveRequest(userId), active);
  assertEquals(operations, [
    { args: ["account_deletion_requests"], method: "from" },
    { args: ["*"], method: "select", table: "account_deletion_requests" },
    {
      args: ["user_id", userId],
      method: "eq",
      table: "account_deletion_requests",
    },
    {
      args: ["status", ["pending", "processing"]],
      method: "in",
      table: "account_deletion_requests",
    },
    { args: [], method: "maybeSingle", table: "account_deletion_requests" },
  ]);
});

Deno.test("request account deletion adapters create sanitized owner-scoped requests", async () => {
  const operations: Operation[] = [];
  const created = deletionRow({ reason: "leaving", status: "pending" });
  const adapters = createRequestAccountDeletionAdapters({
    authenticateRequest: async () => ({ user: { id: userId } }),
    supabaseAdmin: supabaseStub({
      dataByMethod: { single: created },
      operations,
    }),
  });
  const input: CreateDeletionRequestInput = {
    reason: "leaving",
    requestMetadata: {
      source: "edge-function",
      user_agent: "OG Launcher Test",
    },
    userId,
  };

  assertEquals(await adapters.createDeletionRequest(input), created);
  assertEquals(operations, [
    { args: ["account_deletion_requests"], method: "from" },
    {
      args: [
        {
          reason: "leaving",
          request_metadata: {
            source: "edge-function",
            user_agent: "OG Launcher Test",
          },
          user_id: userId,
        },
      ],
      method: "insert",
      table: "account_deletion_requests",
    },
    { args: ["*"], method: "select", table: "account_deletion_requests" },
    { args: [], method: "single", table: "account_deletion_requests" },
  ]);
  assertEquals(JSON.stringify(operations).includes("Authorization"), false);
});

Deno.test("request account deletion adapters preserve Supabase error objects", async () => {
  const conflict = { code: "23505", message: "duplicate active request" };
  const createAdapters = createRequestAccountDeletionAdapters({
    authenticateRequest: async () => ({ user: { id: userId } }),
    supabaseAdmin: supabaseStub({
      errorByMethod: { single: conflict },
    }),
  });

  let thrownConflict: unknown = null;
  try {
    await createAdapters.createDeletionRequest({
      reason: null,
      requestMetadata: {
        source: "edge-function",
        user_agent: null,
      },
      userId,
    });
  } catch (error) {
    thrownConflict = error;
  }
  assertEquals(thrownConflict, conflict);

  const readError = new Error("read failed");
  const readAdapters = createRequestAccountDeletionAdapters({
    authenticateRequest: async () => ({ user: { id: userId } }),
    supabaseAdmin: supabaseStub({
      errorByMethod: { maybeSingle: readError },
    }),
  });
  await assertRejects(
    () => readAdapters.findActiveRequest(userId),
    Error,
    "read failed",
  );
});

type Operation = {
  args: unknown[];
  method: string;
  table?: string;
};

function supabaseStub(options: {
  dataByMethod?: Record<string, unknown>;
  errorByMethod?: Record<string, unknown>;
  operations?: Operation[];
} = {}) {
  const operations = options.operations ?? [];
  return {
    from: (table: string) => {
      operations.push({ args: [table], method: "from" });
      const result = (method: string) => ({
        data: options.dataByMethod?.[method] ?? null,
        error: options.errorByMethod?.[method] ?? null,
      });
      const query = {
        eq(column: string, value: string) {
          operations.push({ args: [column, value], method: "eq", table });
          return query;
        },
        in(column: string, values: string[]) {
          operations.push({ args: [column, values], method: "in", table });
          return query;
        },
        insert(value: unknown) {
          operations.push({ args: [value], method: "insert", table });
          return query;
        },
        maybeSingle() {
          operations.push({ args: [], method: "maybeSingle", table });
          return Promise.resolve(result("maybeSingle"));
        },
        select(columns: string) {
          operations.push({ args: [columns], method: "select", table });
          return query;
        },
        single() {
          operations.push({ args: [], method: "single", table });
          return Promise.resolve(result("single"));
        },
      };
      return query;
    },
  };
}

function deletionRow(
  overrides: Partial<DeletionRequestRow> = {},
): DeletionRequestRow {
  return {
    cancelled_at: null,
    completed_at: null,
    created_at: "2026-06-15T12:00:00.000Z",
    id: "22222222-2222-4222-8222-222222222222",
    reason: null,
    requested_at: "2026-06-15T12:00:00.000Z",
    scheduled_at: "2026-07-15T12:00:00.000Z",
    status: "pending",
    updated_at: "2026-06-15T12:00:00.000Z",
    user_id: userId,
    ...overrides,
  };
}
