import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  handleRemoteCompanionRelay,
  type RemoteCompanionRelayCallerClient,
  type RemoteCompanionRelayHandlerDeps,
} from "./handler.ts";

const endpoint = "https://functions.example/remote-companion-relay";
const desktopDeviceId = "11111111-1111-4111-8111-111111111111";

Deno.test("remote companion relay handler answers CORS and method guards without dependencies", async () => {
  const deps: RemoteCompanionRelayHandlerDeps = {
    createCallerClient: () => {
      throw new Error("caller client should not be created");
    },
  };

  const optionsResponse = await handleRemoteCompanionRelay(
    new Request(endpoint, { method: "OPTIONS" }),
    deps,
  );
  assertEquals(optionsResponse.status, 200);
  assertEquals(optionsResponse.headers.get("Access-Control-Allow-Origin"), "*");

  const getResponse = await handleRemoteCompanionRelay(
    new Request(endpoint, { method: "GET" }),
    deps,
  );
  assertEquals(getResponse.status, 405);
  assertEquals(await getResponse.json(), { error: "Method not allowed." });
});

Deno.test("remote companion relay handler requires auth before body parsing", async () => {
  let rpcCalls = 0;
  const response = await handleRemoteCompanionRelay(
    new Request(endpoint, {
      body: "{",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    stubDeps({
      getUser: async () => ({ data: { user: null }, error: null }),
      rpc: async () => {
        rpcCalls += 1;
        return { data: null, error: null };
      },
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(await response.json(), { error: "Invalid or expired token." });
  assertEquals(rpcCalls, 0);
});

Deno.test("remote companion relay handler rejects malformed JSON before RPC", async () => {
  let rpcCalls = 0;
  const response = await handleRemoteCompanionRelay(
    new Request(endpoint, {
      body: "{",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    stubDeps({
      rpc: async () => {
        rpcCalls += 1;
        return { data: null, error: null };
      },
    }),
  );

  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    error: "Request body must be a JSON object.",
  });
  assertEquals(rpcCalls, 0);
});

Deno.test("remote companion relay handler rejects unsupported actions before RPC", async () => {
  let rpcCalls = 0;
  const response = await handleRemoteCompanionRelay(
    jsonRequest({ action: "launch_game" }),
    stubDeps({
      rpc: async () => {
        rpcCalls += 1;
        return { data: null, error: null };
      },
    }),
  );

  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    error: "Remote companion action is not supported.",
  });
  assertEquals(rpcCalls, 0);
});

Deno.test("remote companion relay handler invokes create pairing RPC", async () => {
  const rpcCalls: Array<{ args: Record<string, unknown>; rpcName: string }> =
    [];
  const response = await handleRemoteCompanionRelay(
    jsonRequest({
      action: "create-pairing",
      deviceKind: "desktop",
      deviceLabel: " OG Deck ",
      ttlSeconds: 900,
    }),
    stubDeps({
      rpc: async (rpcName, args) => {
        rpcCalls.push({ args, rpcName });
        return {
          data: { pairing_code: "OGL-PAIR-123" },
          error: null,
        };
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    action: "create_pairing",
    data: { pairing_code: "OGL-PAIR-123" },
    rpc: "create_remote_companion_pairing",
  });
  assertEquals(rpcCalls, [
    {
      args: {
        device_kind_input: "desktop",
        device_label_input: "OG Deck",
        ttl_seconds_input: 900,
      },
      rpcName: "create_remote_companion_pairing",
    },
  ]);
});

Deno.test("remote companion relay handler returns redacted RPC error contracts", async () => {
  const response = await handleRemoteCompanionRelay(
    jsonRequest({
      action: "ping",
      deviceId: desktopDeviceId,
      deviceSecret: "desktop-secret",
    }),
    stubDeps({
      rpc: async () => ({
        data: null,
        error: { message: "Device secret was rejected" },
      }),
    }),
  );

  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    action: "ping",
    error: "Device secret was rejected",
    rpc: "record_remote_companion_ping",
  });
});

function jsonRequest(body: unknown): Request {
  return new Request(endpoint, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

function stubDeps(
  clientOverrides: Partial<RemoteCompanionRelayCallerClient> = {},
): RemoteCompanionRelayHandlerDeps {
  return {
    createCallerClient: () => ({
      getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }),
      rpc: async () => ({ data: { ok: true }, error: null }),
      ...clientOverrides,
    }),
  };
}
