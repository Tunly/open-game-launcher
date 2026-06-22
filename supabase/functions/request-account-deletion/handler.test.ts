import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { accountDeletionJsonResponse } from "../_shared/account-deletion-handler.ts";
import {
  type CreateDeletionRequestInput,
  type DeletionRequestRow,
  handleRequestAccountDeletion,
  type RequestAccountDeletionHandlerDeps,
} from "./handler.ts";

const userId = "11111111-1111-4111-8111-111111111111";

Deno.test("request account deletion handler answers CORS preflight", async () => {
  const response = await handleRequestAccountDeletion(
    new Request("https://functions.example/request-account-deletion", {
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

Deno.test("request account deletion handler requires caller auth", async () => {
  const creates: CreateDeletionRequestInput[] = [];
  const response = await handleRequestAccountDeletion(
    jsonRequest({ reason: "leaving" }),
    stubDeps({
      authResponse: accountDeletionJsonResponse(
        { error: "Invalid or expired session." },
        401,
      ),
      creates,
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(await response.json(), {
    error: "Invalid or expired session.",
  });
  assertEquals(creates, []);
});

Deno.test(
  "request account deletion handler rejects invalid reasons before mutation",
  async () => {
    const creates: CreateDeletionRequestInput[] = [];
    const findCalls: string[] = [];
    const response = await handleRequestAccountDeletion(
      jsonRequest({ reason: 42 }),
      stubDeps({ creates, findCalls }),
    );

    assertEquals(response.status, 400);
    assertEquals(await response.json(), {
      error: "reason must be a string.",
    });
    assertEquals(findCalls, []);
    assertEquals(creates, []);
  },
);

Deno.test(
  "request account deletion handler creates sanitized owner-scoped requests",
  async () => {
    const creates: CreateDeletionRequestInput[] = [];
    const created = deletionRow({ reason: "leaving", status: "pending" });
    const response = await handleRequestAccountDeletion(
      jsonRequest(
        { reason: "  leaving  " },
        { "user-agent": "OG Launcher Test" },
      ),
      stubDeps({ creates, created }),
    );

    assertEquals(response.status, 201);
    assertEquals(await response.json(), { request: created });
    assertEquals(creates, [
      {
        reason: "leaving",
        requestMetadata: {
          source: "edge-function",
          user_agent: "OG Launcher Test",
        },
        userId,
      },
    ]);
    assertEquals(JSON.stringify(creates).includes("Authorization"), false);
  },
);

Deno.test(
  "request account deletion handler returns active pending or processing rows",
  async () => {
    const existing = deletionRow({ status: "processing" });
    const creates: CreateDeletionRequestInput[] = [];
    const response = await handleRequestAccountDeletion(
      jsonRequest({ reason: "still waiting" }),
      stubDeps({ activeRequests: [existing], creates }),
    );

    assertEquals(response.status, 200);
    assertEquals(await response.json(), { request: existing });
    assertEquals(creates, []);
  },
);

Deno.test(
  "request account deletion handler treats active-row conflicts as idempotent",
  async () => {
    const pending = deletionRow({ status: "pending" });
    const response = await handleRequestAccountDeletion(
      jsonRequest({ reason: "race" }),
      stubDeps({
        activeRequests: [null, pending],
        createError: { code: "23505" },
      }),
    );

    assertEquals(response.status, 200);
    assertEquals(await response.json(), { request: pending });
  },
);

function jsonRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return new Request("https://functions.example/request-account-deletion", {
    body: JSON.stringify(body),
    headers: {
      Authorization: "Bearer user-jwt",
      "Content-Type": "application/json",
      ...headers,
    },
    method: "POST",
  });
}

function stubDeps(
  options: {
    activeRequests?: Array<DeletionRequestRow | null>;
    authResponse?: Response;
    createError?: unknown;
    created?: DeletionRequestRow;
    creates?: CreateDeletionRequestInput[];
    findCalls?: string[];
  } = {},
): RequestAccountDeletionHandlerDeps {
  const activeRequests = [...(options.activeRequests ?? [null])];
  return {
    authenticateRequest: async () => options.authResponse ?? { userId },
    createDeletionRequest: async (input) => {
      options.creates?.push(input);
      if (options.createError) {
        throw options.createError;
      }
      return options.created ?? deletionRow({ status: "pending" });
    },
    findActiveRequest: async (requestedUserId) => {
      options.findCalls?.push(requestedUserId);
      return activeRequests.length > 0 ? activeRequests.shift()! : null;
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
