import type { Game, UnifiedAchievement } from "../types";
import { getCurrentSessionUserId, getSupabaseClient, isSupabaseConfigured } from "./client";
import { handleError, rowNullableString, rowString, type UnknownRecord } from "./helpers";

const OGL_CATALOG_SELECT = `
  id,
  slug,
  title,
  description,
  short_description,
  developer_name,
  publisher_name,
  cover_url,
  banner_url,
  icon_url,
  release_date,
  updated_at,
  achievements (
    id,
    key,
    name,
    description,
    icon_url,
    rarity_percent,
    source_synced_at,
    updated_at
  )
`;

type AchievementUnlock = {
  achievementId: string;
  unlockedAt: string;
};

function nestedRows(row: UnknownRecord, key: string): UnknownRecord[] {
  const value = row[key];
  return Array.isArray(value)
    ? value.filter(
        (item): item is UnknownRecord =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function latestTimestamp(rows: UnknownRecord[]): string | null {
  let latest: string | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    const value =
      rowNullableString(row, "source_synced_at") ?? rowNullableString(row, "updated_at");
    if (!value) continue;
    const time = Date.parse(value);
    if (!Number.isNaN(time) && time > latestTime) {
      latest = value;
      latestTime = time;
    }
  }
  return latest;
}

function mapAchievement(
  row: UnknownRecord,
  unlocksByAchievementId: ReadonlyMap<string, AchievementUnlock>,
): UnifiedAchievement | null {
  const definitionId = rowString(row, "id");
  const key = rowString(row, "key");
  const name = rowString(row, "name");
  if (!definitionId || !key || !name) return null;

  const rarityPercent = row.rarity_percent;
  const achievement: UnifiedAchievement = {
    id: key,
    name,
    source: "ogl",
    sourceAchievementId: key,
    providerConfidence: "official",
    unlockedAt: unlocksByAchievementId.get(definitionId)?.unlockedAt ?? null,
  };
  const description = rowNullableString(row, "description");
  const iconUrl = rowNullableString(row, "icon_url");
  if (description) achievement.description = description;
  if (iconUrl) achievement.iconUrl = iconUrl;
  if (typeof rarityPercent === "number") achievement.rarity = rarityPercent;
  return achievement;
}

export function mapOglCatalogRows(
  rows: UnknownRecord[],
  unlocks: AchievementUnlock[] = [],
): Game[] {
  const unlocksByAchievementId = new Map(
    unlocks.map((unlock) => [unlock.achievementId, unlock] as const),
  );

  return rows.flatMap((row) => {
    const catalogId = rowString(row, "id");
    const slug = rowString(row, "slug");
    const title = rowString(row, "title");
    if (!catalogId || !slug || !title) return [];

    const achievementRows = nestedRows(row, "achievements");
    const achievements = achievementRows
      .map((achievement) => mapAchievement(achievement, unlocksByAchievementId))
      .filter((achievement): achievement is UnifiedAchievement => Boolean(achievement));
    const description =
      rowNullableString(row, "description") ?? rowNullableString(row, "short_description") ?? "";
    const bannerUrl = rowNullableString(row, "banner_url");
    const coverUrl = rowNullableString(row, "cover_url");

    return [
      {
        id: `ogl-${slug}`,
        slug,
        title,
        description,
        version: "Catalog",
        launcher: "ogl",
        platform: "windows",
        status: "not_installed",
        productCategory: "game",
        coverUrl: bannerUrl ?? coverUrl ?? undefined,
        iconUrl: rowNullableString(row, "icon_url") ?? undefined,
        developer: rowNullableString(row, "developer_name") ?? undefined,
        publisher: rowNullableString(row, "publisher_name") ?? undefined,
        releaseDate: rowNullableString(row, "release_date") ?? undefined,
        achievements,
        achievementsSyncedAt: latestTimestamp(achievementRows),
        achievementProviderStatuses: [
          {
            source: "ogl",
            status: "available",
            stability: "official",
            message: "Achievement definitions supplied by OG Launcher.",
          },
        ],
      },
    ];
  });
}

async function listOwnUnlocks(achievementIds: string[]): Promise<AchievementUnlock[]> {
  if (achievementIds.length === 0) return [];

  const userId = await getCurrentSessionUserId().catch(() => null);
  if (!userId) return [];

  const client = getSupabaseClient();
  const { data, error } = await client
    .from("user_achievements")
    .select("achievement_id, unlocked_at")
    .eq("user_id", userId)
    .in("achievement_id", achievementIds);
  handleError(error);

  return ((data ?? []) as UnknownRecord[]).flatMap((row) => {
    const achievementId = rowString(row, "achievement_id");
    const unlockedAt = rowString(row, "unlocked_at");
    return achievementId && unlockedAt ? [{ achievementId, unlockedAt }] : [];
  });
}

export async function listOglCatalogGames(): Promise<Game[]> {
  if (!isSupabaseConfigured) return [];

  const client = getSupabaseClient();
  const { data, error } = await client
    .from("games")
    .select(OGL_CATALOG_SELECT)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  handleError(error);

  const rows = (data ?? []) as unknown as UnknownRecord[];
  const achievementIds = rows.flatMap((row) =>
    nestedRows(row, "achievements")
      .map((achievement) => rowString(achievement, "id"))
      .filter(Boolean),
  );
  const unlocks = await listOwnUnlocks(achievementIds).catch((error) => {
    console.warn("[OG-Launcher] Personal OGL achievement unlocks unavailable:", error);
    return [];
  });
  return mapOglCatalogRows(rows, unlocks);
}
