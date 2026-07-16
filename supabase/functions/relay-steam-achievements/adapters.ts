import type { AuthenticatedRequest } from "../_shared/privacy.ts";
import {
  type SteamAchievementRelayAuth,
  type SteamAchievementRelayHandlerDeps,
  type SteamCatalogGame,
  type VerifiedSteamAccount,
} from "./handler.ts";

type QueryError = { message?: string };
type QueryResult<T> = { data: T | null; error: QueryError | null };
type TableClient = {
  eq: (column: string, value: unknown) => TableClient;
  maybeSingle: <T>() => Promise<QueryResult<T>>;
  select: (columns: string) => TableClient;
};
type AdminClient = { from: (table: string) => unknown };

export type SteamAchievementRelayAdapterDeps = {
  authenticateRequest: (
    request: Request,
  ) => Promise<AuthenticatedRequest | Response>;
};

export function createSteamAchievementRelayAdapters(
  deps: SteamAchievementRelayAdapterDeps,
): SteamAchievementRelayHandlerDeps {
  return {
    authenticateRequest: async (request) => {
      const auth = await deps.authenticateRequest(request);
      return auth instanceof Response ? auth : {
        adminClient: auth.adminClient,
        token: auth.token,
        userId: auth.user.id,
      };
    },
    loadCatalogGame,
    loadVerifiedSteamAccount,
  };
}

async function loadVerifiedSteamAccount(
  auth: SteamAchievementRelayAuth,
): Promise<VerifiedSteamAccount | null> {
  const adminClient = auth.adminClient as AdminClient;
  const accountResult = await table(adminClient, "platform_accounts")
    .select("id, platform_user_id")
    .eq("user_id", auth.userId)
    .eq("platform", "steam")
    .maybeSingle<{ id?: unknown; platform_user_id?: unknown }>();
  if (accountResult.error) throw accountResult.error;
  if (
    typeof accountResult.data?.id !== "string" ||
    typeof accountResult.data.platform_user_id !== "string"
  ) return null;

  const verificationResult = await table(
    adminClient,
    "provider_account_verifications",
  )
    .select(
      "platform_account_id, platform_user_id, verification_method, verified_at",
    )
    .eq("user_id", auth.userId)
    .eq("platform", "steam")
    .maybeSingle<{
      platform_account_id?: unknown;
      platform_user_id?: unknown;
      verification_method?: unknown;
      verified_at?: unknown;
    }>();
  if (verificationResult.error) throw verificationResult.error;
  const verification = verificationResult.data;
  if (
    typeof verification?.platform_account_id !== "string" ||
    verification.platform_account_id !== accountResult.data.id ||
    typeof verification.platform_user_id !== "string" ||
    verification.platform_user_id !== accountResult.data.platform_user_id ||
    verification.verification_method !== "steam_openid" ||
    typeof verification.verified_at !== "string" ||
    !Number.isFinite(Date.parse(verification.verified_at))
  ) return null;

  return {
    platformAccountId: accountResult.data.id,
    steamId: accountResult.data.platform_user_id,
    verifiedAt: verification.verified_at,
  };
}

async function loadCatalogGame(
  auth: SteamAchievementRelayAuth,
  gameId: string,
): Promise<SteamCatalogGame | null> {
  const adminClient = auth.adminClient as AdminClient;
  const result = await table(adminClient, "games")
    .select("id, external_ids")
    .eq("id", gameId)
    .maybeSingle<{ external_ids?: unknown; id?: unknown }>();
  if (result.error) throw result.error;
  if (typeof result.data?.id !== "string") return null;
  const externalIds = asRecord(result.data.external_ids);
  const rawAppId = externalIds.steam;
  const appId = typeof rawAppId === "number" && Number.isInteger(rawAppId)
    ? String(rawAppId)
    : typeof rawAppId === "string"
    ? rawAppId.trim()
    : "";
  return {
    appId: isSteamAppId(appId) ? appId : null,
    gameId: result.data.id,
  };
}

function table(adminClient: AdminClient, name: string) {
  return adminClient.from(name) as TableClient;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isSteamAppId(value: string) {
  return /^\d{1,10}$/.test(value) && Number(value) > 0 &&
    Number(value) <= 4_294_967_295;
}
