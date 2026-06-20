import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { buildCancelAccountDeletionMutation } from "../_shared/account-deletion-contract.ts";
import { createCancelAccountDeletionAdapters } from "./adapters.ts";
import type { DeletionRequestRow } from "./handler.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const cancelledAt = "2026-06-15T12:30:00.000Z";

Deno.test("cancel account deletion adapters bridge auth responses and user ids", async () => {
  const unauthorized = new Response(
    JSON.stringify({ error: "Invalid or expired session." }),
    { status: 401 },
  );
  const adapters = createCancelAccountDeletionAdapters({
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

Deno.test("cancel account deletion adapters find pending requests with owner and status scope", async () => {
  const operations: Operation[] = [];
  const adapters = createCancelAccountDeletionAdapters({
    authenticateRequest: async () => ({ user: { id: userId } }),
    supabaseAdmin: supabaseStub({
      dataByMethod: { maybeSingle: { id: requestId } },
      operations,
    }),
  });

  assertEquals(await adapters.findPendingRequestId(userId), requestId);
  assertEquals(operations, [
    { args: ["account_deletion_requests"], method: "from" },
    { args: ["id"], method: "select", table: "account_deletion_requests" },
    {
      args: ["user_id", userId],
      method: "eq",
      table: "account_deletion_requests",
    },
    {
      args: ["status", "pending"],
      method: "eq",
      table: "account_deletion_requests",
    },
    { args: [], method: "maybeSingle", table: "account_deletion_requests" },
  ]);
});

Deno.test("cancel account deletion adapters return null when no pending request exists", async () => {
  const adapters = createCancelAccountDeletionAdapters({
    authenticateRequest: async () => ({ user: { id: userId } }),
    supabaseAdmin: supabaseStub({ dataByMethod: { maybeSingle: null } }),
  });

  assertEquals(await adapters.findPendingRequestId(userId), null);
});

Deno.test("cancel account deletion adapters apply pending-only cancel mutation", async () => {
  const operations: Operation[] = [];
  const cancelled = deletionRow({
    cancelled_at: cancelledAt,
    status: "cancelled",
  });
  const adapters = createCancelAccountDeletionAdapters({
    authenticateRequest: async () => ({ user: { id: userId } }),
    supabaseAdmin: supabaseStub({
      dataByMethod: { single: cancelled },
      operations,
    }),
  });

  assertEquals(
    await adapters.cancelDeletionRequest(
      buildCancelAccountDeletionMutation({
        cancelledAt,
        requestId,
        userId,
      }),
    ),
    cancelled,
  );
  assertEquals(operations, [
    { args: ["account_deletion_requests"], method: "from" },
    {
      args: [{ cancelled_at: cancelledAt, status: "cancelled" }],
      method: "update",
      table: "account_deletion_requests",
    },
    {
      args: ["id", requestId],
      method: "eq",
      table: "account_deletion_requests",
    },
    {
      args: ["user_id", userId],
      method: "eq",
      table: "account_deletion_requests",
    },
    {
      args: ["status", "pending"],
      method: "eq",
      table: "account_deletion_requests",
    },
    { args: ["*"], method: "select", table: "account_deletion_requests" },
    { args: [], method: "single", table: "account_deletion_requests" },
  ]);
});

Deno.test("cancel account deletion adapters surface Supabase read and mutation errors", async () => {
  const readAdapters = createCancelAccountDeletionAdapters({
    authenticateRequest: async () => ({ user: { id: userId } }),
    supabaseAdmin: supabaseStub({
      errorByMethod: { maybeSingle: new Error("read failed") },
    }),
  });
  await assertRejects(
    () => readAdapters.findPendingRequestId(userId),
    Error,
    "read failed",
  );

  const mutationAdapters = createCancelAccountDeletionAdapters({
    authenticateRequest: async () => ({ user: { id: userId } }),
    supabaseAdmin: supabaseStub({
      errorByMethod: { single: new Error("race lost") },
    }),
  });
  await assertRejects(
    () =>
      mutationAdapters.cancelDeletionRequest(
        buildCancelAccountDeletionMutation({
          cancelledAt,
          requestId,
          userId,
        }),
      ),
    Error,
    "race lost",
  );
});

type Operation = {
  args: unknown[];
  method: string;
  table?: string;
};

function supabaseStub(options: {
  dataByMethod?: Record<string, unknown>;
  errorByMethod?: Record<string, Error | null>;
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
        update(value: unknown) {
          operations.push({ args: [value], method: "update", table });
          return query;
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
    id: requestId,
    reason: null,
    requested_at: "2026-06-15T12:00:00.000Z",
    scheduled_at: "2026-07-15T12:00:00.000Z",
    status: "pending",
    updated_at: "2026-06-15T12:00:00.000Z",
    user_id: userId,
    ...overrides,
  };
}
