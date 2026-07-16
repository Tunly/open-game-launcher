import type { Game } from "../types";
import { getCurrentSessionUserId, getSupabaseClient, isSupabaseConfigured } from "./client";
import { resolveCatalogGameId } from "./playtime";

const STEAM_ID_PATTERN = /^\d{17}$/;
const STEAM_APP_ID_PATTERN = /^\d+$/;

type FunctionErrorLike = {
  context?: { clone?: () => Response; status?: number };
  message?: string;
  name?: string;
  status?: number;
};

export type SteamHostedPlatformAccount = {
  platform: "steam";
  platformAvatarUrl: string | null;
  platformUserId: string;
  platformUsername: string | null;
  verifiedAt: string;
};

export type SteamHostedAchievementRelayResult = {
  achievementsSynced: number;
  gameId: string;
  newUnlocks: number;
  ok: true;
  persistence: "hosted";
  provider: "steam";
  syncedAt: string;
  trust: "provider_verified";
  unlockedCount: number;
  xpDelta: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readNullableString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readCount(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isHostedFunctionUnavailable(error: unknown) {
  const candidate = (error ?? {}) as FunctionErrorLike;
  const status = candidate.status ?? candidate.context?.status ?? null;
  const message = String(candidate.message ?? "").toLowerCase();
  const name = String(candidate.name ?? "").toLowerCase();
  if (status !== null) return status === 404;
  return (
    name.includes("fetch") ||
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("function not found") ||
    message.includes("not found") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("connection refused") ||
    message.includes("connection reset") ||
    message.includes("timed out") ||
    message.includes("timeout")
  );
}

function isAchievementRelayUnavailable(error: unknown) {
  const candidate = (error ?? {}) as FunctionErrorLike;
  const status = candidate.status ?? candidate.context?.status ?? null;
  return status === 409 || status === 503 || isHostedFunctionUnavailable(error);
}

function responseError(data: unknown) {
  if (!isRecord(data)) return null;
  const error = readNullableString(data, "error");
  return error ? new Error(error) : null;
}

async function hostedFunctionError(error: unknown, fallback: string) {
  const candidate = (error ?? {}) as FunctionErrorLike;
  const response = candidate.context;
  if (typeof response?.clone === "function") {
    try {
      const body: unknown = await response.clone().json();
      const endpointError = responseError(body);
      if (endpointError) return endpointError;
    } catch {
      // Fall through to the sanitized SDK message below.
    }
  }
  return new Error(candidate.message?.trim() || fallback);
}

async function hasHostedSession() {
  try {
    return Boolean(await getCurrentSessionUserId());
  } catch (error) {
    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (
      isHostedFunctionUnavailable(error) ||
      message.includes("auth session missing") ||
      message.includes("no session") ||
      message.includes("not authenticated") ||
      message.includes("invalid jwt")
    ) {
      return false;
    }
    throw error;
  }
}

/**
 * The native login listener accepts only the callback URL produced by the
 * launcher's loopback OpenID flow. The signed OpenID assertion is forwarded
 * directly to the hosted verifier and is never stored by the client.
 */
export function normalizeSteamOpenIdResponseUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 16_384) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "http:" ||
      (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") ||
      url.port !== "18234" ||
      url.pathname !== "/" ||
      !url.search ||
      url.username ||
      url.password ||
      url.hash
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function toSteamHostedPlatformAccount(value: unknown): SteamHostedPlatformAccount | null {
  if (!isRecord(value) || value.platform !== "steam") return null;
  const platformUserId = readNullableString(value, "platformUserId");
  const verifiedAt = readNullableString(value, "verifiedAt");
  if (
    !platformUserId ||
    !STEAM_ID_PATTERN.test(platformUserId) ||
    !verifiedAt ||
    !Number.isFinite(Date.parse(verifiedAt))
  ) {
    return null;
  }
  return {
    platform: "steam",
    platformAvatarUrl: readNullableString(value, "platformAvatarUrl"),
    platformUserId,
    platformUsername: readNullableString(value, "platformUsername"),
    verifiedAt: new Date(verifiedAt).toISOString(),
  };
}

export async function linkSteamAccountThroughHostedVerifier(
  openidResponseUrl: unknown,
): Promise<SteamHostedPlatformAccount | null> {
  const normalizedUrl = normalizeSteamOpenIdResponseUrl(openidResponseUrl);
  if (!normalizedUrl) {
    throw new Error("Steam OpenID response URL is invalid.");
  }
  if (!isSupabaseConfigured || !(await hasHostedSession())) {
    return null;
  }

  const { data, error } = await getSupabaseClient().functions.invoke("link-steam-account", {
    body: { openidResponseUrl: normalizedUrl },
  });
  if (isHostedFunctionUnavailable(error)) return null;
  if (error) throw await hostedFunctionError(error, "Hosted Steam account verification failed.");
  const endpointError = responseError(data);
  if (endpointError) throw endpointError;
  if (!isRecord(data) || data.ok !== true) {
    throw new Error("Hosted Steam account verification returned an invalid response.");
  }
  const account = toSteamHostedPlatformAccount(data.platformAccount);
  if (!account) {
    throw new Error("Hosted Steam account verification did not return a verified account.");
  }
  return account;
}

function toSteamHostedRelayResult(
  value: unknown,
  expectedGameId: string,
): SteamHostedAchievementRelayResult | null {
  if (!isRecord(value)) return null;
  const achievementsSynced = readCount(value, "achievementsSynced");
  const newUnlocks = readCount(value, "newUnlocks");
  const unlockedCount = readCount(value, "unlockedCount");
  const xpDelta = readCount(value, "xpDelta");
  const syncedAt = readNullableString(value, "syncedAt");
  if (
    value.ok !== true ||
    value.persistence !== "hosted" ||
    value.trust !== "provider_verified" ||
    value.provider !== "steam" ||
    value.gameId !== expectedGameId ||
    achievementsSynced === null ||
    newUnlocks === null ||
    unlockedCount === null ||
    xpDelta === null ||
    !syncedAt ||
    !Number.isFinite(Date.parse(syncedAt))
  ) {
    return null;
  }
  return {
    achievementsSynced,
    gameId: expectedGameId,
    newUnlocks,
    ok: true,
    persistence: "hosted",
    provider: "steam",
    syncedAt: new Date(syncedAt).toISOString(),
    trust: "provider_verified",
    unlockedCount,
    xpDelta,
  };
}

/** Returns null when the hosted relay or its required server-side proof is unavailable. */
export async function relaySteamAchievements(
  game: Game,
  steamAppId: string,
): Promise<SteamHostedAchievementRelayResult | null> {
  if (!STEAM_APP_ID_PATTERN.test(steamAppId)) {
    throw new Error("Steam AppID is invalid.");
  }
  if (!isSupabaseConfigured || !(await hasHostedSession())) {
    return null;
  }
  let gameId: string | null;
  try {
    gameId = await resolveCatalogGameId(game);
  } catch (error) {
    if (isHostedFunctionUnavailable(error)) return null;
    throw error;
  }
  if (!gameId) return null;

  const { data, error } = await getSupabaseClient().functions.invoke("relay-steam-achievements", {
    body: { gameId, steamAppId },
  });
  if (isAchievementRelayUnavailable(error)) return null;
  if (error) throw await hostedFunctionError(error, "Hosted Steam achievement relay failed.");
  const endpointError = responseError(data);
  if (endpointError) throw endpointError;
  const result = toSteamHostedRelayResult(data, gameId);
  if (!result) {
    throw new Error("Hosted Steam achievement relay returned an invalid response.");
  }
  return result;
}
