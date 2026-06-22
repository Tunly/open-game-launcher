import {
  assertEquals,
  assertObjectMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { createMobilePushRegistrationAdapters } from "./adapters.ts";
import type { MobilePushRegistrationMutationPlan } from "./contract.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const registrationId = "22222222-2222-4222-8222-222222222222";
const tokenHash =
  "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

Deno.test("mobile push adapters authenticate without live Supabase secrets", async () => {
  const calls: unknown[] = [];
  const adapters = createMobilePushRegistrationAdapters({
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
    await adapters.getAuthenticatedUserId(new Request("https://example.test")),
    null,
  );
  assertEquals(
    await adapters.getAuthenticatedUserId(
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

Deno.test("mobile push adapters delete registrations with owner scope", async () => {
  const operations: Operation[] = [];
  const adapters = createMobilePushRegistrationAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      dataByMethod: { maybeSingle: { id: registrationId } },
      operations,
    }),
  });

  assertEquals(await adapters.applyMutation(deletePlan()), {
    action: "delete",
    deleted: true,
    registrationId,
  });
  assertEquals(operations, [
    { args: ["mobile_push_registrations"], method: "from" },
    { args: [], method: "delete", table: "mobile_push_registrations" },
    {
      args: ["id", registrationId],
      method: "eq",
      table: "mobile_push_registrations",
    },
    {
      args: ["owner_id", userId],
      method: "eq",
      table: "mobile_push_registrations",
    },
    { args: ["id"], method: "select", table: "mobile_push_registrations" },
    { args: [], method: "maybeSingle", table: "mobile_push_registrations" },
  ]);
});

Deno.test("mobile push adapters update existing active token rows", async () => {
  const operations: Operation[] = [];
  const adapters = createMobilePushRegistrationAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      dataByMethod: {
        maybeSingle: { id: "existing-registration" },
        single: {
          id: "existing-registration",
          updated_at: "2026-06-14T12:00:00.000Z",
        },
      },
      operations,
    }),
  });

  assertEquals(await adapters.applyMutation(upsertPlan()), {
    action: "upsert",
    registrationId: "existing-registration",
    updatedAt: "2026-06-14T12:00:00.000Z",
  });
  assertEquals(operations.slice(0, 7), [
    { args: ["mobile_push_registrations"], method: "from" },
    { args: ["id"], method: "select", table: "mobile_push_registrations" },
    {
      args: ["owner_id", userId],
      method: "eq",
      table: "mobile_push_registrations",
    },
    {
      args: ["platform", "android"],
      method: "eq",
      table: "mobile_push_registrations",
    },
    {
      args: ["token_hash", tokenHash],
      method: "eq",
      table: "mobile_push_registrations",
    },
    {
      args: ["revoked_at", null],
      method: "is",
      table: "mobile_push_registrations",
    },
    { args: [], method: "maybeSingle", table: "mobile_push_registrations" },
  ]);
  const update = operations.find((operation) => operation.method === "update");
  assertObjectMatch(update?.args[0] as Record<string, unknown>, {
    consent_granted: true,
    owner_id: userId,
    permission_status: "prompt",
    platform: "android",
    revoked_at: null,
    token_hash: tokenHash,
    token_hint: "fcm...9999",
  });
  assertEquals(
    typeof (update?.args[0] as Record<string, unknown>).last_registered_at,
    "string",
  );
  assertEquals(operations.slice(9), [
    {
      args: ["id", "existing-registration"],
      method: "eq",
      table: "mobile_push_registrations",
    },
    {
      args: ["id, updated_at"],
      method: "select",
      table: "mobile_push_registrations",
    },
    { args: [], method: "single", table: "mobile_push_registrations" },
  ]);
});

Deno.test("mobile push adapters insert new token rows", async () => {
  const operations: Operation[] = [];
  const adapters = createMobilePushRegistrationAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      dataByMethod: {
        maybeSingle: null,
        single: {
          id: registrationId,
          updated_at: "2026-06-14T12:00:00.000Z",
        },
      },
      operations,
    }),
  });

  assertEquals(await adapters.applyMutation(upsertPlan()), {
    action: "upsert",
    registrationId,
    updatedAt: "2026-06-14T12:00:00.000Z",
  });

  const insert = operations.find((operation) => operation.method === "insert");
  assertObjectMatch(insert?.args[0] as Record<string, unknown>, {
    consent_granted: true,
    owner_id: userId,
    permission_status: "prompt",
    platform: "android",
    revoked_at: null,
    token_hash: tokenHash,
    token_hint: "fcm...9999",
  });
  assertEquals(
    typeof (insert?.args[0] as Record<string, unknown>).last_registered_at,
    "string",
  );
  assertEquals(operations.at(-2), {
    args: ["id, updated_at"],
    method: "select",
    table: "mobile_push_registrations",
  });
  assertEquals(operations.at(-1), {
    args: [],
    method: "single",
    table: "mobile_push_registrations",
  });
});

Deno.test("mobile push adapters map Supabase mutation errors", async () => {
  const adapters = createMobilePushRegistrationAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      errorByMethod: { maybeSingle: { message: "read failed" } },
    }),
  });

  await assertRejects(
    () => adapters.applyMutation(upsertPlan()),
    "Failed to read mobile push registration: read failed",
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
  errorByMethod?: Record<string, { message?: string } | null>;
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
        delete() {
          operations.push({ args: [], method: "delete", table });
          return query;
        },
        eq(column: string, value: unknown) {
          operations.push({ args: [column, value], method: "eq", table });
          return query;
        },
        insert(value: unknown) {
          operations.push({ args: [value], method: "insert", table });
          return query;
        },
        is(column: string, value: unknown) {
          operations.push({ args: [column, value], method: "is", table });
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

function deletePlan(): MobilePushRegistrationMutationPlan {
  return {
    action: "delete",
    ownerId: userId,
    registrationId,
    status: "ok",
  };
}

function upsertPlan(): MobilePushRegistrationMutationPlan {
  return {
    action: "upsert",
    registrationId: null,
    row: {
      consent_granted: true,
      owner_id: userId,
      permission_status: "prompt",
      platform: "android",
      token_hash: tokenHash,
      token_hint: "fcm...9999",
    },
    status: "ok",
  };
}

async function assertRejects(
  fn: () => Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    assertEquals(
      error instanceof Error ? error.message : String(error),
      message,
    );
    return;
  }
  throw new Error(`Expected rejection: ${message}`);
}
