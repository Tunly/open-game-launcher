import type { VerifiedSteamIdentity } from "./steam-openid.ts";
import { SteamOpenIdError } from "./steam-openid.ts";

export type LinkSteamAccountAuth = {
  adminClient?: unknown;
  userId: string;
};

export type LinkedSteamAccount = {
  platformAvatarUrl: string | null;
  platformUsername: string | null;
  platformUserId: string;
  verifiedAt: string;
};

export interface LinkSteamAccountHandlerDeps {
  authenticateRequest: (
    request: Request,
  ) => Promise<LinkSteamAccountAuth | Response>;
  verifyResponse: (
    auth: LinkSteamAccountAuth,
    openidResponseUrl: string,
  ) => Promise<VerifiedSteamIdentity>;
  persistLink: (
    auth: LinkSteamAccountAuth,
    identity: VerifiedSteamIdentity,
  ) => Promise<LinkedSteamAccount>;
}

export class SteamAccountAlreadyLinkedError extends Error {
  constructor() {
    super("This Steam account is already linked to another OG Launcher user.");
    this.name = "SteamAccountAlreadyLinkedError";
  }
}

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

export async function handleLinkSteamAccount(
  request: Request,
  deps: LinkSteamAccountHandlerDeps,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const auth = await deps.authenticateRequest(request);
  if (auth instanceof Response) return auth;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "Request body must be a JSON object." }, 400);
  }

  const openidResponseUrl = (body as Record<string, unknown>).openidResponseUrl;
  if (typeof openidResponseUrl !== "string" || !openidResponseUrl.trim()) {
    return jsonResponse({ error: "openidResponseUrl is required." }, 400);
  }
  try {
    const identity = await deps.verifyResponse(auth, openidResponseUrl.trim());
    const linked = await deps.persistLink(auth, identity);
    return jsonResponse({
      ok: true,
      platformAccount: {
        platform: "steam",
        platformAvatarUrl: linked.platformAvatarUrl,
        platformUserId: linked.platformUserId,
        platformUsername: linked.platformUsername,
        verifiedAt: linked.verifiedAt,
      },
    });
  } catch (error) {
    if (error instanceof SteamOpenIdError) {
      return jsonResponse(
        { code: error.code, error: error.message },
        error.status,
      );
    }
    if (error instanceof SteamAccountAlreadyLinkedError) {
      return jsonResponse({
        code: "steam_account_conflict",
        error: error.message,
      }, 409);
    }
    return jsonResponse({ error: "Steam account linking failed." }, 500);
  }
}
