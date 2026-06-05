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
  status: "available",
  message: "Xbox achievement sync available",
  isAvailable: (game) => getGameSource(game) === "xbox" && Boolean(game.externalId),
  sync: (game) => syncGameAchievements(game),
};

const PROVIDERS: Record<string, AchievementProvider> = {
  steam: steamProvider,
  xbox: xboxProvider,
  gog: unavailableProvider(
    "gog",
    "unofficial",
    "no_api",
    "GOG achievements need Galaxy/API credentials before sync can run.",
  ),
  epic: unavailableProvider(
    "epic",
    "official",
    "not_connected",
    "Epic achievements need EOS product credentials before sync can run.",
  ),
  ubisoft: unavailableProvider(
    "ubisoft",
    "unofficial",
    "no_api",
    "Ubisoft achievements are best-effort and no local achievement cache was found.",
  ),
  ea: unavailableProvider(
    "ea",
    "unofficial",
    "no_api",
    "EA achievements are best-effort and no stable player achievement API is configured.",
  ),
  battlenet: unavailableProvider(
    "battlenet",
    "unofficial",
    "no_api",
    "Battle.net achievement data is game-specific and no compatible source is configured.",
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
      message: provider.message,
    };
  }
  return {
    provider: provider.provider,
    status:
      provider.provider === "steam" &&
      getSteamAppId(game) &&
      !readLocalStorageString(STORAGE_KEYS.STEAM_ID)
        ? "not_connected"
        : provider.status,
    stability: provider.stability,
    message:
      provider.provider === "steam" && !getSteamAppId(game)
        ? `${game.title} does not expose a Steam AppID for achievement sync.`
        : provider.provider === "steam" && !readLocalStorageString(STORAGE_KEYS.STEAM_ID)
          ? "Steam achievement sync needs a connected Steam account in Settings."
          : provider.message,
  };
}

export function syncableAchievementGames(games: Game[]): Game[] {
  return games.filter((game) => achievementProviderForGame(game).isAvailable(game));
}
