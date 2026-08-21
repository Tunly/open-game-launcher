import type { UnifiedAchievement } from "./types";
import type { OwnedGame } from "./launcher/types";

type SteamRawGame = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(record: SteamRawGame, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return String(value);
    }
  }

  return "";
}

function readNumber(record: SteamRawGame, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number.parseFloat(value.replace(/,/g, ""));
      if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed;
      }
    }
  }

  return undefined;
}

function readCachedSteamAchievements(
  record: SteamRawGame,
): NonNullable<OwnedGame["achievements"]> | undefined {
  if (!Array.isArray(record.achievements)) {
    return undefined;
  }

  const achievements = record.achievements.slice(0, 500).flatMap((value) => {
    if (!isRecord(value)) return [];
    const id = readString(value, ["id"]);
    const name = readString(value, ["name"]);
    if (!id || !name) return [];

    const unlockedAt = readString(value, ["unlockedAt", "unlocked_at"]);
    const rarity = readNumber(value, ["rarity"]);
    const providerConfidence = readString(value, ["providerConfidence", "provider_confidence"]);

    const achievement: UnifiedAchievement = {
      id,
      name,
      ...(readString(value, ["description"])
        ? { description: readString(value, ["description"]) }
        : {}),
      ...(readString(value, ["iconUrl", "icon_url"])
        ? { iconUrl: readString(value, ["iconUrl", "icon_url"]) }
        : {}),
      unlockedAt: unlockedAt && Number.isFinite(Date.parse(unlockedAt)) ? unlockedAt : null,
      ...(rarity === undefined ? {} : { rarity }),
      source: readString(value, ["source"]) || "steam",
      ...(readString(value, ["sourceAchievementId", "source_achievement_id"])
        ? {
            sourceAchievementId: readString(value, [
              "sourceAchievementId",
              "source_achievement_id",
            ]),
          }
        : {}),
      ...(providerConfidence === "official" ||
      providerConfidence === "unofficial" ||
      providerConfidence === "local"
        ? { providerConfidence }
        : {}),
    };
    return [achievement];
  });

  return achievements.length > 0 ? achievements : undefined;
}

function readSteamAchievementSummary(
  record: SteamRawGame,
): OwnedGame["achievementSummary"] | undefined {
  const value = record.achievementSummary ?? record.achievement_summary;
  if (!isRecord(value)) return undefined;

  const unlocked = readNumber(value, ["unlocked"]);
  const total = readNumber(value, ["total"]);
  const source = readString(value, ["source"]);
  if (unlocked === undefined || total === undefined || total <= 0 || !source) {
    return undefined;
  }

  return {
    unlocked: Math.min(Math.round(unlocked), Math.round(total)),
    total: Math.round(total),
    isPerfect: value.isPerfect === true && unlocked >= total,
    source,
  };
}

function steamImageUrl(appId: string, asset: string) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/${asset}`;
}

const STEAM_NON_GAME_APP_IDS = new Set([
  "228980", // Steamworks Common Redistributables
  "1070560", // Steam Linux Runtime 1.0 (scout)
  "1391110", // Steam Linux Runtime 2.0 (soldier)
  "1628350", // Steam Linux Runtime 3.0 (sniper)
  "1887720", // Proton Experimental
  "2102450", // Proton 9.0
  "2289880", // Steam Linux Runtime 4.0 (soldier)
  "250820", // SteamVR
  "1826330", // Steam Audio
]);

function isSteamNonGameOwnedItem(appId: string, title: string): boolean {
  if (STEAM_NON_GAME_APP_IDS.has(appId)) {
    return true;
  }

  const normalized = title
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");

  return (
    normalized === "steamworks common redistributables" ||
    normalized.startsWith("steam linux runtime") ||
    normalized.startsWith("proton ") ||
    normalized.includes("proton easyanticheat runtime") ||
    normalized.includes("proton battleye runtime") ||
    normalized.includes("steamvr") ||
    normalized.includes("steam vr") ||
    normalized.includes("common redistributable") ||
    normalized.includes("dedicated server") ||
    normalized.endsWith(" sdk") ||
    normalized.includes(" sdk ") ||
    // Call of Duty hub DLC placeholders: "BO7 DLC01 Game Stub 01",
    // "BO7 DLC17 Standard Launch Tracker", "BO7 DLC56 Game Pass Pack 03".
    normalized.includes(" game stub") ||
    normalized.includes(" launch tracker") ||
    normalized.includes(" game pass pack")
  );
}

export function normalizeSteamOwnedGames(games: unknown): OwnedGame[] {
  if (!Array.isArray(games)) {
    return [];
  }

  return games.flatMap((game): OwnedGame[] => {
    if (!game || typeof game !== "object") {
      return [];
    }

    const record = game as SteamRawGame;
    const appId =
      readString(record, ["appid", "appId", "app_id"]) ||
      readString(record, ["id"]).replace(/^steam-owned-/, "");
    const title = readString(record, ["title", "name"]);

    if (!appId || !title) {
      return [];
    }

    if (isSteamNonGameOwnedItem(appId, title)) {
      return [];
    }

    const existingId = readString(record, ["id"]);
    const hours = readNumber(record, ["hours_forever", "hours", "playtimeHours"]);
    const explicitPlaytimeMinutes = readNumber(record, ["playtimeMinutes", "playtime_minutes"]);
    const playtimeMinutes =
      explicitPlaytimeMinutes ?? (hours === undefined ? undefined : Math.round(hours * 60));
    const achievements = readCachedSteamAchievements(record);
    const achievementSummary = readSteamAchievementSummary(record);
    const achievementsSyncedAt = readString(record, [
      "achievementsSyncedAt",
      "achievements_synced_at",
    ]);

    return [
      {
        id: existingId.startsWith("steam-owned-") ? existingId : `steam-owned-${appId}`,
        title,
        description: readString(record, ["description"]),
        coverUrl:
          readString(record, ["heroUrl", "hero_url", "bannerUrl", "banner_url"]) ||
          steamImageUrl(appId, "library_hero.jpg"),
        logoUrl: readString(record, ["logoUrl", "logo_url"]) || steamImageUrl(appId, "header.jpg"),
        iconUrl: readString(record, ["iconUrl", "icon_url"]) || undefined,
        externalId: readString(record, ["externalId", "external_id"]) || appId,
        ...(playtimeMinutes === undefined ? {} : { playtimeMinutes }),
        lastPlayedAt: readString(record, ["lastPlayedAt", "last_played_at"]) || null,
        ...(achievements ? { achievements } : {}),
        ...(achievementSummary ? { achievementSummary } : {}),
        ...(achievementsSyncedAt && Number.isFinite(Date.parse(achievementsSyncedAt))
          ? { achievementsSyncedAt }
          : {}),
      },
    ];
  });
}
