import { getGameSource } from "./formatters";
import { syncGameAchievements } from "./launcher";
import { STORAGE_KEYS } from "./storage-keys";
import type { Game, SyncGameAchievementsResponse } from "./types";

export type AchievementProviderKind = "official" | "unofficial" | "local";
export type AchievementProviderStatus =
  | "available"
  | "not_connected"
  | "no_api"
  | "private"
  | "failed"
  | "unsupported";

export interface AchievementProviderResult {
  provider: string;
  status: AchievementProviderStatus;
  stability: AchievementProviderKind;
  message: string;
}

export interface AchievementProvider extends AchievementProviderResult {
  isAvailable: (game: Game) => boolean;
  sync: (game: Game) => Promise<SyncGameAchievementsResponse>;
}

function readLocalStorageString(key: string) {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return "";
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : "";
  } catch {
    const trimmed = raw.trim();
    if (trimmed.length >= 2) {
      const first = trimmed[0];
      const last = trimmed[trimmed.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        return trimmed.slice(1, -1);
      }
    }
    return trimmed;
  }
}

function hasNonEmptyJsonArray(key: string) {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return false;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

function canTryLocalImport(game: Game) {
  return game.status === "installed" || game.status === "update_available";
}

function hasEpicSessionMarker() {
  return Boolean(readLocalStorageString(STORAGE_KEYS.EPIC_SESSION_MARKER));
}

function bestEffortAvailabilityMessage(provider: string, game: Game) {
  if (provider === "gog" && hasNonEmptyJsonArray(STORAGE_KEYS.GOG_OWNED_GAMES_CACHE)) {
    return "GOG local library cache found; achievement sync will try Galaxy login, local cache, and sidecar sources.";
  }
  if (provider === "epic" && hasNonEmptyJsonArray(STORAGE_KEYS.EPIC_OWNED_GAMES_CACHE)) {
    return "Epic local library cache found; achievement sync will try Legendary metadata, local cache, sidecar, and public Store fallback sources.";
  }
  if (provider === "epic" && hasEpicSessionMarker()) {
    return "Epic account connected; achievement sync will try Legendary metadata, local cache, sidecar, and public Store fallback sources.";
  }
  if (provider === "battlenet" && hasNonEmptyJsonArray(STORAGE_KEYS.BATTLENET_GAMES_CACHE)) {
    return "Battle.net library cache found; achievement sync will try local cache and sidecar best-effort sources.";
  }
  if (["gog", "epic", "ea", "ubisoft", "battlenet"].includes(provider) && canTryLocalImport(game)) {
    return `${game.title} is installed; achievement sync will try local cache and sidecar best-effort sources.`;
  }
  return null;
}

export function getSteamAppId(game: Game) {
  if (game.launcher === "steam" && game.externalId && /^\d+$/.test(game.externalId)) {
    return game.externalId;
  }

  for (const prefix of ["steam-owned-", "steam-"]) {
    if (game.id.startsWith(prefix)) {
      const appId = game.id.slice(prefix.length);
      if (/^\d+$/.test(appId)) {
        return appId;
      }
    }
  }

  const launchUriAppId = game.launchUri?.match(/^steam:\/\/rungameid\/(\d+)$/)?.[1];
  return launchUriAppId ?? null;
}

export function getXboxTitleHint(game: Game) {
  if (game.launcher !== "xbox") {
    return null;
  }
  return game.externalId?.trim() || game.id || game.title || null;
}

function unavailableProvider(
  provider: string,
  stability: AchievementProviderKind,
  status: AchievementProviderStatus,
  message: string,
): AchievementProvider {
  return {
    provider,
    stability,
    status,
    message,
    isAvailable: () => false,
    sync: async () => {
      throw new Error(message);
    },
  };
}

const steamProvider: AchievementProvider = {
  provider: "steam",
  stability: "official",
  status: "not_connected",
  message: "Steam achievement sync available",
  isAvailable: (game) =>
    getGameSource(game) === "steam" &&
    Boolean(getSteamAppId(game)) &&
    Boolean(readLocalStorageString(STORAGE_KEYS.STEAM_ID)),
  sync: (game) => {
    const steamId = readLocalStorageString(STORAGE_KEYS.STEAM_ID);
    if (!steamId) {
      throw new Error("Steam achievement sync needs a connected Steam account in Settings.");
    }
    return syncGameAchievements(game, steamId);
  },
};

const xboxProvider: AchievementProvider = {
  provider: "xbox",
  stability: "official",
  status: "unsupported",
  message: "Xbox achievement sync available",
  isAvailable: (game) => getGameSource(game) === "xbox" && Boolean(getXboxTitleHint(game)),
  sync: (game) => syncGameAchievements(game),
};

const gogProvider: AchievementProvider = {
  provider: "gog",
  stability: "unofficial",
  status: "not_connected",
  message: "GOG achievement sync needs a connected GOG account or readable local achievement data.",
  isAvailable: () => false,
  sync: async () => {
    throw new Error(
      "GOG achievement sync needs a connected GOG account or local achievement cache.",
    );
  },
};

const epicProvider: AchievementProvider = {
  provider: "epic",
  stability: "unofficial",
  status: "not_connected",
  message: "Epic achievement sync needs a connected Epic account or readable local client data.",
  isAvailable: () => false,
  sync: async () => {
    throw new Error(
      "Epic achievement sync needs Legendary login, local achievement cache, or public Store metadata.",
    );
  },
};

function localCacheProvider(
  provider: "gog" | "epic" | "ea" | "ubisoft" | "battlenet",
  message: string,
  available: () => boolean,
): AchievementProvider {
  return {
    provider,
    stability: "unofficial",
    status: "not_connected",
    message,
    isAvailable: (game) =>
      getGameSource(game) === provider && (available() || canTryLocalImport(game)),
    sync: (game) => syncGameAchievements(game),
  };
}

const PROVIDERS: Record<string, AchievementProvider> = {
  steam: steamProvider,
  xbox: xboxProvider,
  gog: localCacheProvider("gog", gogProvider.message, () =>
    hasNonEmptyJsonArray(STORAGE_KEYS.GOG_OWNED_GAMES_CACHE),
  ),
  epic: localCacheProvider(
    "epic",
    epicProvider.message,
    () => hasNonEmptyJsonArray(STORAGE_KEYS.EPIC_OWNED_GAMES_CACHE) || hasEpicSessionMarker(),
  ),
  ubisoft: localCacheProvider(
    "ubisoft",
    "Ubisoft achievements are best-effort and no local achievement cache was found.",
    () => false,
  ),
  ea: localCacheProvider(
    "ea",
    "EA achievement sync needs a connected EA account before best-effort checks can run.",
    () => false,
  ),
  battlenet: localCacheProvider(
    "battlenet",
    "Battle.net achievement checks need local Battle.net library data before best-effort checks can run.",
    () => hasNonEmptyJsonArray(STORAGE_KEYS.BATTLENET_GAMES_CACHE),
  ),
  manual: unavailableProvider(
    "manual",
    "local",
    "unsupported",
    "Manual games do not sync achievements.",
  ),
  unknown: unavailableProvider(
    "unknown",
    "local",
    "unsupported",
    "Unknown launcher source does not sync achievements.",
  ),
};

export function achievementProviderForGame(game: Game): AchievementProvider {
  return PROVIDERS[getGameSource(game)] ?? PROVIDERS.unknown;
}

export function achievementProviderStatusForGame(game: Game): AchievementProviderResult {
  const provider = achievementProviderForGame(game);
  if (provider.isAvailable(game)) {
    return {
      provider: provider.provider,
      status: "available",
      stability: provider.stability,
      message: bestEffortAvailabilityMessage(provider.provider, game) ?? provider.message,
    };
  }
  return {
    provider: provider.provider,
    status:
      provider.provider === "steam" &&
      getSteamAppId(game) &&
      !readLocalStorageString(STORAGE_KEYS.STEAM_ID)
        ? "not_connected"
        : provider.provider === "gog" && hasNonEmptyJsonArray(STORAGE_KEYS.GOG_OWNED_GAMES_CACHE)
          ? "available"
          : provider.provider === "epic" &&
              hasNonEmptyJsonArray(STORAGE_KEYS.EPIC_OWNED_GAMES_CACHE)
            ? "no_api"
            : provider.provider === "epic" && hasEpicSessionMarker()
              ? "no_api"
              : provider.provider === "ea" && canTryLocalImport(game)
                ? "no_api"
                : provider.provider === "battlenet" &&
                    hasNonEmptyJsonArray(STORAGE_KEYS.BATTLENET_GAMES_CACHE)
                  ? "no_api"
                  : provider.status,
    stability: provider.stability,
    message:
      provider.provider === "steam" && !getSteamAppId(game)
        ? `${game.title} does not expose a Steam AppID for achievement sync.`
        : provider.provider === "steam" && !readLocalStorageString(STORAGE_KEYS.STEAM_ID)
          ? "Steam achievement sync needs a connected Steam account in Settings."
          : provider.provider === "xbox" && !getXboxTitleHint(game)
            ? `${game.title} does not expose an Xbox identity hint for achievement sync.`
            : provider.provider === "gog" &&
                hasNonEmptyJsonArray(STORAGE_KEYS.GOG_OWNED_GAMES_CACHE)
              ? "GOG local library cache found; achievement sync will use client best-effort sources when available."
              : provider.provider === "epic" &&
                  hasNonEmptyJsonArray(STORAGE_KEYS.EPIC_OWNED_GAMES_CACHE)
                ? "Epic local library cache found; achievement sync will use client best-effort sources when available."
                : provider.provider === "epic" && hasEpicSessionMarker()
                  ? "Epic account connected; achievement sync will use Legendary metadata and local fallback sources when available."
                  : provider.provider === "ea" && canTryLocalImport(game)
                    ? "EA installed game detected; achievement sync remains best-effort because no stable player achievement API is configured."
                    : provider.provider === "battlenet" &&
                        hasNonEmptyJsonArray(STORAGE_KEYS.BATTLENET_GAMES_CACHE)
                      ? "Battle.net library cache found; achievement sync remains best-effort because achievement data is game-specific."
                      : provider.message,
  };
}

export function syncableAchievementGames(games: Game[]): Game[] {
  return games.filter((game) => achievementProviderForGame(game).isAvailable(game));
}
