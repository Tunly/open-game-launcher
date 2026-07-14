import { STEAM_OWNED_GAMES_CACHE_VERSION, STORAGE_KEYS } from "./storage-keys";
import type { Game } from "./types";

export const STEAM_ACCOUNT_CHANGED_EVENT = "og-launcher:steam-account-changed";

function readStoredSteamId() {
  try {
    const value = localStorage.getItem(STORAGE_KEYS.STEAM_ID);
    if (!value) return "";
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "string" ? parsed.trim() : "";
  } catch {
    return "";
  }
}

export function clearSteamOwnedGamesCache() {
  localStorage.removeItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE);
  localStorage.removeItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE_ACCOUNT);
  localStorage.removeItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE_VERSION);
}

function removeSteamOwnedGamesFromLibrarySnapshot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LIBRARY_SNAPSHOT);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return false;
    const filtered = parsed.filter(
      (game) =>
        !game ||
        typeof game !== "object" ||
        !("id" in game) ||
        typeof game.id !== "string" ||
        !game.id.startsWith("steam-owned-"),
    );
    if (filtered.length === parsed.length) return false;
    localStorage.setItem(STORAGE_KEYS.LIBRARY_SNAPSHOT, JSON.stringify(filtered));
    return true;
  } catch {
    return false;
  }
}

function invalidateLibrarySnapshot() {
  let snapshotChanged = false;
  try {
    snapshotChanged = localStorage.getItem(STORAGE_KEYS.LIBRARY_SNAPSHOT) !== null;
    localStorage.removeItem(STORAGE_KEYS.LIBRARY_SNAPSHOT);
  } catch {
    // The native library cache remains authoritative when browser storage is unavailable.
  }
  try {
    sessionStorage.removeItem(STORAGE_KEYS.STARTUP_LIBRARY_RESCAN_DONE);
  } catch {
    // A remounted library will still reload immediately when the snapshot was removed.
  }
  return snapshotChanged;
}

function notifySteamAccountChanged() {
  window.dispatchEvent(new Event(STEAM_ACCOUNT_CHANGED_EVENT));
}

export function activateSteamAccount(steamId: string): boolean {
  const normalizedSteamId = steamId.trim();
  if (!normalizedSteamId) {
    return clearSteamAccount();
  }

  if (readStoredSteamId() !== normalizedSteamId) {
    clearSteamOwnedGamesCache();
    invalidateLibrarySnapshot();
    localStorage.setItem(STORAGE_KEYS.STEAM_ID, JSON.stringify(normalizedSteamId));
    notifySteamAccountChanged();
    return true;
  }
  localStorage.setItem(STORAGE_KEYS.STEAM_ID, JSON.stringify(normalizedSteamId));
  return false;
}

export function clearSteamAccount(): boolean {
  const hadStoredAccount = Boolean(readStoredSteamId());
  const hadCachedGames = Boolean(
    localStorage.getItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE) ||
    localStorage.getItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE_ACCOUNT),
  );
  const snapshotChanged = hadStoredAccount
    ? invalidateLibrarySnapshot()
    : removeSteamOwnedGamesFromLibrarySnapshot();
  if (!hadStoredAccount && (hadCachedGames || snapshotChanged)) {
    try {
      sessionStorage.removeItem(STORAGE_KEYS.STARTUP_LIBRARY_RESCAN_DONE);
    } catch {
      // The account-change event still refreshes a mounted library.
    }
  }
  localStorage.removeItem(STORAGE_KEYS.STEAM_ID);
  clearSteamOwnedGamesCache();
  const changed = hadStoredAccount || hadCachedGames || snapshotChanged;
  if (changed) notifySteamAccountChanged();
  return changed;
}

export function readSteamOwnedGamesCache(steamId: string) {
  const normalizedSteamId = steamId.trim();
  if (
    !normalizedSteamId ||
    localStorage.getItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE_ACCOUNT) !== normalizedSteamId ||
    localStorage.getItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE_VERSION) !==
      STEAM_OWNED_GAMES_CACHE_VERSION
  ) {
    return null;
  }

  return localStorage.getItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE);
}

function steamOwnedGameCacheKey(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (/^steam-owned-\d+$/.test(id)) return id;

  const rawAppId = record.appid ?? record.appId ?? record.app_id ?? record.externalId;
  const appId =
    typeof rawAppId === "number" && Number.isFinite(rawAppId)
      ? String(rawAppId)
      : typeof rawAppId === "string"
        ? rawAppId.trim()
        : "";
  return /^\d+$/.test(appId) ? `steam-owned-${appId}` : null;
}

function achievementCacheFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const achievements = Array.isArray(record.achievements) ? record.achievements : null;
  const achievementSummary =
    record.achievementSummary && typeof record.achievementSummary === "object"
      ? record.achievementSummary
      : null;
  if (!achievements && !achievementSummary) return null;
  return {
    ...(achievements ? { achievements } : {}),
    ...(achievementSummary ? { achievementSummary } : {}),
    ...(typeof record.achievementsSyncedAt === "string"
      ? { achievementsSyncedAt: record.achievementsSyncedAt }
      : {}),
  };
}

export function writeSteamOwnedGamesCache(steamId: string, games: unknown[]) {
  const normalizedSteamId = steamId.trim();
  if (!normalizedSteamId) return;

  const achievementFieldsByGame = new Map<
    string,
    NonNullable<ReturnType<typeof achievementCacheFields>>
  >();
  const existingRaw = readSteamOwnedGamesCache(normalizedSteamId);
  if (existingRaw) {
    try {
      const existing: unknown = JSON.parse(existingRaw);
      if (Array.isArray(existing)) {
        for (const game of existing) {
          const key = steamOwnedGameCacheKey(game);
          const fields = achievementCacheFields(game);
          if (key && fields) achievementFieldsByGame.set(key, fields);
        }
      }
    } catch {
      // A malformed provider cache is replaced by the fresh provider result below.
    }
  }

  const gamesWithAchievements = games.map((game) => {
    const key = steamOwnedGameCacheKey(game);
    const preserved = key ? achievementFieldsByGame.get(key) : null;
    return preserved && game && typeof game === "object" && !Array.isArray(game)
      ? { ...preserved, ...(game as Record<string, unknown>) }
      : game;
  });

  localStorage.setItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE, JSON.stringify(gamesWithAchievements));
  localStorage.setItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE_ACCOUNT, normalizedSteamId);
  localStorage.setItem(
    STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE_VERSION,
    STEAM_OWNED_GAMES_CACHE_VERSION,
  );
}

export function cacheSteamOwnedGameAchievements(game: Game) {
  if (!game.id.startsWith("steam-owned-")) return false;
  const steamId = readStoredSteamId();
  const raw = readSteamOwnedGamesCache(steamId);
  if (!steamId || !raw) return false;

  try {
    const cached: unknown = JSON.parse(raw);
    if (!Array.isArray(cached)) return false;
    let matched = false;
    const updated = cached.map((entry) => {
      if (steamOwnedGameCacheKey(entry) !== game.id || !entry || typeof entry !== "object") {
        return entry;
      }
      matched = true;
      return {
        ...(entry as Record<string, unknown>),
        achievements: game.achievements ?? [],
        achievementsSyncedAt: game.achievementsSyncedAt ?? null,
      };
    });
    if (!matched) return false;
    writeSteamOwnedGamesCache(steamId, updated);
    return true;
  } catch {
    return false;
  }
}
