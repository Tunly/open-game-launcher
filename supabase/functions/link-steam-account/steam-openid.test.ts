import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  STEAM_OPENID_ENDPOINT,
  SteamOpenIdError,
  verifySteamOpenIdResponse,
} from "./steam-openid.ts";

const steamId = "76561198000000001";
const now = new Date("2026-07-16T12:00:00.000Z");

Deno.test("Steam OpenID verifies a provider response server-side", async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  const result = await verifySteamOpenIdResponse(validResponseUrl().href, {
    fetch: async (input, init) => {
      requests.push({ input: String(input), init });
      return new Response(
        "ns:http://specs.openid.net/auth/2.0\nis_valid:true\n",
      );
    },
    now: () => now,
  });

  assertEquals(result, {
    claimedId: `http://steamcommunity.com/openid/id/${steamId}`,
    responseNonce: "2026-07-16T12:00:00Zprovider-nonce",
    steamId,
    verifiedAt: now.toISOString(),
  });
  assertEquals(requests[0].input, STEAM_OPENID_ENDPOINT);
  assertEquals(requests[0].init?.method, "POST");
  const verification = requests[0].init?.body as URLSearchParams;
  assertEquals(verification.get("openid.mode"), "check_authentication");
  assertEquals(verification.get("openid.claimed_id"), result.claimedId);
});

Deno.test("Steam OpenID accepts the exact native loopback callback", async () => {
  const callback = validResponseUrl(
    "http://localhost:18234/?state=abc",
  );
  const result = await verifySteamOpenIdResponse(callback.href, {
    fetch: async () => new Response("is_valid:true\n"),
    now: () => now,
  });
  assertEquals(result.steamId, steamId);
});

Deno.test("Steam OpenID rejects callbacks outside the native loopback boundary", async () => {
  const callback = validResponseUrl("https://launcher.example/?state=abc");
  const error = await assertRejects(
    () => verifySteamOpenIdResponse(callback.href, { now: () => now }),
    SteamOpenIdError,
  );
  assertEquals(error.code, "invalid_openid_response");
});

Deno.test("Steam OpenID rejects mismatched return_to before provider fetch", async () => {
  const callback = validResponseUrl();
  callback.searchParams.set(
    "openid.return_to",
    "https://other.example/callback",
  );
  let fetchCalls = 0;
  const error = await assertRejects(
    () =>
      verifySteamOpenIdResponse(callback.href, {
        fetch: async () => {
          fetchCalls += 1;
          return new Response("is_valid:true");
        },
        now: () => now,
      }),
    SteamOpenIdError,
  );
  assertEquals(error.code, "return_to_mismatch");
  assertEquals(fetchCalls, 0);
});

Deno.test("Steam OpenID rejects stale provider nonces", async () => {
  const callback = validResponseUrl();
  callback.searchParams.set(
    "openid.response_nonce",
    "2026-07-16T11:30:00Zstale",
  );
  const error = await assertRejects(
    () => verifySteamOpenIdResponse(callback.href, { now: () => now }),
    SteamOpenIdError,
  );
  assertEquals(error.code, "invalid_response_nonce");
});

Deno.test("Steam OpenID requires Steam to confirm is_valid", async () => {
  const error = await assertRejects(
    () =>
      verifySteamOpenIdResponse(validResponseUrl().href, {
        fetch: async () => new Response("is_valid:false\n"),
        now: () => now,
      }),
    SteamOpenIdError,
  );
  assertEquals(error.code, "steam_openid_invalid");
});

function validResponseUrl(
  returnTo = "http://localhost:18234/?state=abc",
) {
  const callback = new URL(returnTo);
  const claimedId = `http://steamcommunity.com/openid/id/${steamId}`;
  callback.searchParams.set("openid.ns", "http://specs.openid.net/auth/2.0");
  callback.searchParams.set("openid.mode", "id_res");
  callback.searchParams.set("openid.op_endpoint", STEAM_OPENID_ENDPOINT);
  callback.searchParams.set("openid.claimed_id", claimedId);
  callback.searchParams.set("openid.identity", claimedId);
  callback.searchParams.set("openid.return_to", returnTo);
  callback.searchParams.set(
    "openid.response_nonce",
    "2026-07-16T12:00:00Zprovider-nonce",
  );
  callback.searchParams.set("openid.assoc_handle", "association");
  callback.searchParams.set(
    "openid.signed",
    "op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
  );
  callback.searchParams.set("openid.sig", "provider-signature");
  return callback;
}
