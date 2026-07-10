import { achievementProviderForGame, type AchievementProvider } from "./achievement-providers";
import { syncAchievementProviderGame } from "./achievement-provider-sync";
import { achievementProviderSyncGameKey } from "./achievement-sync-coordinator";
import { getGameSource } from "./formatters";
import type { Game } from "./types";

const ARCHIVE_AUTO_SYNC_PROVIDERS = new Set(["xbox", "gog", "epic", "ea", "ubisoft", "battlenet"]);
const ARCHIVE_AUTO_SYNC_CONCURRENCY = 3;
const ARCHIVE_SYNC_FRESHNESS_MS = 5 * 60 * 1000;
const ARCHIVE_SYNC_RETRY_DELAY_MS = 10 * 1000;
const MAX_RECENT_SYNC_ATTEMPTS = 512;

const recentSyncAttempts = new Map<string, number>();

type ArchiveSyncCandidate = {
  game: Game;
  index: number;
  key: string;
  provider: AchievementProvider;
};

function hasFreshAchievementSnapshot(game: Game, now: number) {
  if ((game.achievements?.length ?? 0) === 0 || !game.achievementsSyncedAt) {
    return false;
  }

  const syncedAt = Date.parse(game.achievementsSyncedAt);
  return !Number.isNaN(syncedAt) && syncedAt >= now - ARCHIVE_SYNC_FRESHNESS_MS;
}

function wasRecentlyAttempted(key: string, now: number) {
  const attemptedAt = recentSyncAttempts.get(key);
  if (attemptedAt === undefined) {
    return false;
  }
  if (attemptedAt >= now - ARCHIVE_SYNC_RETRY_DELAY_MS) {
    return true;
  }

  recentSyncAttempts.delete(key);
  return false;
}

function pruneRecentSyncAttempts(now: number) {
  for (const [key, attemptedAt] of recentSyncAttempts) {
    if (attemptedAt < now - ARCHIVE_SYNC_RETRY_DELAY_MS) {
      recentSyncAttempts.delete(key);
    }
  }

  while (recentSyncAttempts.size > MAX_RECENT_SYNC_ATTEMPTS) {
    const oldestKey = recentSyncAttempts.keys().next().value;
    if (oldestKey === undefined) break;
    recentSyncAttempts.delete(oldestKey);
  }
}

function rememberSyncAttempt(key: string, attemptedAt: number) {
  recentSyncAttempts.delete(key);
  recentSyncAttempts.set(key, attemptedAt);
  pruneRecentSyncAttempts(attemptedAt);
}

function archiveSyncCandidates(games: Game[]): ArchiveSyncCandidate[] {
  const now = Date.now();
  pruneRecentSyncAttempts(now);
  return games.flatMap((game, index) => {
    const source = getGameSource(game);
    if (!ARCHIVE_AUTO_SYNC_PROVIDERS.has(source)) {
      return [];
    }

    const provider = achievementProviderForGame(game);
    const key = achievementProviderSyncGameKey(game, provider.provider);
    if (
      !provider.isAvailable(game) ||
      hasFreshAchievementSnapshot(game, now) ||
      wasRecentlyAttempted(key, now)
    ) {
      return [];
    }

    return [{ game, index, key, provider }];
  });
}

async function syncArchiveCandidate(candidate: ArchiveSyncCandidate): Promise<Game> {
  return (await syncAchievementProviderGame(candidate.game, candidate.provider)).game;
}

function syncArchiveCandidateOnce(candidate: ArchiveSyncCandidate): Promise<Game> {
  return syncArchiveCandidate(candidate).finally(() => {
    rememberSyncAttempt(candidate.key, Date.now());
  });
}

export function hasPendingAchievementArchiveSync(games: Game[]) {
  return archiveSyncCandidates(games).length > 0;
}

export async function syncAchievementArchiveGames(games: Game[]): Promise<Game[]> {
  const candidates = archiveSyncCandidates(games);
  if (candidates.length === 0) {
    return games;
  }

  const syncedGames = [...games];
  let nextCandidateIndex = 0;

  const syncNext = async () => {
    while (nextCandidateIndex < candidates.length) {
      const candidate = candidates[nextCandidateIndex];
      nextCandidateIndex += 1;
      syncedGames[candidate.index] = await syncArchiveCandidateOnce(candidate);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(ARCHIVE_AUTO_SYNC_CONCURRENCY, candidates.length) }, syncNext),
  );

  return syncedGames;
}
