import type { Game, UnifiedAchievement } from "../types";
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
  persistence?: string;
  skipped?: boolean;
  trust?: string;
  unlockedCount: number;
  xpDelta: number;
};

type RemoteAchievementDefinition = {
  description: string | null;
  iconUrl: string | null;
  id: string;
  key: string;
  name: string;
  rarityPercent: number | null;
};

type RemoteAchievementUnlock = {
  achievementId: string;
  metadata: Record<string, unknown>;
  unlockedAt: string | null;
};

export type RemoteAchievementHydrationOptions = {
  onError?: (error: unknown, game: Game) => void;
  userId?: string | null;
};

const REMOTE_ACHIEVEMENT_HYDRATION_CONCURRENCY = 4;
const REMOTE_ACHIEVEMENT_HYDRATION_TIMEOUT_MS = 60_000;
const REMOTE_ACHIEVEMENT_PROVIDERS = new Set([
  "steam",
  "xbox",
  "gog",
  "epic",
  "ea",
  "ubisoft",
  "battlenet",
]);

function isRemoteAchievementTransportUnavailable(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("connection refused") ||
    message.includes("connection reset") ||
    message.includes("timed out") ||
    message.includes("timeout")
  );
}

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
  const rarityPercent = row.rarity_percent;
  return {
    description: rowNullableString(row, "description"),
    iconUrl: rowNullableString(row, "icon_url"),
    id: rowString(row, "id"),
    key: rowString(row, "key"),
    name: rowString(row, "name", "Achievement"),
    rarityPercent: typeof rarityPercent === "number" ? rarityPercent : null,
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
  if (definition.rarityPercent !== null) {
    achievement.rarity = definition.rarityPercent;
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

  for (const remote of remoteAchievements) {
    const key = achievementMapKey(remote, provider);
    const local = (game.achievements ?? []).find(
      (achievement) => achievementMapKey(achievement, provider) === key,
    );
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
      description: local?.description ?? current?.description ?? remote.description,
      iconUrl: local?.iconUrl ?? current?.iconUrl ?? remote.iconUrl,
      providerConfidence:
        local?.providerConfidence ?? current?.providerConfidence ?? remote.providerConfidence,
      rarity: local?.rarity ?? current?.rarity ?? remote.rarity,
      source: local?.source ?? current?.source ?? remote.source,
      sourceAchievementId:
        local?.sourceAchievementId ?? current?.sourceAchievementId ?? remote.sourceAchievementId,
      unlockedAt: local?.unlockedAt ?? current?.unlockedAt ?? remote.unlockedAt ?? null,
    });
    if (!current) orderedKeys.push(key);
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
  const { data, error } = await invokeFunction("ingest-achievements", {
    body: {
      achievements: achievements.map(toTrustedAchievementRow),
      gameId: catalogGameId,
      provider: normalizeProvider(input.provider, input.game),
      providerConfidence: input.providerConfidence ?? "local",
      syncedAt: input.syncedAt ?? input.game.achievementsSyncedAt ?? null,
    },
  });
  if (!error) {
    const result: TrustedAchievementIngestionResult = {
      ...skippedResult(),
      ...((data ?? {}) as Partial<TrustedAchievementIngestionResult>),
      ok:
        typeof (data as Partial<TrustedAchievementIngestionResult> | null)?.ok === "boolean"
          ? Boolean((data as Partial<TrustedAchievementIngestionResult>).ok)
          : true,
      skipped:
        typeof (data as Partial<TrustedAchievementIngestionResult> | null)?.skipped === "boolean"
          ? Boolean((data as Partial<TrustedAchievementIngestionResult>).skipped)
          : false,
    };
    if (isTrustedIngestionStrictMode() && (result.skipped || result.persistence === "local_only")) {
      throw trustedIngestionStrictModeError(
        "achievement",
        "server accepted only local-only, unattested achievement evidence",
      );
    }
    return result;
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
  userId: string | null,
  catalogGameId: string,
  provider: string,
): Promise<UnifiedAchievement[]> {
  const definitionsWithRarityResult = await client
    .from("achievements")
    .select("id, key, name, description, icon_url, rarity_percent")
    .eq("game_id", catalogGameId)
    .eq("is_active", true);
  let definitionRows = (definitionsWithRarityResult.data ?? []) as UnknownRecord[];
  let definitionsError = definitionsWithRarityResult.error;
  if (
    definitionsError &&
    isMissingSchemaError(definitionsError) &&
    definitionsError.message.toLowerCase().includes("rarity_percent")
  ) {
    const legacyDefinitionsResult = await client
      .from("achievements")
      .select("id, key, name, description, icon_url")
      .eq("game_id", catalogGameId)
      .eq("is_active", true);
    definitionRows = (legacyDefinitionsResult.data ?? []) as UnknownRecord[];
    definitionsError = legacyDefinitionsResult.error;
  }
  if (isMissingSchemaError(definitionsError)) {
    return [];
  }
  handleError(definitionsError);

  const definitions = definitionRows.map(toRemoteAchievementDefinition).filter((definition) => {
    const parsed = parseProviderKey(definition.key);
    return Boolean(definition.id && parsed?.provider === provider);
  });
  if (definitions.length === 0) {
    return [];
  }

  const mapDefinitions = (unlocksByAchievementId?: Map<string, RemoteAchievementUnlock>) =>
    definitions.map((definition) => {
      const parsed = parseProviderKey(definition.key);
      return remoteDefinitionToAchievement(
        definition,
        unlocksByAchievementId?.get(definition.id),
        provider,
        parsed?.sourceAchievementId ?? definition.id,
      );
    });

  // Definitions belong to the public game catalog. Authentication is only
  // required for the current player's unlock timestamps.
  if (!userId) {
    return mapDefinitions();
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
    return mapDefinitions();
  }
  handleError(unlocksResult.error);

  const unlocksByAchievementId = new Map(
    ((unlocksResult.data ?? []) as UnknownRecord[])
      .map(toRemoteAchievementUnlock)
      .filter((unlock) => Boolean(unlock.achievementId))
      .map((unlock) => [unlock.achievementId, unlock]),
  );

  return mapDefinitions(unlocksByAchievementId);
}

async function hydrateGameWithRemoteAchievements(
  client: ReturnType<typeof getSupabaseClient>,
  game: Game,
  userId: string | null,
  onError?: RemoteAchievementHydrationOptions["onError"],
): Promise<{ game: Game; transportUnavailable: boolean }> {
  const provider = normalizeProvider(null, game);
  if (!REMOTE_ACHIEVEMENT_PROVIDERS.has(provider)) {
    return { game, transportUnavailable: false };
  }

  try {
    const catalogGameId = await resolveCatalogGameId(game);
    if (!catalogGameId) {
      return { game, transportUnavailable: false };
    }

    const remoteAchievements = await listRemoteAchievementsForGame(
      client,
      userId,
      catalogGameId,
      provider,
    );
    return {
      game: {
        ...game,
        achievements: mergeAchievements(game, remoteAchievements, provider),
      },
      transportUnavailable: false,
    };
  } catch (error) {
    console.warn(`[OG-Launcher] Remote achievements unavailable for ${game.title}:`, error);
    onError?.(error, game);
    return {
      game,
      transportUnavailable: isRemoteAchievementTransportUnavailable(error),
    };
  }
}

async function hydrateGameWithRemoteAchievementsWithinTimeout(
  client: ReturnType<typeof getSupabaseClient>,
  game: Game,
  userId: string | null,
  onError?: RemoteAchievementHydrationOptions["onError"],
) {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = globalThis.setTimeout(() => {
      reject(
        new Error(
          `Cloud achievement refresh for ${game.title} timed out after ${REMOTE_ACHIEVEMENT_HYDRATION_TIMEOUT_MS / 1_000} seconds.`,
        ),
      );
    }, REMOTE_ACHIEVEMENT_HYDRATION_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      hydrateGameWithRemoteAchievements(client, game, userId, onError),
      timeout,
    ]);
  } catch (error) {
    console.warn(`[OG-Launcher] Remote achievements unavailable for ${game.title}:`, error);
    onError?.(error, game);
    return {
      game,
      transportUnavailable: isRemoteAchievementTransportUnavailable(error),
    };
  } finally {
    if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
  }
}

export async function hydrateGamesWithRemoteAchievements(
  games: Game[],
  options: RemoteAchievementHydrationOptions = {},
): Promise<Game[]> {
  if (!isSupabaseConfigured || games.length === 0) {
    return games;
  }

  const userId =
    "userId" in options
      ? (options.userId ?? null)
      : await getCurrentSessionUserId().catch(() => null);

  const client = getSupabaseClient();
  const hydratedGames = new Array<Game>(games.length);
  let nextGameIndex = 0;

  const hydrateNextGame = async () => {
    while (nextGameIndex < games.length) {
      const gameIndex = nextGameIndex;
      nextGameIndex += 1;
      const result = await hydrateGameWithRemoteAchievementsWithinTimeout(
        client,
        games[gameIndex],
        userId,
        options.onError,
      );
      hydratedGames[gameIndex] = result.game;
    }
  };

  const workerCount = Math.min(REMOTE_ACHIEVEMENT_HYDRATION_CONCURRENCY, games.length);
  await Promise.all(Array.from({ length: workerCount }, hydrateNextGame));

  return hydratedGames;
}
