import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  handleLinkSteamAccount,
  type LinkSteamAccountHandlerDeps,
} from "./handler.ts";
import { SteamOpenIdError } from "./steam-openid.ts";

const userId = "11111111-1111-4111-8111-111111111111";

Deno.test("link Steam account handler guards CORS and method", async () => {
  const options = await handleLinkSteamAccount(
    new Request("https://functions.example/link-steam-account", {
      method: "OPTIONS",
    }),
    deps(),
  );
  assertEquals(options.status, 200);
  assertEquals(options.headers.get("Access-Control-Allow-Origin"), "*");

  const get = await handleLinkSteamAccount(
    new Request("https://functions.example/link-steam-account"),
    deps(),
  );
  assertEquals(get.status, 405);
});

Deno.test("link Steam account handler verifies then persists the identity", async () => {
  const calls: string[] = [];
  const response = await handleLinkSteamAccount(
    jsonRequest({ openidResponseUrl: "https://launcher.example/callback" }),
    deps({ calls }),
  );
  assertEquals(response.status, 200);
  assertEquals(calls, ["verify:https://launcher.example/callback", "persist"]);
  assertEquals(await response.json(), {
    ok: true,
    platformAccount: {
      platform: "steam",
      platformAvatarUrl: null,
      platformUserId: "76561198000000001",
      platformUsername: null,
      verifiedAt: "2026-07-16T12:00:00.000Z",
    },
  });
});

Deno.test("link Steam account handler maps safe OpenID failures", async () => {
  const response = await handleLinkSteamAccount(
    jsonRequest({ openidResponseUrl: "https://launcher.example/callback" }),
    deps({
      openIdError: new SteamOpenIdError(
        "Steam could not verify this OpenID response.",
        401,
        "steam_openid_invalid",
      ),
    }),
  );
  assertEquals(response.status, 401);
  assertEquals(await response.json(), {
    code: "steam_openid_invalid",
    error: "Steam could not verify this OpenID response.",
  });
});

function jsonRequest(body: Record<string, unknown>) {
  return new Request("https://functions.example/link-steam-account", {
    body: JSON.stringify(body),
    headers: {
      Authorization: "Bearer user-jwt",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

function deps(
  options: { calls?: string[]; openIdError?: Error } = {},
): LinkSteamAccountHandlerDeps {
  return {
    authenticateRequest: async () => ({ adminClient: "stub", userId }),
    verifyResponse: async (_auth, openidResponseUrl) => {
      options.calls?.push(`verify:${openidResponseUrl}`);
      if (options.openIdError) throw options.openIdError;
      return {
        claimedId: "http://steamcommunity.com/openid/id/76561198000000001",
        responseNonce: "2026-07-16T12:00:00Znonce",
        steamId: "76561198000000001",
        verifiedAt: "2026-07-16T12:00:00.000Z",
      };
    },
    persistLink: async (_auth, identity) => {
      options.calls?.push("persist");
      return {
        platformAvatarUrl: null,
        platformUsername: null,
        platformUserId: identity.steamId,
        verifiedAt: identity.verifiedAt,
      };
    },
  };
}
