import {
  achievementProviderStatusForGame,
  syncableAchievementGames,
} from "./achievement-providers";
import { getGameSource } from "./formatters";
import type { Game, UnifiedAchievement } from "./types";

type GameStatus = Game["status"];

const SOURCE_PRIORITY = [
  "ogl",
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
  sourceAchievementId?: string | null;
  providerConfidence?: UnifiedAchievement["providerConfidence"] | null;
}

export interface GroupedAchievement extends UnifiedAchievement {
  sources: GroupedAchievementSource[];
  sourceLabels: string[];
  sourceIds: string[];
  canonicalSource: string;
  canonicalAchievementId: string;
  matchKey: string;
  matchConfidence: "exact" | "name_description" | "name" | "additional";
  isAdditional: boolean;
  latestUnlockedAt?: string | null;
}

export interface AchievementProviderStatus {
  source: string;
  status: "available" | "not_connected" | "no_api" | "private" | "failed" | "unsupported";
  stability: "official" | "unofficial" | "local";
  message: string;
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
  achievementBasisSource?: string | null;
  achievementBasisGameId?: string | null;
  achievementProviderStatuses?: AchievementProviderStatus[];
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
  return (
    statusPriority(left) - statusPriority(right) ||
    latestPlayedMillis(right) - latestPlayedMillis(left) ||
    (right.playtimeMinutes ?? 0) - (left.playtimeMinutes ?? 0) ||
    sourcePriority(left) - sourcePriority(right) ||
    left.title.localeCompare(right.title)
  );
}

function sourceLabels(games: Game[]): string[] {
  return games
    .reduce<string[]>((sources, game) => {
      const source = getGameSource(game);
      if (!sources.includes(source)) {
        sources.push(source);
      }
      return sources;
    }, [])
    .sort((left, right) => sourceLabelPriority(left) - sourceLabelPriority(right));
}

function shouldGroupTogether(left: Game, right: Game): boolean {
  if (normalizeToken(left.title) !== normalizeToken(right.title)) {
    return false;
  }

  if ((left.productCategory || "unknown") !== (right.productCategory || "unknown")) {
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

function achievementNameDescriptionKey(achievement: UnifiedAchievement): string {
  const name = normalizeToken(achievement.name);
  const description = normalizeToken(achievement.description);
  return `${name}|${description}`;
}

function achievementNameKey(achievement: UnifiedAchievement): string {
  return normalizeToken(achievement.name);
}

function achievementExactKey(game: Game, achievement: UnifiedAchievement): string {
  const source = normalizeToken(achievement.source ?? getGameSource(game));
  const sourceAchievementId = achievement.sourceAchievementId ?? achievement.id;
  return `${source}:${normalizeToken(sourceAchievementId)}`;
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

function compareAchievementBasis(left: Game, right: Game): number {
  const leftCount = left.achievements?.length ?? 0;
  const rightCount = right.achievements?.length ?? 0;
  return rightCount - leftCount || sourcePriority(left) - sourcePriority(right);
}

function achievementSourceEntry(
  game: Game,
  achievement: UnifiedAchievement,
): GroupedAchievementSource {
  const source = achievement.source ?? getGameSource(game);
  return {
    achievementId: achievement.id,
    gameId: game.id,
    gameTitle: game.title,
    source,
    unlockedAt: achievement.unlockedAt,
    rarity: achievement.rarity,
    sourceAchievementId: achievement.sourceAchievementId ?? achievement.id,
    providerConfidence: achievement.providerConfidence ?? null,
  };
}

function createGroupedAchievement(
  game: Game,
  achievement: UnifiedAchievement,
  options: {
    matchKey: string;
    matchConfidence: GroupedAchievement["matchConfidence"];
    isAdditional: boolean;
  },
): GroupedAchievement {
  const source = achievement.source ?? getGameSource(game);
  const sourceAchievementId = achievement.sourceAchievementId ?? achievement.id;
  return {
    ...achievement,
    id: `grouped-${options.matchKey}`,
    source,
    sourceAchievementId,
    canonicalSource: source,
    canonicalAchievementId: sourceAchievementId,
    matchKey: options.matchKey,
    matchConfidence: options.matchConfidence,
    isAdditional: options.isAdditional,
    sources: [achievementSourceEntry(game, achievement)],
    sourceLabels: [source],
    sourceIds: [`${source}:${sourceAchievementId}`],
    latestUnlockedAt: achievement.unlockedAt ?? null,
  };
}

function mergeGroupedAchievement(
  current: GroupedAchievement,
  game: Game,
  achievement: UnifiedAchievement,
  matchConfidence: GroupedAchievement["matchConfidence"],
) {
  const source = achievement.source ?? getGameSource(game);
  const sourceAchievementId = achievement.sourceAchievementId ?? achievement.id;
  current.sources.push(achievementSourceEntry(game, achievement));
  const sourceId = `${source}:${sourceAchievementId}`;
  if (!current.sourceIds.includes(sourceId)) {
    current.sourceIds.push(sourceId);
  }
  if (!current.sourceLabels.includes(source)) {
    current.sourceLabels.push(source);
  }
  current.sourceLabels.sort(
    (left, right) => sourceLabelPriority(left) - sourceLabelPriority(right),
  );
  current.unlockedAt = latestIso([current.unlockedAt, achievement.unlockedAt]);
  current.latestUnlockedAt = current.unlockedAt;
  if (typeof achievement.rarity === "number") {
    current.rarity =
      typeof current.rarity === "number"
        ? Math.min(current.rarity, achievement.rarity)
        : achievement.rarity;
  }
  current.iconUrl = current.iconUrl ?? achievement.iconUrl;
  current.description = current.description ?? achievement.description;
  if (current.matchConfidence !== "additional" && matchConfidence !== "exact") {
    current.matchConfidence =
      current.matchConfidence === "name" || matchConfidence === "name"
        ? "name"
        : "name_description";
  }
}

function registerAchievementKeys(
  grouped: GroupedAchievement,
  achievement: UnifiedAchievement,
  byExactKey: Map<string, GroupedAchievement>,
  byNameDescriptionKey: Map<string, GroupedAchievement>,
  byNameKey: Map<string, GroupedAchievement>,
  game: Game,
) {
  const exactKey = achievementExactKey(game, achievement);
  const nameDescriptionKey = achievementNameDescriptionKey(achievement);
  const nameKey = achievementNameKey(achievement);

  byExactKey.set(exactKey, grouped);
  if (nameDescriptionKey !== "|") byNameDescriptionKey.set(nameDescriptionKey, grouped);
  if (nameKey) byNameKey.set(nameKey, grouped);
}

export function achievementBasisGame(games: Game[]): Game | null {
  return (
    [...games]
      .filter((game) => (game.achievements?.length ?? 0) > 0)
      .sort(compareAchievementBasis)[0] ?? null
  );
}

export function aggregateAchievements(games: Game[]): GroupedAchievement[] {
  const basisGame = achievementBasisGame(games);
  if (!basisGame) return [];

  const byExactKey = new Map<string, GroupedAchievement>();
  const byNameDescriptionKey = new Map<string, GroupedAchievement>();
  const byNameKey = new Map<string, GroupedAchievement>();
  const results: GroupedAchievement[] = [];

  for (const achievement of basisGame.achievements ?? []) {
    const exactKey = achievementExactKey(basisGame, achievement);
    const existing = byExactKey.get(exactKey);
    if (existing) {
      mergeGroupedAchievement(existing, basisGame, achievement, "exact");
      registerAchievementKeys(
        existing,
        achievement,
        byExactKey,
        byNameDescriptionKey,
        byNameKey,
        basisGame,
      );
      continue;
    }

    const grouped = createGroupedAchievement(basisGame, achievement, {
      matchKey: exactKey,
      matchConfidence: "exact",
      isAdditional: false,
    });
    results.push(grouped);
    registerAchievementKeys(
      grouped,
      achievement,
      byExactKey,
      byNameDescriptionKey,
      byNameKey,
      basisGame,
    );
  }

  for (const game of games) {
    if (game.id === basisGame.id) continue;

    for (const achievement of game.achievements ?? []) {
      const exactKey = achievementExactKey(game, achievement);
      const nameDescriptionKey = achievementNameDescriptionKey(achievement);
      const nameKey = achievementNameKey(achievement);
      let matchConfidence: GroupedAchievement["matchConfidence"] = "exact";
      let current = byExactKey.get(exactKey);

      if (!current && nameDescriptionKey !== "|") {
        current = byNameDescriptionKey.get(nameDescriptionKey);
        matchConfidence = "name_description";
      }
      // A name-only match is too weak across providers: different games can
      // legitimately reuse achievement names. Keep those rows separate unless
      // the provider ID or name+description establishes identity.

      if (current) {
        mergeGroupedAchievement(current, game, achievement, matchConfidence);
        registerAchievementKeys(
          current,
          achievement,
          byExactKey,
          byNameDescriptionKey,
          byNameKey,
          game,
        );
        continue;
      }

      const additional = createGroupedAchievement(game, achievement, {
        matchKey: `additional:${exactKey || nameDescriptionKey || nameKey}`,
        matchConfidence: "additional",
        isAdditional: true,
      });
      results.push(additional);
      registerAchievementKeys(
        additional,
        achievement,
        byExactKey,
        byNameDescriptionKey,
        byNameKey,
        game,
      );
    }
  }

  return results;
}

function aggregateStatus(games: Game[]): GameStatus {
  if (games.some((game) => game.status === "installed")) return "installed";
  if (games.some((game) => game.status === "update_available")) return "update_available";
  return "not_installed";
}

function latestAchievementSyncAt(games: Game[]): string | null {
  return latestIso(games.map((game) => game.achievementsSyncedAt));
}

function achievementProviderStatusForSource(
  source: string,
  variantsForSource: Game[],
): AchievementProviderStatus {
  const explicitStatus = variantsForSource
    .flatMap((game) =>
      (game.achievementProviderStatuses ?? [])
        .filter((status) => status.source === source)
        .map((status) => ({ game, status })),
    )
    .sort((left, right) => {
      const statusRank = (status: AchievementProviderStatus["status"]) =>
        status === "available" ? 0 : status === "failed" ? 2 : 1;
      return (
        statusRank(left.status.status) - statusRank(right.status.status) ||
        (right.game.achievements?.length ?? 0) - (left.game.achievements?.length ?? 0) ||
        Date.parse(right.game.achievementsSyncedAt ?? "") -
          Date.parse(left.game.achievementsSyncedAt ?? "")
      );
    })[0]?.status;
  if (explicitStatus) {
    return explicitStatus;
  }

  const hasAchievements = variantsForSource.some((game) => (game.achievements?.length ?? 0) > 0);
  const providerStatus = achievementProviderStatusForGame(variantsForSource[0]);
  return {
    source,
    status: hasAchievements ? "available" : providerStatus.status,
    stability: providerStatus.stability,
    message: hasAchievements ? "Achievement data available" : providerStatus.message,
  };
}

function groupIdentity(primaryGame: Game): string {
  const key = normalizeToken(primaryGame.title);
  const category = primaryGame.productCategory || "unknown";
  const year = releaseYear(primaryGame) || "unknown-year";
  const studio = normalizeToken(primaryGame.developer || primaryGame.publisher) || "unknown-studio";
  return [key, category, year, studio].join(":");
}

export function aggregateGameGroup(variants: Game[]): GameGroup {
  const sortedVariants = [...variants].sort(comparePrimaryGames);
  const primaryGame = sortedVariants[0];
  const basisGame = achievementBasisGame(sortedVariants);
  const sources = sourceLabels(sortedVariants);
  const playtimeMinutes = sortedVariants.reduce(
    (total, game) => total + (game.playtimeMinutes ?? 0),
    0,
  );
  const lastPlayedAt = latestIso(
    sortedVariants.map((game) => game.lastPlayedAt ?? game.lastPlayed),
  );
  const achievements = aggregateAchievements(sortedVariants);
  const achievementProviderStatuses = sources.map((source) =>
    achievementProviderStatusForSource(
      source,
      sortedVariants.filter((game) => getGameSource(game) === source),
    ),
  );
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
    achievementBasisSource: basisGame ? getGameSource(basisGame) : null,
    achievementBasisGameId: basisGame?.id ?? null,
    achievementProviderStatuses,
    sizeGb:
      sortedVariants.reduce((total, game) => total + (game.sizeGb ?? 0), 0) || primaryGame.sizeGb,
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
    achievementBasisSource: basisGame ? getGameSource(basisGame) : null,
    achievementBasisGameId: basisGame?.id ?? null,
    achievementProviderStatuses,
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

  return buckets
    .map(aggregateGameGroup)
    .sort((left, right) => left.title.localeCompare(right.title));
}

export function isInstallableGame(game: Game): boolean {
  return game.status === "not_installed";
}

export function isPlayableGame(game: Game): boolean {
  return game.status === "installed" || game.status === "update_available";
}

export function supportedAchievementSyncGames(group: GameGroup): Game[] {
  return syncableAchievementGames(group.variants);
}
