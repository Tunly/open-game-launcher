export type SteamAchievementRelayAuth = {
  adminClient?: unknown;
  token: string;
  userId: string;
};

export type VerifiedSteamAccount = {
  platformAccountId: string;
  steamId: string;
  verifiedAt: string;
};

export type SteamCatalogGame = {
  appId: string | null;
  gameId: string;
};

export interface SteamAchievementRelayHandlerDeps {
  authenticateRequest: (
    request: Request,
  ) => Promise<SteamAchievementRelayAuth | Response>;
  loadCatalogGame: (
    auth: SteamAchievementRelayAuth,
    gameId: string,
  ) => Promise<SteamCatalogGame | null>;
  loadVerifiedSteamAccount: (
    auth: SteamAchievementRelayAuth,
  ) => Promise<VerifiedSteamAccount | null>;
}

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

export async function handleSteamAchievementRelay(
  request: Request,
  deps: SteamAchievementRelayHandlerDeps,
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
  const bodyRecord = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  if (Object.hasOwn(bodyRecord, "achievements")) {
    return jsonResponse(
      {
        code: "achievement_payload_not_accepted",
        error:
          "Client achievement payloads cannot be trusted by the hosted relay.",
      },
      400,
    );
  }

  const gameId = bodyRecord.gameId;
  if (typeof gameId !== "string" || !uuidPattern.test(gameId)) {
    return jsonResponse({ error: "gameId must be a catalog game UUID." }, 400);
  }
  const rawSteamAppId = bodyRecord.steamAppId;
  const steamAppId = typeof rawSteamAppId === "number" &&
      Number.isInteger(rawSteamAppId)
    ? String(rawSteamAppId)
    : typeof rawSteamAppId === "string"
    ? rawSteamAppId.trim()
    : "";
  if (!isSteamAppId(steamAppId)) {
    return jsonResponse(
      { error: "steamAppId must be a valid Steam AppID." },
      400,
    );
  }

  try {
    const [account, game] = await Promise.all([
      deps.loadVerifiedSteamAccount(auth),
      deps.loadCatalogGame(auth, gameId),
    ]);
    if (!game) {
      return jsonResponse({ error: "Unknown catalog game id." }, 404);
    }
    if (!game.appId) {
      return jsonResponse(
        {
          code: "steam_app_id_missing",
          error: "Catalog game does not have a verified Steam AppID.",
        },
        422,
      );
    }
    if (game.appId !== steamAppId) {
      return jsonResponse(
        {
          code: "steam_app_id_mismatch",
          error: "steamAppId does not match the catalog game mapping.",
        },
        409,
      );
    }

    // Steam OpenID proves only account identity. It does not sign achievement
    // definitions, unlock state, or timestamps, and Steam's official
    // ISteamUserStats achievement reads require a Web API key. Until the native
    // Steam session can supply provider-verifiable achievement evidence, this
    // endpoint must not attest rows or award hosted XP.
    return jsonResponse(
      {
        code: "steam_login_session_required",
        error: account
          ? "Verified Steam identity is linked, but provider-verifiable achievement session evidence is unavailable."
          : "A verified native Steam login session is required for hosted achievement proof.",
        gameId,
        ok: false,
        persistence: "local_only",
        provider: "steam",
        steamAppId,
        trust: "client_session",
      },
      503,
    );
  } catch {
    return jsonResponse({ error: "Steam achievement relay failed." }, 500);
  }
}

function isSteamAppId(value: string) {
  return /^\d{1,10}$/.test(value) && Number(value) > 0 &&
    Number(value) <= 4_294_967_295;
}
