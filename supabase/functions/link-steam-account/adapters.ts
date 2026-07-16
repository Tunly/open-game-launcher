import type { AuthenticatedRequest } from "../_shared/privacy.ts";
import type {
  LinkedSteamAccount,
  LinkSteamAccountAuth,
  LinkSteamAccountHandlerDeps,
} from "./handler.ts";
import { SteamAccountAlreadyLinkedError } from "./handler.ts";
import {
  type SteamOpenIdDeps,
  type VerifiedSteamIdentity,
  verifySteamOpenIdResponse,
} from "./steam-openid.ts";

type QueryError = { code?: string; message?: string };
type QueryResult<T> = { data: T | null; error: QueryError | null };
type AdminClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<QueryResult<unknown>>;
};

export type LinkSteamAccountAdapterDeps = SteamOpenIdDeps & {
  authenticateRequest: (
    request: Request,
  ) => Promise<AuthenticatedRequest | Response>;
};

export function createLinkSteamAccountAdapters(
  deps: LinkSteamAccountAdapterDeps,
): LinkSteamAccountHandlerDeps {
  const openIdDeps: SteamOpenIdDeps = {
    fetch: deps.fetch,
    now: deps.now,
  };

  return {
    authenticateRequest: async (request) => {
      const auth = await deps.authenticateRequest(request);
      return auth instanceof Response
        ? auth
        : { adminClient: auth.adminClient, userId: auth.user.id };
    },
    persistLink: persistLink,
    verifyResponse: (_auth, openidResponseUrl) =>
      verifySteamOpenIdResponse(openidResponseUrl, openIdDeps),
  };
}

async function persistLink(
  auth: LinkSteamAccountAuth,
  identity: VerifiedSteamIdentity,
): Promise<LinkedSteamAccount> {
  const adminClient = auth.adminClient as AdminClient;
  const result = await adminClient.rpc("link_verified_steam_account", {
    p_metadata: {
      openid_claimed_id: identity.claimedId,
      verification_received_at: identity.verifiedAt,
    },
    p_platform_avatar_url: null,
    p_platform_username: null,
    p_response_nonce: identity.responseNonce,
    p_steam_id: identity.steamId,
    p_user_id: auth.userId,
  });
  if (result.error?.code === "23505") {
    throw new SteamAccountAlreadyLinkedError();
  }
  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  const record = asRecord(row);
  if (
    typeof record.platform_user_id !== "string"
  ) {
    throw new Error("Steam account link did not return a persisted row.");
  }
  return {
    platformAvatarUrl: typeof record.platform_avatar_url === "string"
      ? record.platform_avatar_url
      : null,
    platformUsername: typeof record.platform_username === "string"
      ? record.platform_username
      : null,
    platformUserId: record.platform_user_id,
    verifiedAt: identity.verifiedAt,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
