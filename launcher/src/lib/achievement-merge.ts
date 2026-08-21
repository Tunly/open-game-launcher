import type { UnifiedAchievement } from "./types";

/**
 * The shared identity + precedence policy for merging achievement rows.
 *
 * Both the hosted hydration merge (supabase/achievements) and the grouped
 * achievement aggregation (game-groups) key achievements by
 * `provider:sourceAchievementId` and prefer locally-known field values over
 * remotely-provided ones. Keeping those two rules here means a change to the
 * identity rule or the precedence order cannot drift between the two flows.
 */

/** Build the identity key for an achievement row under a provider. */
export function achievementIdentityKey(
  achievement: Pick<UnifiedAchievement, "id" | "source" | "sourceAchievementId">,
  fallbackProvider: string,
): string {
  const provider = achievement.source?.trim() || fallbackProvider;
  const sourceAchievementId = achievement.sourceAchievementId?.trim() || achievement.id;
  return `${provider}:${sourceAchievementId}`;
}

/**
 * Merge a locally-known row with a remotely-provided row, local values first.
 * The later `current` row (already-merged) takes precedence over both.
 * Fields that have no value anywhere are left unset so the merged row keeps
 * the shape the caller expects (no spurious `null`/`undefined` keys).
 */
export function mergeAchievementPrecedence(
  local: UnifiedAchievement | undefined,
  remote: UnifiedAchievement | undefined,
  current: UnifiedAchievement | undefined,
): Partial<UnifiedAchievement> {
  const fields: Partial<UnifiedAchievement> = {};
  const description = local?.description ?? current?.description ?? remote?.description;
  const iconUrl = local?.iconUrl ?? current?.iconUrl ?? remote?.iconUrl;
  const providerConfidence =
    local?.providerConfidence ?? current?.providerConfidence ?? remote?.providerConfidence;
  const rarity = local?.rarity ?? current?.rarity ?? remote?.rarity;
  const source = local?.source ?? current?.source ?? remote?.source;
  const sourceAchievementId =
    local?.sourceAchievementId ?? current?.sourceAchievementId ?? remote?.sourceAchievementId;
  const unlockedAt = local?.unlockedAt ?? current?.unlockedAt ?? remote?.unlockedAt;

  if (description !== undefined) fields.description = description;
  if (iconUrl !== undefined) fields.iconUrl = iconUrl;
  if (providerConfidence !== undefined) fields.providerConfidence = providerConfidence;
  if (rarity !== undefined) fields.rarity = rarity;
  if (source !== undefined) fields.source = source;
  if (sourceAchievementId !== undefined) fields.sourceAchievementId = sourceAchievementId;
  if (unlockedAt !== undefined) fields.unlockedAt = unlockedAt;
  return fields;
}

/**
 * Merge remote rows into a game's locally-known achievements, preserving
 * remote order for new rows and local precedence for field values.
 */
export function mergeAchievementRows(
  localAchievements: readonly UnifiedAchievement[],
  remoteAchievements: readonly UnifiedAchievement[],
  provider: string,
): UnifiedAchievement[] {
  const localByKey = new Map(
    localAchievements.map((achievement) => [
      achievementIdentityKey(achievement, provider),
      achievement,
    ]),
  );
  const byKey = new Map<string, UnifiedAchievement>();
  const orderedKeys: string[] = [];

  for (const remote of remoteAchievements) {
    const key = achievementIdentityKey(remote, provider);
    const local = localByKey.get(key);
    const current = byKey.get(key);
    if (!current && !local) {
      byKey.set(key, remote);
      orderedKeys.push(key);
      continue;
    }

    byKey.set(key, {
      ...remote,
      ...local,
      ...current,
      ...mergeAchievementPrecedence(local, remote, current),
    } as UnifiedAchievement);
    if (!current) orderedKeys.push(key);
  }

  return orderedKeys
    .map((key) => byKey.get(key))
    .filter((item): item is UnifiedAchievement => Boolean(item));
}
