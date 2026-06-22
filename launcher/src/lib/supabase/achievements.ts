import type { Game, UnifiedAchievement } from "../types";
import { getLauncherDeviceId } from "../launcher";
import { getCurrentSessionUserId, getSupabaseClient, isSupabaseConfigured } from "./client";
import {
  handleError,
  isMissingSchemaError,
  rowNullableString,
  rowString,
  type UnknownRecord,
} from "./helpers";
import { resolveCatalogGameId } from "./playtime";
import { isTrustedIngestionStrictMode, trustedIngestionStrictModeError } from "./trusted-ingestion";

type AchievementProviderConfidence = "official" | "unofficial" | "local";

type TrustedAchievementPayload = {
  achievements: Array<{
    description?: string | null;
    iconUrl?: string | null;
    id: string;
    name: string;
    rarity?: number | null;
    sourceAchievementId?: string;
    unlockedAt?: string | null;
  }>;
  gameId: string;
  launcherDeviceId?: string | null;
  provider: string;
  providerConfidence: AchievementProviderConfidence;
  syncedAt?: string | null;
};

type SupabaseFunctionErrorLike = {
  context?: { status?: number };
  message?: string;
  name?: string;
  status?: number;
};

type SupabaseFunctionInvoker = (
  functionName: string,
  options: { body: TrustedAchievementPayload },
) => Promise<{ data: unknown; error: SupabaseFunctionErrorLike | null }>;

export type TrustedAchievementIngestionInput = {
  game: Game;
  provider?: string | null;
  providerConfidence?: AchievementProviderConfidence | null;
  syncedAt?: string | null;
};

export type TrustedAchievementIngestionResult = {
  achievementsSynced: number;
  newUnlocks: number;
  ok: boolean;
  skipped?: boolean;
  unlockedCount: number;
  xpDelta: number;
};

type RemoteAchievementDefinition = {
  description: string | null;
  iconUrl: string | null;
  id: string;
  key: string;
  name: string;
};

type RemoteAchievementUnlock = {
  achievementId: string;
  metadata: Record<string, unknown>;
  unlockedAt: string | null;
};

function getTrustedAchievementInvoker(client: unknown): SupabaseFunctionInvoker | null {
  const functions = (client as { functions?: { invoke?: SupabaseFunctionInvoker } }).functions;
  return typeof functions?.invoke === "function" ? functions.invoke.bind(functions) : null;
}

function isTrustedAchievementIngestionUnavailable(error: unknown) {
  const typedError = (error ?? {}) as SupabaseFunctionErrorLike;
  const status = typedError.status ?? typedError.context?.status ?? null;
  const message = String(typedError.message ?? "").toLowerCase();
  const name = String(typedError.name ?? "").toLowerCase();

  return (
    status === 404 ||
    status === 503 ||
    name.includes("fetch") ||
    message.includes("failed to fetch") ||
    message.includes("function not found") ||
    message.includes("not found") ||
    message.includes("networkerror")
  );
}

function normalizeProvider(value: string | null | undefined, game: Game) {
  const candidate = value || game.launcher || "unknown";
  return candidate.trim().toLowerCase() || "unknown";
}

function toTrustedAchievementRow(achievement: UnifiedAchievement) {
  const sourceAchievementId = achievement.sourceAchievementId?.trim() || achievement.id;
  return {
    description: achievement.description ?? null,
    iconUrl: achievement.iconUrl ?? null,
    id: achievement.id,
    name: achievement.name,
    rarity: achievement.rarity ?? null,
    sourceAchievementId,
    unlockedAt: achievement.unlockedAt ?? null,
  };
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function providerKey(provider: string, sourceAchievementId: string) {
  return `${provider}:${sourceAchievementId}`;
}

function parseProviderKey(key: string): { provider: string; sourceAchievementId: string } | null {
  const separator = key.indexOf(":");
  if (separator <= 0 || separator >= key.length - 1) {
    return null;
  }

  return {
    provider: key.slice(0, separator),
    sourceAchievementId: key.slice(separator + 1),
  };
}

function achievementMapKey(achievement: UnifiedAchievement, fallbackProvider: string) {
  return providerKey(
    achievement.source?.trim() || fallbackProvider,
    achievement.sourceAchievementId?.trim() || achievement.id,
  );
}

function providerConfidenceFromMetadata(
  metadata: Record<string, unknown>,
): AchievementProviderConfidence | undefined {
  const value = metadata.provider_confidence;
  return value === "official" || value === "unofficial" || value === "local" ? value : undefined;
}

function toRemoteAchievementDefinition(row: UnknownRecord): RemoteAchievementDefinition {
  return {
    description: rowNullableString(row, "description"),
    iconUrl: rowNullableString(row, "icon_url"),
    id: rowString(row, "id"),
    key: rowString(row, "key"),
    name: rowString(row, "name", "Achievement"),
  };
}

function toRemoteAchievementUnlock(row: UnknownRecord): RemoteAchievementUnlock {
  return {
    achievementId: rowString(row, "achievement_id"),
    metadata: metadataRecord(row.metadata),
    unlockedAt: rowNullableString(row, "unlocked_at"),
  };
}

function remoteDefinitionToAchievement(
  definition: RemoteAchievementDefinition,
  unlock: RemoteAchievementUnlock | undefined,
  provider: string,
  sourceAchievementId: string,
): UnifiedAchievement {
  const achievement: UnifiedAchievement = {
    id: sourceAchievementId,
    name: definition.name,
    source: provider,
    sourceAchievementId,
    providerConfidence:
      providerConfidenceFromMetadata(unlock?.metadata ?? {}) ??
      (provider === "steam" || provider === "xbox" ? "official" : "local"),
    unlockedAt: unlock?.unlockedAt ?? null,
  };

  if (definition.description) {
    achievement.description = definition.description;
  }
  if (definition.iconUrl) {
    achievement.iconUrl = definition.iconUrl;
  }

  return achievement;
}

function mergeAchievements(
  game: Game,
  remoteAchievements: UnifiedAchievement[],
  provider: string,
): UnifiedAchievement[] {
  const byKey = new Map<string, UnifiedAchievement>();
  const orderedKeys: string[] = [];

  for (const achievement of game.achievements ?? []) {
    const key = achievementMapKey(achievement, provider);
    byKey.set(key, achievement);
    orderedKeys.push(key);
  }

  for (const remote of remoteAchievements) {
    const key = achievementMapKey(remote, provider);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, remote);
      orderedKeys.push(key);
      continue;
    }

    byKey.set(key, {
      ...remote,
      ...current,
      description: current.description ?? remote.description,
      iconUrl: current.iconUrl ?? remote.iconUrl,
      providerConfidence: current.providerConfidence ?? remote.providerConfidence,
      source: current.source ?? remote.source,
      sourceAchievementId: current.sourceAchievementId ?? remote.sourceAchievementId,
      unlockedAt: current.unlockedAt ?? remote.unlockedAt ?? null,
    });
  }

  return orderedKeys
    .map((key) => byKey.get(key))
    .filter((item): item is UnifiedAchievement => Boolean(item));
}

function skippedResult(): TrustedAchievementIngestionResult {
  return {
    achievementsSynced: 0,
    newUnlocks: 0,
    ok: false,
    skipped: true,
    unlockedCount: 0,
    xpDelta: 0,
  };
}

async function readLauncherDeviceId() {
  try {
    return await getLauncherDeviceId();
  } catch (error) {
    console.warn("[OG-Launcher] Launcher device id unavailable for achievement ingestion:", error);
    return null;
  }
}

export async function ingestTrustedAchievements(
  input: TrustedAchievementIngestionInput,
): Promise<TrustedAchievementIngestionResult> {
  if (!isSupabaseConfigured) {
    return skippedResult();
  }

  const achievements = input.game.achievements ?? [];
  if (achievements.length === 0) {
    return skippedResult();
  }

  const client = getSupabaseClient();
  const invokeFunction = getTrustedAchievementInvoker(client);
  if (!invokeFunction) {
    if (isTrustedIngestionStrictMode()) {
      throw trustedIngestionStrictModeError("achievement", "Supabase Functions client unavailable");
    }
    return skippedResult();
  }

  const userId = await getCurrentSessionUserId();
  if (!userId) {
    return skippedResult();
  }

  const catalogGameId = await resolveCatalogGameId(input.game);
  if (!catalogGameId) {
    if (isTrustedIngestionStrictMode()) {
      throw trustedIngestionStrictModeError("achievement", "catalog game mapping unavailable");
    }
    return skippedResult();
  }
  const launcherDeviceId = await readLauncherDeviceId();

  const { data, error } = await invokeFunction("ingest-achievements", {
    body: {
      achievements: achievements.map(toTrustedAchievementRow),
      gameId: catalogGameId,
      launcherDeviceId,
      provider: normalizeProvider(input.provider, input.game),
      providerConfidence: input.providerConfidence ?? "local",
      syncedAt: input.syncedAt ?? input.game.achievementsSyncedAt ?? null,
    },
  });
  if (!error) {
    return {
      ...skippedResult(),
      ...((data ?? {}) as Partial<TrustedAchievementIngestionResult>),
      ok: true,
      skipped: false,
    };
  }

  if (isTrustedAchievementIngestionUnavailable(error)) {
    if (isTrustedIngestionStrictMode()) {
      throw trustedIngestionStrictModeError(
        "achievement",
        error.message ?? "ingest-achievements unavailable",
      );
    }
    return skippedResult();
  }

  throw new Error(error.message ?? "Trusted achievement ingestion failed.");
}

async function listRemoteAchievementsForGame(
  client: ReturnType<typeof getSupabaseClient>,
  userId: string,
  catalogGameId: string,
  provider: string,
): Promise<UnifiedAchievement[]> {
  const definitionsResult = await client
    .from("achievements")
    .select("id, key, name, description, icon_url")
    .eq("game_id", catalogGameId)
    .eq("is_active", true);
  if (isMissingSchemaError(definitionsResult.error)) {
    return [];
  }
  handleError(definitionsResult.error);

  const definitions = ((definitionsResult.data ?? []) as UnknownRecord[])
    .map(toRemoteAchievementDefinition)
    .filter((definition) => {
      const parsed = parseProviderKey(definition.key);
      return Boolean(definition.id && parsed?.provider === provider);
    });
  if (definitions.length === 0) {
    return [];
  }

  const unlocksResult = await client
    .from("user_achievements")
    .select("achievement_id, unlocked_at, metadata")
    .eq("user_id", userId)
    .eq("game_id", catalogGameId)
    .in(
      "achievement_id",
      definitions.map((definition) => definition.id),
    );
  if (isMissingSchemaError(unlocksResult.error)) {
    return definitions.map((definition) => {
      const parsed = parseProviderKey(definition.key);
      return remoteDefinitionToAchievement(
        definition,
        undefined,
        provider,
        parsed?.sourceAchievementId ?? definition.id,
      );
    });
  }
  handleError(unlocksResult.error);

  const unlocksByAchievementId = new Map(
    ((unlocksResult.data ?? []) as UnknownRecord[])
      .map(toRemoteAchievementUnlock)
      .filter((unlock) => Boolean(unlock.achievementId))
      .map((unlock) => [unlock.achievementId, unlock]),
  );

  return definitions.map((definition) => {
    const parsed = parseProviderKey(definition.key);
    return remoteDefinitionToAchievement(
      definition,
      unlocksByAchievementId.get(definition.id),
      provider,
      parsed?.sourceAchievementId ?? definition.id,
    );
  });
}

export async function hydrateGamesWithRemoteAchievements(games: Game[]): Promise<Game[]> {
  if (!isSupabaseConfigured || games.length === 0) {
    return games;
  }

  const userId = await getCurrentSessionUserId();
  if (!userId) {
    return games;
  }

  const client = getSupabaseClient();
  const hydratedGames: Game[] = [];

  for (const game of games) {
    const provider = normalizeProvider(null, game);
    const catalogGameId = await resolveCatalogGameId(game);
    if (!catalogGameId || provider === "manual" || provider === "unknown") {
      hydratedGames.push(game);
      continue;
    }

    const remoteAchievements = await listRemoteAchievementsForGame(
      client,
      userId,
      catalogGameId,
      provider,
    );
    hydratedGames.push(
      remoteAchievements.length > 0
        ? {
            ...game,
            achievements: mergeAchievements(game, remoteAchievements, provider),
          }
        : game,
    );
  }

  return hydratedGames;
}
