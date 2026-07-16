import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  handleSteamAchievementRelay,
  type SteamAchievementRelayHandlerDeps,
} from "./handler.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const gameId = "123e4567-e89b-42d3-a456-426614174000";

Deno.test("Steam relay handler guards CORS and method", async () => {
  const options = await handleSteamAchievementRelay(
    new Request("https://functions.example/relay-steam-achievements", {
      method: "OPTIONS",
    }),
    deps(),
  );
  assertEquals(options.status, 200);
  assertEquals(options.headers.get("Access-Control-Allow-Origin"), "*");

  const get = await handleSteamAchievementRelay(
    new Request("https://functions.example/relay-steam-achievements"),
    deps(),
  );
  assertEquals(get.status, 405);
});

Deno.test("Steam relay rejects client-supplied achievement evidence", async () => {
  const calls: string[] = [];
  const response = await handleSteamAchievementRelay(
    jsonRequest({
      achievements: [{ id: "FORGED" }],
      gameId,
      steamAppId: "440",
    }),
    deps({ calls }),
  );
  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    code: "achievement_payload_not_accepted",
    error: "Client achievement payloads cannot be trusted by the hosted relay.",
  });
  assertEquals(calls, []);
});

Deno.test("Steam relay requires an exact catalog AppID", async () => {
  const response = await handleSteamAchievementRelay(
    jsonRequest({ gameId, steamAppId: "730" }),
    deps(),
  );
  assertEquals(response.status, 409);
  assertEquals(await response.json(), {
    code: "steam_app_id_mismatch",
    error: "steamAppId does not match the catalog game mapping.",
  });
});

Deno.test("Steam relay fails closed without provider-verifiable session evidence", async () => {
  const calls: string[] = [];
  const response = await handleSteamAchievementRelay(
    jsonRequest({ gameId, steamAppId: "440" }),
    deps({ calls }),
  );
  assertEquals(response.status, 503);
  assertEquals(calls.sort(), ["account", "catalog"]);
  assertEquals(await response.json(), {
    code: "steam_login_session_required",
    error:
      "Verified Steam identity is linked, but provider-verifiable achievement session evidence is unavailable.",
    gameId,
    ok: false,
    persistence: "local_only",
    provider: "steam",
    steamAppId: "440",
    trust: "client_session",
  });
});

Deno.test("Steam relay does not claim hosted trust for an unlinked session", async () => {
  const response = await handleSteamAchievementRelay(
    jsonRequest({ gameId, steamAppId: "440" }),
    deps({ verifiedAccount: null }),
  );
  assertEquals(response.status, 503);
  assertEquals(await response.json(), {
    code: "steam_login_session_required",
    error:
      "A verified native Steam login session is required for hosted achievement proof.",
    gameId,
    ok: false,
    persistence: "local_only",
    provider: "steam",
    steamAppId: "440",
    trust: "client_session",
  });
});

function jsonRequest(body: Record<string, unknown>) {
  return new Request("https://functions.example/relay-steam-achievements", {
    body: JSON.stringify(body),
    headers: {
      Authorization: "Bearer user-jwt",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

function deps(options: {
  calls?: string[];
  verifiedAccount?: {
    platformAccountId: string;
    steamId: string;
    verifiedAt: string;
  } | null;
} = {}): SteamAchievementRelayHandlerDeps {
  return {
    authenticateRequest: async () => ({
      adminClient: "stub",
      token: "user-jwt",
      userId,
    }),
    loadCatalogGame: async () => {
      options.calls?.push("catalog");
      return { appId: "440", gameId };
    },
    loadVerifiedSteamAccount: async () => {
      options.calls?.push("account");
      return options.verifiedAccount === undefined
        ? {
          platformAccountId: "account-1",
          steamId: "76561198000000001",
          verifiedAt: "2026-07-16T10:00:00.000Z",
        }
        : options.verifiedAccount;
    },
  };
}
