import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import type { PlatformAccountRow } from "./handler.ts";
import { pollPlatformPresence, toPlatformAccount } from "./provider-client.ts";

Deno.test("presence provider client skips Steam when API key is missing", async () => {
  let fetchCalls = 0;
  const result = await pollPlatformPresence(account(), {
    env: () => undefined,
    fetch: async () => {
      fetchCalls += 1;
      return jsonResponse({});
    },
  });

  assertEquals(result, { reason: "missing-provider" });
  assertEquals(fetchCalls, 0);
});

Deno.test("presence provider client maps Steam 429 with Retry-After evidence", async () => {
  const result = await pollPlatformPresence(account(), {
    env: (name) => name === "STEAM_WEB_API_KEY" ? "steam-key" : undefined,
    fetch: async () =>
      new Response("slow down", {
        headers: { "Retry-After": "45" },
        status: 429,
      }),
  });

  assertEquals(result, {
    reason: "rate-limited",
    retryAfterSeconds: 45,
  });
});

Deno.test("presence provider client maps Steam player game and persona state", async () => {
  const inGame = await pollPlatformPresence(account(), {
    env: (name) => name === "STEAM_WEB_API_KEY" ? "steam-key" : undefined,
    fetch: async () =>
      jsonResponse({
        response: {
          players: [{
            gameextrainfo: "Half-Life 3",
            gameid: "12345",
            personastate: 0,
          }],
        },
      }),
  });
  const away = await pollPlatformPresence(account(), {
    env: (name) => name === "STEAM_WEB_API_KEY" ? "steam-key" : undefined,
    fetch: async () =>
      jsonResponse({
        response: {
          players: [{
            personastate: 3,
          }],
        },
      }),
  });

  assertEquals(inGame, {
    currentGameTitle: "Half-Life 3",
    platform: "steam",
    platformGameId: "12345",
    source: "steam_web_api",
    status: "online",
  });
  assertEquals(away, {
    currentGameTitle: null,
    platform: "steam",
    platformGameId: null,
    source: "steam_web_api",
    status: "away",
  });
});

Deno.test("presence provider client posts bridge token and maps alternate keys", async () => {
  const requests: Array<{ input: unknown; init?: RequestInit }> = [];
  const env: Record<string, string> = {
    EPIC_PRESENCE_ENDPOINT: "https://presence.example/epic",
    PRESENCE_PROVIDER_TOKEN: "provider-token",
  };
  const result = await pollPlatformPresence(account({ platform: "epic" }), {
    env: (name) => env[name],
    fetch: async (input, init) => {
      requests.push({ input, init });
      return jsonResponse({
        gameId: "epic-game-1",
        gameTitle: "Unreal Tournament",
        status: "busy",
      });
    },
  });

  assertEquals(String(requests[0].input), "https://presence.example/epic");
  assertEquals(requests[0].init?.method, "POST");
  assertEquals(
    (requests[0].init?.headers as Record<string, string>).Authorization,
    "Bearer provider-token",
  );
  assertEquals(JSON.parse(String(requests[0].init?.body)), {
    accountId: "account-1",
    platform: "epic",
    platformUserId: "platform-user-1",
    userId: "11111111-1111-4111-8111-111111111111",
  });
  assertEquals(result, {
    currentGameTitle: "Unreal Tournament",
    platform: "epic",
    platformGameId: "epic-game-1",
    source: "epic_presence_endpoint",
    status: "busy",
  });
});

Deno.test("presence provider client filters invalid and og platform accounts", () => {
  assertEquals(toPlatformAccount(null), null);
  assertEquals(toPlatformAccount({ platform: "steam" }), null);
  assertEquals(
    toPlatformAccount({
      id: "og-account",
      platform: "og",
      platform_user_id: "og-user",
      user_id: "user-1",
    }),
    null,
  );
  assertEquals(
    toPlatformAccount({
      id: "steam-account",
      metadata: { keep: true },
      platform: " STEAM ",
      platform_user_id: "steam-user",
      updated_at: "2026-06-15T12:00:00.000Z",
      user_id: "user-1",
    }),
    {
      id: "steam-account",
      metadata: { keep: true },
      platform: "steam",
      platformUserId: "steam-user",
      updatedAt: "2026-06-15T12:00:00.000Z",
      userId: "user-1",
    },
  );
});

function account(
  overrides: Partial<PlatformAccountRow> = {},
): PlatformAccountRow {
  return {
    id: "account-1",
    metadata: {},
    platform: "steam",
    platformUserId: "platform-user-1",
    updatedAt: "2026-06-15T11:00:00.000Z",
    userId: "11111111-1111-4111-8111-111111111111",
    ...overrides,
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
    status: init.status ?? 200,
  });
}
