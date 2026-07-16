import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { createLinkSteamAccountAdapters } from "./adapters.ts";

const userId = "11111111-1111-4111-8111-111111111111";

Deno.test("link Steam adapters use the atomic service-role verification RPC", async () => {
  const rpcCalls: Array<{ args: Record<string, unknown>; name: string }> = [];
  const adminClient = {
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ args, name });
      return Promise.resolve({
        data: {
          linked_at: "2026-07-16T12:00:00.000Z",
          platform_user_id: "76561198000000001",
        },
        error: null,
      });
    },
  };
  const adapters = createLinkSteamAccountAdapters({
    authenticateRequest: async () => ({
      adminClient: adminClient as never,
      token: "user-jwt",
      user: { id: userId } as never,
    }),
  });
  const auth = await adapters.authenticateRequest(
    new Request("https://functions.example/link-steam-account"),
  );
  if (auth instanceof Response) throw new Error("expected auth");
  const linked = await adapters.persistLink(auth, {
    claimedId: "http://steamcommunity.com/openid/id/76561198000000001",
    responseNonce: "2026-07-16T12:00:00Znonce",
    steamId: "76561198000000001",
    verifiedAt: "2026-07-16T12:00:00.000Z",
  });

  assertEquals(linked.platformUserId, "76561198000000001");
  assertEquals(linked.verifiedAt, "2026-07-16T12:00:00.000Z");
  assertEquals(rpcCalls[0].name, "link_verified_steam_account");
  assertEquals(rpcCalls[0].args, {
    p_metadata: {
      openid_claimed_id:
        "http://steamcommunity.com/openid/id/76561198000000001",
      verification_received_at: "2026-07-16T12:00:00.000Z",
    },
    p_platform_avatar_url: null,
    p_platform_username: null,
    p_response_nonce: "2026-07-16T12:00:00Znonce",
    p_steam_id: "76561198000000001",
    p_user_id: userId,
  });
});
