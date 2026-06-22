import { STORAGE_KEYS } from "./storage-keys";
import type { ClientPlatformId, ClientUpdateStatus } from "./types";

export interface ClientUsagePlatformStat {
  platformId: ClientPlatformId;
  displayName: string;
  checkCount: number;
  updateCount: number;
  installedSeenCount: number;
  runningSeenCount: number;
  lastCheckedAt: string | null;
}

export interface ClientUsageStatsState {
  enabled: boolean;
  updatedAt: string | null;
  platforms: Partial<Record<ClientPlatformId, ClientUsagePlatformStat>>;
}

const EMPTY_STATS: ClientUsageStatsState = {
  enabled: false,
  platforms: {},
  updatedAt: null,
};

function getStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function normalizeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function normalizeStat(value: unknown, fallback: ClientUpdateStatus): ClientUsagePlatformStat {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const record = row as Partial<ClientUsagePlatformStat>;

  return {
    checkCount: normalizeCount(record.checkCount),
    displayName: typeof record.displayName === "string" ? record.displayName : fallback.displayName,
    installedSeenCount: normalizeCount(record.installedSeenCount),
    lastCheckedAt: typeof record.lastCheckedAt === "string" ? record.lastCheckedAt : null,
    platformId: fallback.platformId,
    runningSeenCount: normalizeCount(record.runningSeenCount),
    updateCount: normalizeCount(record.updateCount),
  };
}

export function readClientUsageStats(): ClientUsageStatsState {
  const storage = getStorage();
  if (!storage) return { ...EMPTY_STATS, platforms: {} };

  try {
    const raw = storage.getItem(STORAGE_KEYS.CLIENT_USAGE_STATS);
    if (!raw) return { ...EMPTY_STATS, platforms: {} };
    const parsed = JSON.parse(raw) as Partial<ClientUsageStatsState>;
    const platforms =
      parsed.platforms && typeof parsed.platforms === "object" && !Array.isArray(parsed.platforms)
        ? parsed.platforms
        : {};

    return {
      enabled: parsed.enabled === true,
      platforms,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch {
    return { ...EMPTY_STATS, platforms: {} };
  }
}

function writeClientUsageStats(state: ClientUsageStatsState): ClientUsageStatsState {
  const storage = getStorage();
  if (!storage) return state;

  try {
    storage.setItem(STORAGE_KEYS.CLIENT_USAGE_STATS, JSON.stringify(state));
  } catch {
    // Local-only stats must never block client update checks.
  }

  return state;
}

export function setClientUsageStatsEnabled(enabled: boolean, now = new Date().toISOString()) {
  const current = readClientUsageStats();
  return writeClientUsageStats({
    ...current,
    enabled,
    updatedAt: now,
  });
}

export function resetClientUsageStats(now = new Date().toISOString()) {
  const current = readClientUsageStats();
  return writeClientUsageStats({
    enabled: current.enabled,
    platforms: {},
    updatedAt: now,
  });
}

export function recordClientUsageSample(
  statuses: ClientUpdateStatus[],
  now = new Date().toISOString(),
) {
  const current = readClientUsageStats();
  if (!current.enabled) return current;

  const platforms: ClientUsageStatsState["platforms"] = { ...current.platforms };
  for (const status of statuses) {
    const previous = normalizeStat(platforms[status.platformId], status);
    platforms[status.platformId] = {
      checkCount: previous.checkCount + 1,
      displayName: status.displayName,
      installedSeenCount: previous.installedSeenCount + (status.installed ? 1 : 0),
      lastCheckedAt: status.lastCheckedAt || now,
      platformId: status.platformId,
      runningSeenCount: previous.runningSeenCount + (status.running ? 1 : 0),
      updateCount: previous.updateCount + (status.updateAvailable ? 1 : 0),
    };
  }

  return writeClientUsageStats({
    enabled: true,
    platforms,
    updatedAt: now,
  });
}

export function listClientUsagePlatformStats(state = readClientUsageStats()) {
  return Object.values(state.platforms)
    .filter((stat): stat is ClientUsagePlatformStat => Boolean(stat))
    .sort((a, b) => b.checkCount - a.checkCount || a.displayName.localeCompare(b.displayName));
}
