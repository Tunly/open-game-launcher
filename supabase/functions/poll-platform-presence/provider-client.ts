import {
  type PlatformAccountRow,
  type PlatformPollResult,
  type PlatformType,
  type PresenceStatus,
  type ProviderSkip,
} from "./handler.ts";

const platformIds: PlatformType[] = [
  "steam",
  "epic",
  "gog",
  "ea",
  "xbox",
  "battlenet",
  "ubisoft",
  "og",
];

export type ProviderClientDeps = {
  env?: (name: string) => string | undefined;
  fetch?: typeof fetch;
};

export function toPlatformAccount(row: unknown): PlatformAccountRow | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  const record = row as Record<string, unknown>;
  const platform = normalizePlatform(readString(record, "platform"));
  const id = readString(record, "id");
  const platformUserId = readString(record, "platform_user_id");
  const userId = readString(record, "user_id");
  if (!id || !platform || !platformUserId || !userId || platform === "og") {
    return null;
  }

  return {
    id,
    metadata: readRecord(record, "metadata"),
    platform,
    platformUserId,
    updatedAt: readString(record, "updated_at") ?? "",
    userId,
  };
}

export async function pollPlatformPresence(
  account: PlatformAccountRow,
  deps: ProviderClientDeps = {},
): Promise<PlatformPollResult | ProviderSkip> {
  if (account.platform === "steam") {
    return pollSteamPresence(account, deps);
  }

  return pollConfiguredEndpoint(account, deps);
}

async function pollSteamPresence(
  account: PlatformAccountRow,
  deps: ProviderClientDeps,
): Promise<PlatformPollResult | ProviderSkip> {
  const apiKey = readEnv(deps, "STEAM_WEB_API_KEY")?.trim();
  if (!apiKey) {
    return { reason: "missing-provider" };
  }

  const url = new URL(
    "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/",
  );
  url.searchParams.set("key", apiKey);
  url.searchParams.set("steamids", account.platformUserId);

  const response = await fetchWithTimeout(url, {
    headers: { "User-Agent": "OG-Launcher/0.1" },
  }, deps);
  if (response.status === 429) {
    return {
      reason: "rate-limited",
      retryAfterSeconds: readRetryAfter(response),
    };
  }
  if (!response.ok) {
    return { reason: "provider-error" };
  }

  const json = await response.json().catch(() => null);
  const player = Array.isArray(json?.response?.players)
    ? json.response.players[0]
    : null;
  if (!player || typeof player !== "object") {
    return {
      currentGameTitle: null,
      platform: "steam",
      platformGameId: null,
      source: "steam_web_api",
      status: "offline",
    };
  }

  const playerRecord = player as Record<string, unknown>;
  const currentGameTitle = readString(playerRecord, "gameextrainfo");
  return {
    currentGameTitle,
    platform: "steam",
    platformGameId: readString(playerRecord, "gameid"),
    source: "steam_web_api",
    status: currentGameTitle
      ? "online"
      : steamPersonaStatus(playerRecord.personastate),
  };
}

async function pollConfiguredEndpoint(
  account: PlatformAccountRow,
  deps: ProviderClientDeps,
): Promise<PlatformPollResult | ProviderSkip> {
  const endpoint = readEnv(
    deps,
    `${providerEnvPrefix(account.platform)}_PRESENCE_ENDPOINT`,
  )?.trim();
  if (!endpoint) {
    return { reason: "missing-provider" };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "OG-Launcher/0.1",
  };
  const token = readEnv(deps, "PRESENCE_PROVIDER_TOKEN")?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetchWithTimeout(endpoint, {
    body: JSON.stringify({
      accountId: account.id,
      platform: account.platform,
      platformUserId: account.platformUserId,
      userId: account.userId,
    }),
    headers,
    method: "POST",
  }, deps);
  if (response.status === 429) {
    return {
      reason: "rate-limited",
      retryAfterSeconds: readRetryAfter(response),
    };
  }
  if (!response.ok) {
    return { reason: "provider-error" };
  }

  const json = await response.json().catch(() => null);
  if (!json || typeof json !== "object") {
    return { reason: "provider-error" };
  }

  const record = json as Record<string, unknown>;
  return {
    currentGameTitle: readString(record, "currentGameTitle") ??
      readString(record, "gameTitle"),
    platform: account.platform,
    platformGameId: readString(record, "platformGameId") ??
      readString(record, "gameId"),
    source: readString(record, "source") ??
      `${account.platform}_presence_endpoint`,
    status: normalizePresenceStatus(readString(record, "status")) ?? "offline",
  };
}

async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  deps: ProviderClientDeps,
) {
  const timeoutMs = readPositiveInt(deps, "PRESENCE_POLL_TIMEOUT_MS", 8000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetchImpl = deps.fetch ?? fetch;
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizePlatform(value: string | null): PlatformType | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return platformIds.includes(normalized as PlatformType)
    ? (normalized as PlatformType)
    : null;
}

function normalizePresenceStatus(value: string | null): PresenceStatus | null {
  if (
    value === "offline" ||
    value === "online" ||
    value === "away" ||
    value === "busy"
  ) {
    return value;
  }

  return null;
}

function steamPersonaStatus(value: unknown): PresenceStatus {
  const state = typeof value === "number" ? value : Number(value);
  if (state === 2) {
    return "busy";
  }
  if (state === 3 || state === 4) {
    return "away";
  }
  if (state === 1 || state === 5 || state === 6) {
    return "online";
  }

  return "offline";
}

function providerEnvPrefix(platform: PlatformType) {
  return platform.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

function readEnv(deps: ProviderClientDeps, name: string) {
  return deps.env ? deps.env(name) : Deno.env.get(name);
}

function readPositiveInt(
  deps: ProviderClientDeps,
  name: string,
  fallback: number,
) {
  const raw = readEnv(deps, name);
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readRetryAfter(response: Response) {
  const raw = response.headers.get("Retry-After");
  if (!raw) {
    return undefined;
  }
  const seconds = Number.parseInt(raw, 10);
  return Number.isFinite(seconds) ? seconds : undefined;
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
