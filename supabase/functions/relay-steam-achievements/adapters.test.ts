import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { createSteamAchievementRelayAdapters } from "./adapters.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const gameId = "123e4567-e89b-42d3-a456-426614174000";

Deno.test("Steam relay adapters require matching account and verification rows", async () => {
  const adapters = createSteamAchievementRelayAdapters({
    authenticateRequest: authWith(adminClient({
      games: { external_ids: { steam: "440" }, id: gameId },
      platform_accounts: {
        id: "account-1",
        platform_user_id: "76561198000000001",
      },
      provider_account_verifications: {
        platform_account_id: "account-1",
        platform_user_id: "76561198000000001",
        verification_method: "steam_openid",
        verified_at: "2026-07-16T10:00:00.000Z",
      },
    })),
  });
  const auth = await getAuth(adapters);

  assertEquals(await adapters.loadVerifiedSteamAccount(auth), {
    platformAccountId: "account-1",
    steamId: "76561198000000001",
    verifiedAt: "2026-07-16T10:00:00.000Z",
  });
  assertEquals(await adapters.loadCatalogGame(auth, gameId), {
    appId: "440",
    gameId,
  });
});

Deno.test("Steam relay adapters reject a verification for another account", async () => {
  const adapters = createSteamAchievementRelayAdapters({
    authenticateRequest: authWith(adminClient({
      platform_accounts: {
        id: "account-1",
        platform_user_id: "76561198000000001",
      },
      provider_account_verifications: {
        platform_account_id: "account-2",
        platform_user_id: "76561198000000001",
        verification_method: "steam_openid",
        verified_at: "2026-07-16T10:00:00.000Z",
      },
    })),
  });
  assertEquals(
    await adapters.loadVerifiedSteamAccount(await getAuth(adapters)),
    null,
  );
});

function adminClient(rows: Record<string, unknown>) {
  return {
    from: (table: string) => {
      const query = {
        eq: () => query,
        maybeSingle: () =>
          Promise.resolve({ data: rows[table] ?? null, error: null }),
        select: () => query,
      };
      return query;
    },
  };
}

function authWith(admin: ReturnType<typeof adminClient>) {
  return async () => ({
    adminClient: admin as never,
    token: "user-jwt",
    user: { id: userId } as never,
  });
}

async function getAuth(
  adapters: ReturnType<typeof createSteamAchievementRelayAdapters>,
) {
  const auth = await adapters.authenticateRequest(
    new Request("https://functions.example/relay-steam-achievements"),
  );
  if (auth instanceof Response) throw new Error("expected auth");
  return auth;
}
