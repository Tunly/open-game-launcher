import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { accountDeletionJsonResponse } from "../_shared/account-deletion-handler.ts";
import type { buildCancelAccountDeletionMutation } from "../_shared/account-deletion-contract.ts";
import {
  type CancelAccountDeletionHandlerDeps,
  type DeletionRequestRow,
  handleCancelAccountDeletion,
} from "./handler.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const cancelledAt = "2026-06-15T12:30:00.000Z";

Deno.test("cancel account deletion handler answers CORS preflight", async () => {
  const response = await handleCancelAccountDeletion(
    new Request("https://functions.example/cancel-account-deletion", {
      method: "OPTIONS",
    }),
    stubDeps(),
  );

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(
    response.headers.get("Access-Control-Allow-Methods"),
    "GET, POST, OPTIONS",
  );
});

Deno.test("cancel account deletion handler requires caller auth", async () => {
  const mutations: CancelMutation[] = [];
  const response = await handleCancelAccountDeletion(
    jsonRequest(),
    stubDeps({
      authResponse: accountDeletionJsonResponse(
        { error: "Invalid or expired session." },
        401,
      ),
      mutations,
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(await response.json(), {
    error: "Invalid or expired session.",
  });
  assertEquals(mutations, []);
});

Deno.test(
  "cancel account deletion handler returns 404 when no pending request exists",
  async () => {
    const mutations: CancelMutation[] = [];
    const response = await handleCancelAccountDeletion(
      jsonRequest(),
      stubDeps({ mutations, pendingId: null }),
    );

    assertEquals(response.status, 404);
    assertEquals(await response.json(), { request: null });
    assertEquals(mutations, []);
  },
);

Deno.test(
  "cancel account deletion handler applies pending-only owner-scoped mutation",
  async () => {
    const mutations: CancelMutation[] = [];
    const cancelled = deletionRow({
      cancelled_at: cancelledAt,
      status: "cancelled",
    });
    const response = await handleCancelAccountDeletion(
      jsonRequest(),
      stubDeps({ cancelled, mutations }),
    );

    assertEquals(response.status, 200);
    assertEquals(await response.json(), { request: cancelled });
    assertEquals(mutations, [
      {
        filters: [
          { column: "id", value: requestId },
          { column: "user_id", value: userId },
          { column: "status", value: "pending" },
        ],
        update: {
          cancelled_at: cancelledAt,
          status: "cancelled",
        },
      },
    ]);
  },
);

Deno.test(
  "cancel account deletion handler does not cancel processor-claimed rows",
  async () => {
    const mutations: CancelMutation[] = [];
    const response = await handleCancelAccountDeletion(
      jsonRequest(),
      stubDeps({ mutations, pendingId: null }),
    );

    assertEquals(response.status, 404);
    assertEquals(await response.json(), { request: null });
    assertEquals(mutations, []);
  },
);

type CancelMutation = ReturnType<typeof buildCancelAccountDeletionMutation>;

function jsonRequest() {
  return new Request("https://functions.example/cancel-account-deletion", {
    headers: {
      Authorization: "Bearer user-jwt",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

function stubDeps(
  options: {
    authResponse?: Response;
    cancelled?: DeletionRequestRow;
    mutations?: CancelMutation[];
    pendingId?: string | null;
  } = {},
): CancelAccountDeletionHandlerDeps {
  return {
    authenticateRequest: async () => options.authResponse ?? { userId },
    cancelDeletionRequest: async (mutation) => {
      options.mutations?.push(mutation);
      return options.cancelled ?? deletionRow({ status: "cancelled" });
    },
    findPendingRequestId: async () =>
      Object.hasOwn(options, "pendingId") ? options.pendingId! : requestId,
    now: () => new Date(cancelledAt),
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
