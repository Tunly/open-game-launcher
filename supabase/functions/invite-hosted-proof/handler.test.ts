import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { buildShareTokenHint, type InviteHostedProofRow } from "./contract.ts";
import {
  handleInviteHostedProof,
  type InviteHostedProofCallerClient,
  type InviteHostedProofHandlerDeps,
} from "./handler.ts";

const endpoint = "https://functions.example/invite-hosted-proof";
const allowedOrigin = "https://og-launcher.example";
const shareToken = "ogl_header.payload.signature-redacted-for-handler-tests";
const checkedAt = "2026-06-13T09:30:00.000Z";

Deno.test("invite hosted proof handler answers allowed CORS preflight without dependencies", async () => {
  const response = await handleInviteHostedProof(
    new Request(endpoint, {
      headers: { Origin: allowedOrigin },
      method: "OPTIONS",
    }),
    stubDeps({
      createCallerClient: () => {
        throw new Error("caller client should not be created");
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(
    response.headers.get("Access-Control-Allow-Origin"),
    allowedOrigin,
  );
  assertEquals(response.headers.get("Vary"), "Origin");
});

Deno.test("invite hosted proof handler rejects bad origins before dependencies", async () => {
  let clientCalls = 0;
  const response = await handleInviteHostedProof(
    new Request(endpoint, {
      headers: { Origin: "https://evil.example" },
      method: "POST",
    }),
    stubDeps({
      createCallerClient: () => {
        clientCalls += 1;
        return callerClient();
      },
    }),
  );

  assertEquals(response.status, 403);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), null);
  assertEquals(await response.json(), {
    error: "Origin is not allowed for invite hosted proof.",
  });
  assertEquals(clientCalls, 0);
});

Deno.test("invite hosted proof handler applies method guard after origin checks", async () => {
  let clientCalls = 0;
  const response = await handleInviteHostedProof(
    request("GET"),
    stubDeps({
      createCallerClient: () => {
        clientCalls += 1;
        return callerClient();
      },
    }),
  );

  assertEquals(response.status, 405);
  assertEquals(await response.json(), { error: "Method not allowed." });
  assertEquals(clientCalls, 0);
});

Deno.test("invite hosted proof handler requires auth before body parsing", async () => {
  let proofCalls = 0;
  const response = await handleInviteHostedProof(
    request("POST", "{"),
    stubDeps({
      createCallerClient: () =>
        callerClient({
          getUser: async () => ({ data: { user: null }, error: null }),
          proveShareTokenReplayDenial: async () => {
            proofCalls += 1;
            return { data: null, error: null };
          },
        }),
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(await response.json(), { error: "Invalid or expired token." });
  assertEquals(proofCalls, 0);
});

Deno.test("invite hosted proof handler rejects invalid bodies before proof RPC", async () => {
  let proofCalls = 0;
  const response = await handleInviteHostedProof(
    request("POST", JSON.stringify({ token: " " })),
    stubDeps({
      createCallerClient: () =>
        callerClient({
          proveShareTokenReplayDenial: async () => {
            proofCalls += 1;
            return { data: proofRow(), error: null };
          },
        }),
    }),
  );

  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    error: "Invite share token is required.",
  });
  assertEquals(proofCalls, 0);
});

Deno.test("invite hosted proof handler maps missing proof RPC data to 400", async () => {
  const response = await handleInviteHostedProof(
    jsonRequest({ token: shareToken }),
    stubDeps({
      createCallerClient: () =>
        callerClient({
          proveShareTokenReplayDenial: async () => ({
            data: null,
            error: { message: "Proof RPC denied access" },
          }),
        }),
    }),
  );

  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    error: "Proof RPC denied access",
  });
});

Deno.test("invite hosted proof handler rejects tokens without replay denial", async () => {
  let replayCalls = 0;
  const response = await handleInviteHostedProof(
    jsonRequest({ token: shareToken }),
    stubDeps({
      createCallerClient: () =>
        callerClient({
          proveShareTokenReplayDenial: async () => ({
            data: proofRow({ replay_denied: false }),
            error: null,
          }),
          redeemShareToken: async () => {
            replayCalls += 1;
            return { error: { message: "should not redeem" } };
          },
        }),
    }),
  );

  assertEquals(response.status, 409);
  assertEquals(await response.json(), {
    error: "Invite token is not consumed, replay proof is not available.",
  });
  assertEquals(replayCalls, 0);
});

Deno.test("invite hosted proof handler rejects unexpectedly accepted replay redeem", async () => {
  const response = await handleInviteHostedProof(
    jsonRequest({ token: shareToken }),
    stubDeps({
      createCallerClient: () =>
        callerClient({
          redeemShareToken: async () => ({ error: null }),
        }),
    }),
  );

  assertEquals(response.status, 409);
  assertEquals(await response.json(), {
    error: "Replay redeem was unexpectedly accepted.",
  });
});

Deno.test("invite hosted proof handler returns sanitized proof packets", async () => {
  const proofArgs: Array<{ token_input: string }> = [];
  const replayArgs: Array<{ token_input: string }> = [];
  const response = await handleInviteHostedProof(
    jsonRequest({ token: `  ${shareToken}  ` }),
    stubDeps({
      createCallerClient: () =>
        callerClient({
          proveShareTokenReplayDenial: async (args) => {
            proofArgs.push(args);
            return { data: proofRow(), error: null };
          },
          redeemShareToken: async (args) => {
            replayArgs.push(args);
            return {
              error: {
                message:
                  "Invite token is not redeemable because it was consumed.",
              },
            };
          },
        }),
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(
    response.headers.get("Access-Control-Allow-Origin"),
    allowedOrigin,
  );
  assertEquals(await response.json(), {
    checkedAt,
    deploymentScope: "hosted-staging",
    gameInviteId: "11111111-1111-4111-8111-111111111111",
    gameTitle: "Neon Circuit",
    guards: [
      "Allowed HTTPS Origin only",
      "Authenticated receiver or sender",
      "No raw token echoed",
      "No token hash returned",
      "Second redeem rejected",
      "No production deployment claim",
    ],
    inviteStatus: "accepted",
    maxUses: 1,
    origin: allowedOrigin,
    originVerified: true,
    platform: "steam",
    replayDenied: true,
    replayError: "Invite token is not redeemable because it was consumed.",
    tokenHint: buildShareTokenHint(shareToken),
    usedAt: "2026-06-13T09:25:00.000Z",
    usesCount: 1,
  });
  assertEquals(proofArgs, [{ token_input: shareToken }]);
  assertEquals(replayArgs, [{ token_input: shareToken }]);
});

function request(method: string, body?: string): Request {
  return new Request(endpoint, {
    body,
    headers: {
      Authorization: "Bearer token",
      Origin: allowedOrigin,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    method,
  });
}

function jsonRequest(body: unknown): Request {
  return request("POST", JSON.stringify(body));
}

function proofRow(
  overrides: Partial<InviteHostedProofRow> = {},
): InviteHostedProofRow {
  return {
    game_invite_id: "11111111-1111-4111-8111-111111111111",
    game_title: "Neon Circuit",
    invite_status: "accepted",
    max_uses: 1,
    platform: "steam",
    replay_denied: true,
    used_at: "2026-06-13T09:25:00.000Z",
    uses_count: 1,
    ...overrides,
  };
}

function callerClient(
  overrides: Partial<InviteHostedProofCallerClient> = {},
): InviteHostedProofCallerClient {
  return {
    getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }),
    proveShareTokenReplayDenial: async () => ({
      data: proofRow(),
      error: null,
    }),
    redeemShareToken: async () => ({
      error: { message: "Invite token is not redeemable." },
    }),
    ...overrides,
  };
}

function stubDeps(
  overrides: Partial<InviteHostedProofHandlerDeps> = {},
): InviteHostedProofHandlerDeps {
  return {
    allowedOrigins: [allowedOrigin],
    createCallerClient: () => callerClient(),
    now: () => new Date(checkedAt),
    ...overrides,
  };
}
