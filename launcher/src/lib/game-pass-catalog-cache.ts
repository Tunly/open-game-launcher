import type { OwnedGame } from "./launcher";

export const GAME_PASS_CATALOG_CACHE_VERSION = 1;
export const GAME_PASS_CATALOG_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1_000;
export const GAME_PASS_CATALOG_RETRY_DELAY_MS = 5 * 60 * 1_000;

export interface GamePassCatalogCacheState {
  games: OwnedGame[];
  fetchedAt: number | null;
  lastAttemptedAt: number | null;
  isFresh: boolean;
  shouldRefresh: boolean;
}

interface PersistedGamePassCatalogCache {
  version: typeof GAME_PASS_CATALOG_CACHE_VERSION;
  fetchedAt: number | null;
  lastAttemptedAt: number;
  games: OwnedGame[];
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function catalogProductId(record: Record<string, unknown>): string | null {
  const externalId = optionalString(record.externalId);
  const rawId = optionalString(record.id);
  const id = externalId ?? rawId?.replace(/^(?:gamepass|xbox)-/i, "") ?? null;
  return id && /^[a-z0-9]{12}$/i.test(id) ? id.toUpperCase() : null;
}

export function normalizeGamePassCatalogGames(value: unknown): OwnedGame[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const games = new Map<string, OwnedGame>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const productId = catalogProductId(record);
    const title = optionalString(record.title);
    if (!productId || !title) {
      continue;
    }

    const key = productId.toLowerCase();
    if (games.has(key)) {
      continue;
    }

    games.set(key, {
      id: `xbox-${productId}`,
      externalId: productId,
      title,
      catalogSource: "pc_game_pass",
      description: optionalString(record.description) ?? "PC Game Pass catalog",
      coverUrl: optionalString(record.coverUrl),
      logoUrl: optionalString(record.logoUrl),
      ...(optionalString(record.iconUrl) ? { iconUrl: optionalString(record.iconUrl)! } : {}),
      playtimeMinutes: null,
      lastPlayedAt: null,
      cloudGamingUrl: null,
    });
  }

  return [...games.values()];
}

function cacheState(
  games: OwnedGame[],
  fetchedAt: number | null,
  lastAttemptedAt: number | null,
  now: number,
): GamePassCatalogCacheState {
  const fetchedAge = fetchedAt === null ? null : now - fetchedAt;
  const attemptAge = lastAttemptedAt === null ? null : now - lastAttemptedAt;
  const isFresh =
    games.length > 0 &&
    fetchedAge !== null &&
    fetchedAge >= 0 &&
    fetchedAge < GAME_PASS_CATALOG_CACHE_MAX_AGE_MS;
  const retryDelayElapsed =
    attemptAge === null || attemptAge < 0 || attemptAge >= GAME_PASS_CATALOG_RETRY_DELAY_MS;

  return {
    games,
    fetchedAt,
    lastAttemptedAt,
    isFresh,
    shouldRefresh: !isFresh && retryDelayElapsed,
  };
}

export function readGamePassCatalogCache(
  raw: string | null,
  now = Date.now(),
): GamePassCatalogCacheState {
  if (!raw) {
    return cacheState([], null, null, now);
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return cacheState(normalizeGamePassCatalogGames(parsed), null, null, now);
    }
    if (!parsed || typeof parsed !== "object") {
      return cacheState([], null, null, now);
    }

    const record = parsed as Record<string, unknown>;
    if (record.version !== GAME_PASS_CATALOG_CACHE_VERSION) {
      return cacheState([], null, null, now);
    }

    return cacheState(
      normalizeGamePassCatalogGames(record.games),
      finiteTimestamp(record.fetchedAt),
      finiteTimestamp(record.lastAttemptedAt),
      now,
    );
  } catch {
    return cacheState([], null, null, now);
  }
}

export function serializeGamePassCatalogCache(
  state: Pick<GamePassCatalogCacheState, "games" | "fetchedAt">,
  lastAttemptedAt = Date.now(),
): string {
  const payload: PersistedGamePassCatalogCache = {
    version: GAME_PASS_CATALOG_CACHE_VERSION,
    fetchedAt: state.fetchedAt,
    lastAttemptedAt,
    games: normalizeGamePassCatalogGames(state.games),
  };
  return JSON.stringify(payload);
}
