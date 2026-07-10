export type AchievementProviderConfidence = "official" | "unofficial" | "local";
export type AchievementRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary";

export type NormalizedAchievement = {
  description: string | null;
  iconUrl: string | null;
  key: string;
  name: string;
  points: number;
  provider: string;
  providerConfidence: AchievementProviderConfidence;
  rarity: AchievementRarity;
  rarityPercent: number | null;
  sourceAchievementId: string;
  unlockedAt: string | null;
};

export type NormalizedAchievementIngestion = {
  achievements: NormalizedAchievement[];
  gameId: string;
  launcherDeviceId: string | null;
  provider: string;
  providerConfidence: AchievementProviderConfidence;
  syncedAt: string | null;
};

export class AchievementIngestionValidationError extends Error {
  details: string[];

  constructor(details: string[]) {
    super("Invalid achievement ingestion payload.");
    this.name = "AchievementIngestionValidationError";
    this.details = details;
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validProviderConfidences = new Set<AchievementProviderConfidence>([
  "official",
  "unofficial",
  "local",
]);
const officialAchievementProviders = new Set(["steam", "xbox"]);
const rarityBasePoints: Record<AchievementRarity, number> = {
  common: 10,
  uncommon: 25,
  rare: 50,
  epic: 100,
  legendary: 200,
};
const confidenceXpMultiplier: Record<AchievementProviderConfidence, number> = {
  official: 1,
  unofficial: 0.5,
  local: 0.25,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoundedString(
  record: Record<string, unknown>,
  key: string,
  maxLength: number,
  errors: string[],
): string | null | undefined {
  if (!(key in record)) {
    return undefined;
  }

  const value = record[key];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    errors.push(`${key} must be a string or null.`);
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    errors.push(`${key} must be ${maxLength} characters or shorter.`);
    return undefined;
  }
  return trimmed || null;
}

function readIsoDate(
  record: Record<string, unknown>,
  key: string,
  errors: string[],
): string | null | undefined {
  if (!(key in record)) {
    return undefined;
  }

  const value = record[key];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${key} must be an ISO timestamp or null.`);
    return undefined;
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    errors.push(`${key} must be a valid ISO timestamp.`);
    return undefined;
  }
  return date.toISOString();
}

function normalizeProvider(value: unknown): string {
  if (typeof value !== "string") {
    return "unknown";
  }
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  return normalized.slice(0, 48).replace(/^-+|-+$/g, "") || "unknown";
}

function normalizeProviderConfidence(
  value: unknown,
): AchievementProviderConfidence {
  if (typeof value !== "string") {
    return "local";
  }
  const normalized = value.trim()
    .toLowerCase() as AchievementProviderConfidence;
  return validProviderConfidences.has(normalized) ? normalized : "local";
}

function normalizeRarity(value: unknown): {
  rarity: AchievementRarity;
  rarityPercent: number | null;
} {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase() as AchievementRarity;
    if (normalized in rarityBasePoints) {
      return { rarity: normalized, rarityPercent: null };
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const rarity = value <= 1
      ? "legendary"
      : value <= 5
      ? "epic"
      : value <= 15
      ? "rare"
      : value <= 40
      ? "uncommon"
      : "common";
    return {
      rarity,
      rarityPercent: value >= 0 && value <= 100 ? value : null,
    };
  }

  return { rarity: "common", rarityPercent: null };
}

export function calculateAchievementPoints(
  rarity: AchievementRarity,
  providerConfidence: AchievementProviderConfidence,
) {
  return Math.max(
    1,
    Math.floor(
      rarityBasePoints[rarity] * confidenceXpMultiplier[providerConfidence],
    ),
  );
}

export function calculateProfileLevel(profileXp: number) {
  return Math.max(1, Math.floor(Math.max(0, profileXp) / 1_000) + 1);
}

function normalizeAchievement(
  value: unknown,
  index: number,
  provider: string,
  providerConfidence: AchievementProviderConfidence,
  errors: string[],
): NormalizedAchievement | null {
  const record = asRecord(value);
  const prefix = `achievements[${index}].`;
  if (!record) {
    errors.push(`${prefix.slice(0, -1)} must be an object.`);
    return null;
  }

  const achievementErrors: string[] = [];
  const sourceAchievementId =
    readBoundedString(record, "sourceAchievementId", 180, achievementErrors) ??
      readBoundedString(
        record,
        "source_achievement_id",
        180,
        achievementErrors,
      ) ??
      readBoundedString(record, "id", 180, achievementErrors);
  if (!sourceAchievementId) {
    achievementErrors.push(`${prefix}id or sourceAchievementId is required.`);
  }

  const name = readBoundedString(record, "name", 200, achievementErrors);
  if (!name) {
    achievementErrors.push(`${prefix}name is required.`);
  }

  const description =
    readBoundedString(record, "description", 1_000, achievementErrors) ?? null;
  const iconUrl =
    readBoundedString(record, "iconUrl", 2_000, achievementErrors) ??
      readBoundedString(record, "icon_url", 2_000, achievementErrors) ??
      null;
  const unlockedAt = readIsoDate(record, "unlockedAt", achievementErrors) ??
    readIsoDate(record, "unlocked_at", achievementErrors) ??
    null;
  const { rarity, rarityPercent } = normalizeRarity(record.rarity);
  if (
    typeof record.rarity === "number" &&
    (!Number.isFinite(record.rarity) || rarityPercent === null)
  ) {
    achievementErrors.push(`${prefix}rarity must be between 0 and 100.`);
  }
  const key = sourceAchievementId ? `${provider}:${sourceAchievementId}` : "";

  if (key.length > 240) {
    achievementErrors.push(
      `${prefix}sourceAchievementId is too long for a catalog key.`,
    );
  }

  errors.push(...achievementErrors);
  if (!sourceAchievementId || !name || key.length > 240) {
    return null;
  }

  return {
    description,
    iconUrl,
    key,
    name,
    points: calculateAchievementPoints(rarity, providerConfidence),
    provider,
    providerConfidence,
    rarity,
    rarityPercent,
    sourceAchievementId,
    unlockedAt,
  };
}

export function normalizeAchievementIngestionPayload(
  payload: unknown,
): NormalizedAchievementIngestion {
  const body = asRecord(payload);
  if (!body) {
    throw new AchievementIngestionValidationError([
      "Payload must be a JSON object.",
    ]);
  }

  const errors: string[] = [];
  const gameId = readString(body, "gameId") ?? readString(body, "game_id");
  if (!gameId) {
    errors.push("gameId is required.");
  } else if (!uuidPattern.test(gameId)) {
    errors.push("gameId must be a catalog game UUID.");
  }

  const provider = normalizeProvider(body.provider);
  const providerConfidence = normalizeProviderConfidence(
    body.providerConfidence ?? body.provider_confidence,
  );
  if (
    providerConfidence === "official" &&
    !officialAchievementProviders.has(provider)
  ) {
    errors.push(
      "providerConfidence official is only accepted for official providers.",
    );
  }
  const launcherDeviceId =
    readBoundedString(body, "launcherDeviceId", 128, errors) ??
      readBoundedString(body, "launcher_device_id", 128, errors) ??
      null;
  const syncedAt = readIsoDate(body, "syncedAt", errors) ??
    readIsoDate(body, "synced_at", errors) ??
    null;
  const rawAchievements = body.achievements;
  const achievements: NormalizedAchievement[] = [];

  if (!Array.isArray(rawAchievements)) {
    errors.push("achievements must be an array.");
  } else if (rawAchievements.length > 500) {
    errors.push("achievements must contain at most 500 rows.");
  } else {
    const seenKeys = new Set<string>();
    rawAchievements.forEach((achievement, index) => {
      const normalized = normalizeAchievement(
        achievement,
        index,
        provider,
        providerConfidence,
        errors,
      );
      if (!normalized) {
        return;
      }
      if (seenKeys.has(normalized.key)) {
        errors.push(
          `achievements[${index}].id duplicates another achievement in this payload.`,
        );
        return;
      }
      seenKeys.add(normalized.key);
      achievements.push(normalized);
    });
  }

  if (errors.length === 0 && achievements.length === 0) {
    errors.push("At least one achievement row is required.");
  }

  if (errors.length > 0) {
    throw new AchievementIngestionValidationError(errors);
  }

  return {
    achievements,
    gameId: gameId ?? "",
    launcherDeviceId,
    provider,
    providerConfidence,
    syncedAt,
  };
}

export function summarizeAchievementXp(
  achievements: NormalizedAchievement[],
  newUnlockKeys: Set<string>,
) {
  let xpDelta = 0;
  let newUnlocks = 0;

  for (const achievement of achievements) {
    if (!achievement.unlockedAt || !newUnlockKeys.has(achievement.key)) {
      continue;
    }
    newUnlocks += 1;
    xpDelta += achievement.points;
  }

  return { newUnlocks, xpDelta };
}
