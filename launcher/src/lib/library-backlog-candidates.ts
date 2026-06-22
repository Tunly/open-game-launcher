import type { BacklogCandidate } from "./backlog-recommendations";
import type { GameGroup } from "./game-groups";
import type { Game } from "./types";

const DEFAULT_NOW = "2026-06-11T12:00:00.000Z";

export function buildBacklogCandidatesFromGroups(
  groups: GameGroup[],
  nowIso = DEFAULT_NOW,
): BacklogCandidate[] {
  return groups.map((group) => {
    const game = group.displayGame ?? group.primaryGame;
    const achievementsPercent = achievementPercent(group);
    const lastPlayedDaysAgo = daysSince(
      group.lastPlayedAt ?? game.lastPlayedAt ?? game.lastPlayed,
      nowIso,
    );
    const moodTags = getMoodTags(game);
    const installed = group.status === "installed" || group.status === "update_available";

    return {
      achievementsPercent,
      downloadReady: Boolean(game.downloadUrl) || group.status === "update_available",
      estimatedSessionMinutes: estimateSessionMinutes(game, group.playtimeMinutes),
      friendsPlaying: game.friendsPlaying?.length ?? 0,
      id: group.id,
      installed,
      lastPlayedDaysAgo,
      moodTags,
      playtimeMinutes: group.playtimeMinutes,
      storageReady: isStorageReady(game, installed),
      title: group.title,
    };
  });
}

export function createVerifyBacklogCandidates(): BacklogCandidate[] {
  return [
    {
      achievementsPercent: 38,
      downloadReady: true,
      estimatedSessionMinutes: 75,
      friendsPlaying: 3,
      id: "verify-mech",
      installed: true,
      lastPlayedDaysAgo: 2,
      moodTags: ["co-op", "action"],
      playtimeMinutes: 420,
      storageReady: true,
      title: "Mech Arcade",
    },
    {
      achievementsPercent: 18,
      downloadReady: true,
      estimatedSessionMinutes: 65,
      friendsPlaying: 1,
      id: "verify-queue",
      installed: false,
      lastPlayedDaysAgo: null,
      moodTags: ["quick", "ranked"],
      playtimeMinutes: 0,
      storageReady: true,
      title: "Queue Fighter",
    },
    {
      achievementsPercent: 0,
      downloadReady: false,
      estimatedSessionMinutes: 0,
      friendsPlaying: 0,
      id: "verify-blocked",
      installed: false,
      lastPlayedDaysAgo: null,
      moodTags: [],
      playtimeMinutes: 0,
      storageReady: false,
      title: "Missing Build",
    },
  ];
}

function achievementPercent(group: GameGroup) {
  const achievements =
    group.achievements.length > 0 ? group.achievements : (group.displayGame.achievements ?? []);
  const total = achievements.length;
  if (total === 0) return 0;
  const unlocked = achievements.filter((achievement) => achievement.unlockedAt).length;
  return Math.round((unlocked / total) * 100);
}

function daysSince(value: string | null | undefined, nowIso: string) {
  if (!value) return null;
  const played = Date.parse(value);
  const now = Date.parse(nowIso);
  if (Number.isNaN(played) || Number.isNaN(now)) return null;
  return Math.max(0, Math.round((now - played) / 86_400_000));
}

function getMoodTags(game: Game) {
  const values = [
    ...(game.tags ?? []),
    ...(game.tagLabels ?? []),
    ...(game.genres ?? []),
    ...(game.categories ?? []),
    ...(game.categoryLabels ?? []),
    ...(game.features ?? []),
  ];

  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim().toLowerCase()),
    ),
  ).slice(0, 3);
}

function estimateSessionMinutes(game: Game, groupPlaytimeMinutes: number) {
  if (game.status === "not_installed" && !game.downloadUrl) return 0;
  if (game.features?.some((feature) => feature.toLowerCase().includes("multiplayer"))) return 75;
  if (groupPlaytimeMinutes < 30) return 45;
  if (groupPlaytimeMinutes > 900) return 40;
  return 70;
}

function isStorageReady(game: Game, installed: boolean) {
  if (installed) return true;
  if (!game.downloadUrl) return false;
  return game.sizeGb === undefined || game.sizeGb <= 150;
}
