import { getGameSource } from "./formatters";
import type { Game, UnifiedAchievement } from "./types";

type GameStatus = Game["status"];

const SOURCE_PRIORITY = [
  "steam",
  "xbox",
  "gog",
  "epic",
  "ubisoft",
  "ea",
  "battlenet",
  "manual",
  "unknown",
];

export interface GroupedAchievementSource {
  achievementId: string;
  gameId: string;
  gameTitle: string;
  source: string;
  unlockedAt?: string | null;
  rarity?: number | null;
}

export interface GroupedAchievement extends UnifiedAchievement {
  sources: GroupedAchievementSource[];
  sourceLabels: string[];
  latestUnlockedAt?: string | null;
}

export interface GameGroup {
  id: string;
  key: string;
  title: string;
  variants: Game[];
  primaryGame: Game;
  displayGame: Game;
  sources: string[];
  status: GameStatus;
  playtimeMinutes: number;
  lastPlayedAt?: string | null;
  achievements: GroupedAchievement[];
}

function normalizeToken(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function releaseYear(game: Game): string | null {
  const raw = game.releaseDate;
  if (!raw) return null;
  const match = raw.match(/\b(19|20)\d{2}\b/);
  return match?.[0] ?? null;
}

function sourcePriority(game: Game): number {
  const source = getGameSource(game);
  return sourceLabelPriority(source);
}

function sourceLabelPriority(source: string): number {
  const index = SOURCE_PRIORITY.indexOf(source);
  return index === -1 ? SOURCE_PRIORITY.length : index;
}

function statusPriority(game: Game): number {
  if (game.status === "installed") return 0;
  if (game.status === "update_available") return 1;
  return 2;
}

function latestPlayedMillis(game: Game): number {
  const raw = game.lastPlayedAt ?? game.lastPlayed;
  if (!raw) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function comparePrimaryGames(left: Game, right: Game): number {
  return statusPriority(left) - statusPriority(right)
    || latestPlayedMillis(right) - latestPlayedMillis(left)
    || (right.playtimeMinutes ?? 0) - (left.playtimeMinutes ?? 0)
    || sourcePriority(left) - sourcePriority(right)
    || left.title.localeCompare(right.title);
}

function sourceLabels(games: Game[]): string[] {
  return games.reduce<string[]>((sources, game) => {
    const source = getGameSource(game);
    if (!sources.includes(source)) {
      sources.push(source);
    }
  return sources;
  }, []).sort((left, right) => sourceLabelPriority(left) - sourceLabelPriority(right));
}

function shouldGroupTogether(left: Game, right: Game): boolean {
  if (normalizeToken(left.title) !== normalizeToken(right.title)) {
    return false;
  }

  if ((left.productCategory || "game") !== (right.productCategory || "game")) {
    return false;
  }

  const leftYear = releaseYear(left);
  const rightYear = releaseYear(right);
  if (leftYear && rightYear && leftYear !== rightYear) {
    return false;
  }

  const leftStudio = normalizeToken(left.developer || left.publisher);
  const rightStudio = normalizeToken(right.developer || right.publisher);
  if (leftStudio && rightStudio && leftStudio !== rightStudio) {
    return false;
  }

  return true;
}

function achievementKey(achievement: UnifiedAchievement): string {
  const name = normalizeToken(achievement.name);
  const description = normalizeToken(achievement.description);
  return `${name}|${description}`;
}

function latestIso(values: Array<string | null | undefined>): string | null {
  let latest: string | null = null;
  let latestMillis = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const millis = Date.parse(value);
    if (!Number.isNaN(millis) && millis > latestMillis) {
      latest = value;
      latestMillis = millis;
    }
  }
  return latest;
}

export function aggregateAchievements(games: Game[]): GroupedAchievement[] {
  const byKey = new Map<string, GroupedAchievement>();

  for (const game of games) {
    const source = getGameSource(game);
    for (const achievement of game.achievements ?? []) {
      const key = achievementKey(achievement);
      const current = byKey.get(key);
      const sourceEntry: GroupedAchievementSource = {
        achievementId: achievement.id,
        gameId: game.id,
        gameTitle: game.title,
        source,
        unlockedAt: achievement.unlockedAt,
        rarity: achievement.rarity,
      };

      if (!current) {
        byKey.set(key, {
          ...achievement,
          id: `grouped-${key}`,
          sources: [sourceEntry],
          sourceLabels: [source],
          latestUnlockedAt: achievement.unlockedAt ?? null,
        });
        continue;
      }

      current.sources.push(sourceEntry);
      if (!current.sourceLabels.includes(source)) {
        current.sourceLabels.push(source);
      }
      current.sourceLabels.sort((left, right) => sourceLabelPriority(left) - sourceLabelPriority(right));
      current.unlockedAt = latestIso([current.unlockedAt, achievement.unlockedAt]);
      current.latestUnlockedAt = current.unlockedAt;
      if (typeof achievement.rarity === "number") {
        current.rarity = typeof current.rarity === "number"
          ? Math.min(current.rarity, achievement.rarity)
          : achievement.rarity;
      }
      current.iconUrl = current.iconUrl ?? achievement.iconUrl;
    }
  }

  return Array.from(byKey.values());
}

function aggregateStatus(games: Game[]): GameStatus {
  if (games.some((game) => game.status === "installed")) return "installed";
  if (games.some((game) => game.status === "update_available")) return "update_available";
  return "not_installed";
}

function latestAchievementSyncAt(games: Game[]): string | null {
  return latestIso(games.map((game) => game.achievementsSyncedAt));
}

function groupIdentity(primaryGame: Game): string {
  const key = normalizeToken(primaryGame.title);
  const category = primaryGame.productCategory || "game";
  const year = releaseYear(primaryGame) || "unknown-year";
  const studio = normalizeToken(primaryGame.developer || primaryGame.publisher) || "unknown-studio";
  return [key, category, year, studio].join(":");
}

export function aggregateGameGroup(variants: Game[]): GameGroup {
  const sortedVariants = [...variants].sort(comparePrimaryGames);
  const primaryGame = sortedVariants[0];
  const sources = sourceLabels(sortedVariants);
  const playtimeMinutes = sortedVariants.reduce(
    (total, game) => total + (game.playtimeMinutes ?? 0),
    0,
  );
  const lastPlayedAt = latestIso(sortedVariants.map((game) => game.lastPlayedAt ?? game.lastPlayed));
  const achievements = aggregateAchievements(sortedVariants);
  const status = aggregateStatus(sortedVariants);
  const key = groupIdentity(primaryGame);
  const id = `group:${key}`;
  const displayGame: Game = {
    ...primaryGame,
    title: primaryGame.title,
    status,
    playtimeMinutes,
    lastPlayedAt,
    lastPlayed: lastPlayedAt ?? primaryGame.lastPlayed,
    achievements,
    achievementsSyncedAt: latestAchievementSyncAt(sortedVariants),
    sizeGb: sortedVariants.reduce((total, game) => total + (game.sizeGb ?? 0), 0) || primaryGame.sizeGb,
  };

  return {
    id,
    key,
    title: primaryGame.title,
    variants: sortedVariants,
    primaryGame,
    displayGame,
    sources,
    status,
    playtimeMinutes,
    lastPlayedAt,
    achievements,
  };
}

export function groupGames(games: Game[]): GameGroup[] {
  const buckets: Game[][] = [];

  for (const game of games) {
    const bucket = buckets.find((candidate) => shouldGroupTogether(candidate[0], game));
    if (bucket) {
      bucket.push(game);
    } else {
      buckets.push([game]);
    }
  }

  return buckets.map(aggregateGameGroup).sort((left, right) =>
    left.title.localeCompare(right.title),
  );
}

export function isInstallableGame(game: Game): boolean {
  return game.status === "not_installed";
}

export function isPlayableGame(game: Game): boolean {
  return game.status === "installed" || game.status === "update_available";
}

export function supportedAchievementSyncGames(group: GameGroup): Game[] {
  return group.variants.filter((game) => {
    const source = getGameSource(game);
    if (source === "xbox") {
      return Boolean(game.externalId);
    }
    if (source !== "steam") {
      return false;
    }
    return Boolean(game.externalId || game.launchUri?.startsWith("steam://") || game.id.startsWith("steam-"));
  });
}
