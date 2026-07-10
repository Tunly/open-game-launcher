import { getGameSource, matchesLauncherFilter } from "./formatters";
import type { Game, Platform } from "./types";

type LibraryPlatformFilter = "all" | Platform;

export interface LibraryAdvancedFilters {
  players: string[];
  features: string[];
  hardware: string[];
  genres: string[];
  status: string[];
  platforms: string[];
  launchers: string[];
  categories: string[];
  sizeQuery: string;
  productCategories: string[];
  showGamePassCatalog: boolean;
}

export interface LibraryFilterContext {
  activePlatformFilter: LibraryPlatformFilter;
  favorites: Record<string, boolean>;
  hiddenGames: Record<string, boolean>;
  customCategories: Record<string, string[]>;
}

export const LIBRARY_STORE_FILTER_OPTIONS = [
  "Steam",
  "Epic",
  "GOG",
  "Ubisoft",
  "EA",
  "Xbox",
  "Battle.net",
  "Manual",
] as const;

export const LIBRARY_FEATURE_FILTER_OPTIONS = [
  "Steam Achievements",
  "Steam Trading Cards",
  "Steam Workshop",
  "Steam Cloud",
  "Stats",
  "Leaderboards",
  "In-App Purchases",
  "VR Supported",
  "Comments available",
] as const;

function normalizeFilterToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getGameProductCategory(game: Game): string {
  return (game.productCategory || "unknown").toLowerCase();
}

export function isPcGamePassCatalogEntry(
  game: Pick<Game, "catalogSource" | "externalId" | "id" | "status">,
): boolean {
  if (game.catalogSource !== "pc_game_pass" || game.status !== "not_installed") {
    return false;
  }

  const match = game.id.match(/^xbox-([a-z0-9]{12})$/i);
  if (!match || !/\d/.test(match[1])) {
    return false;
  }

  return !game.externalId || game.externalId.toLowerCase() === match[1].toLowerCase();
}

function matchesSidebarPlatform(game: Game, filter: LibraryPlatformFilter): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "windows") {
    return game.platform === "windows";
  }
  if (filter === "macos") {
    return game.platform === "macos";
  }
  if (filter === "linux") {
    return (
      game.platform === "linux" || (game.platform === "windows" && game.protonCompatible === true)
    );
  }
  return true;
}

function matchesAdvancedPlatformLabel(game: Game, platformLabel: string): boolean {
  const token = normalizeFilterToken(platformLabel);
  if (token === "windows" || token === "win") {
    return game.platform === "windows";
  }
  if (token === "macos" || token === "mac") {
    return game.platform === "macos";
  }
  if (token === "linux") {
    return (
      game.platform === "linux" || (game.platform === "windows" && game.protonCompatible === true)
    );
  }
  return (game.platform || "").toLowerCase() === platformLabel.toLowerCase();
}

function matchesPlayerMode(game: Game, filter: string): boolean {
  const token = normalizeFilterToken(filter);
  const players = game.players || [];
  if (players.length === 0) {
    return token === "singleplayer";
  }

  return players.some((player) => {
    const playerToken = normalizeFilterToken(player);
    if (token === "singleplayer") {
      return playerToken.includes("single");
    }
    if (token === "multiplayer") {
      return playerToken.includes("multi") && !playerToken.includes("mmo");
    }
    if (token === "coop") {
      return playerToken.includes("coop");
    }
    if (token === "pvp") {
      return playerToken.includes("pvp");
    }
    if (token === "onlinecoop") {
      return playerToken.includes("online") && playerToken.includes("coop");
    }
    if (token === "localcoop") {
      return playerToken.includes("local") && playerToken.includes("coop");
    }
    if (token === "sharedsplitscreen" || token === "splitscreen") {
      return playerToken.includes("split") || playerToken.includes("shared");
    }
    if (token === "mmo") {
      return playerToken.includes("mmo");
    }
    return playerToken === token || playerToken.includes(token) || token.includes(playerToken);
  });
}

function matchesGenreLabel(game: Game, filter: string): boolean {
  const token = normalizeFilterToken(filter);
  const genres = game.genres || [];
  if (genres.length === 0) {
    return false;
  }
  return genres.some((genre) => {
    const genreToken = normalizeFilterToken(genre);
    return genreToken === token || genreToken.includes(token) || token.includes(genreToken);
  });
}

function getGameCategoryLabels(game: Game, context: LibraryFilterContext): string[] {
  return [
    ...(context.customCategories[game.id] || []),
    ...(game.categories || []),
    ...(game.categoryLabels || []),
    ...(game.tags || []),
    ...(game.tagLabels || []),
  ];
}

function matchesCategoryLabel(game: Game, filter: string, context: LibraryFilterContext): boolean {
  const token = normalizeFilterToken(filter);
  if (!token) {
    return false;
  }

  return getGameCategoryLabels(game, context).some((label) => {
    const labelToken = normalizeFilterToken(label);
    return labelToken === token || labelToken.includes(token) || token.includes(labelToken);
  });
}

function matchesFeatureLabel(game: Game, filter: string): boolean {
  const token = normalizeFilterToken(filter);
  const features = (game.features || []).map((feature) => feature.toLowerCase());
  const description = (game.description || "").toLowerCase();
  const source = getGameSource(game);

  if (token.includes("achieve")) {
    return features.some((feature) => feature.includes("achievement"));
  }
  if (token.includes("card")) {
    return features.some((feature) => feature.includes("trading"));
  }
  if (token.includes("workshop")) {
    return features.some((feature) => feature.includes("workshop"));
  }
  if (token.includes("cloud")) {
    return features.some((feature) => feature.includes("cloud"));
  }
  if (token.includes("stat")) {
    return features.some((feature) => feature.includes("stat"));
  }
  if (token.includes("leader")) {
    return features.some((feature) => feature.includes("leaderboard"));
  }
  if (token.includes("purchase") || token.includes("micro")) {
    return features.some((feature) => feature.includes("purchase"));
  }
  if (token.includes("vr")) {
    return features.some((feature) => feature.includes("vr"));
  }
  if (token.includes("comment")) {
    return (
      features.some((feature) => feature.includes("comment")) || description.includes("comment")
    );
  }
  if (token.includes("multiplayer") || token === "multi") {
    return (game.players || []).some((player) => normalizeFilterToken(player).includes("multi"));
  }

  return (
    features.some((feature) => normalizeFilterToken(feature) === token) ||
    (source === "steam" && token === "steam")
  );
}

function matchesHardwareLabel(game: Game, filter: string): boolean {
  const token = filter.toLowerCase();
  const features = game.features || [];
  if (token.includes("verified")) {
    return game.steamDeckCompatibility === "verified";
  }
  if (token.includes("playable")) {
    return game.steamDeckCompatibility === "playable";
  }
  if (token.includes("vr")) {
    return features.some((feature) => feature.toLowerCase().includes("vr"));
  }
  return false;
}

function matchesPlayStatus(
  game: Game,
  filter: string,
  favorites: Record<string, boolean>,
  hiddenGames: Record<string, boolean>,
): boolean {
  const token = filter.toLowerCase();
  if (token === "installed") {
    return game.status === "installed" || game.status === "update_available";
  }
  if (token === "uninstalled") {
    return game.status === "not_installed";
  }
  if (token === "played") {
    return typeof game.playtimeMinutes === "number" && game.playtimeMinutes > 0;
  }
  if (token === "never played") {
    return game.playtimeMinutes === 0;
  }
  if (token === "favorites") {
    return favorites[game.id] === true;
  }
  if (token === "hidden") {
    return hiddenGames[game.id] === true;
  }
  return false;
}

function matchesHiddenVisibility(
  game: Game,
  statusFilters: string[],
  hiddenGames: Record<string, boolean>,
): boolean {
  const isHidden = hiddenGames[game.id] === true;
  const hiddenSelected = statusFilters.some((status) => status.toLowerCase() === "hidden");
  const otherStatusFilters = statusFilters.filter((status) => status.toLowerCase() !== "hidden");

  if (isHidden && !hiddenSelected) {
    return false;
  }
  if (!isHidden && hiddenSelected && otherStatusFilters.length === 0) {
    return false;
  }
  return true;
}

export function matchesSizeQuery(gameSizeGb: number | null | undefined, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return true;
  }

  const sizeRegex = /(?:size\s*)?([><=])\s*(\d+(?:\.\d+)?)\s*(kb|mb|gb|tb)?/i;
  const match = trimmed.match(sizeRegex);
  if (!match) {
    return true;
  }

  if (typeof gameSizeGb !== "number" || !Number.isFinite(gameSizeGb)) {
    return false;
  }

  const operator = match[1];
  const rawVal = parseFloat(match[2]);
  const unit = (match[3] || "gb").toLowerCase();

  let valInGb = rawVal;
  if (unit === "kb") valInGb = rawVal / (1024 * 1024);
  else if (unit === "mb") valInGb = rawVal / 1024;
  else if (unit === "tb") valInGb = rawVal * 1024;

  if (operator === ">") return gameSizeGb > valInGb;
  if (operator === "<") return gameSizeGb < valInGb;
  if (operator === "=") return Math.abs(gameSizeGb - valInGb) < 0.05;

  return true;
}

export function matchesSearchQuery(game: Game, query: string): boolean {
  const norm = query.trim().toLowerCase();
  if (!norm) {
    return true;
  }

  const launcherLabel = (game.launcher || getGameSource(game)).toLowerCase();
  const haystack = [
    game.title,
    game.description,
    game.catalogSource === "pc_game_pass" ? "PC Game Pass" : undefined,
    game.developer,
    game.publisher,
    game.id,
    launcherLabel,
    ...(game.genres || []),
    ...(game.features || []),
    ...(game.players || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(norm);
}

export function gamePassesAdvancedFilters(
  game: Game,
  filters: LibraryAdvancedFilters,
  context: LibraryFilterContext,
): boolean {
  if (!filters.showGamePassCatalog && isPcGamePassCatalogEntry(game)) {
    return false;
  }

  if (!matchesSidebarPlatform(game, context.activePlatformFilter)) {
    return false;
  }

  if (!matchesHiddenVisibility(game, filters.status, context.hiddenGames)) {
    return false;
  }

  if (filters.status.length > 0) {
    const matchesStatus = filters.status.some((status) =>
      matchesPlayStatus(game, status, context.favorites, context.hiddenGames),
    );
    if (!matchesStatus) {
      return false;
    }
  }

  if (filters.platforms.length > 0) {
    const matchesPlatform = filters.platforms.some((platform) =>
      matchesAdvancedPlatformLabel(game, platform),
    );
    if (!matchesPlatform) {
      return false;
    }
  }

  if (filters.launchers.length > 0) {
    const matchesStore = filters.launchers.some((launcher) =>
      matchesLauncherFilter(game, launcher),
    );
    if (!matchesStore) {
      return false;
    }
  }

  if (filters.players.length > 0) {
    const matchesPlayers = filters.players.some((player) => matchesPlayerMode(game, player));
    if (!matchesPlayers) {
      return false;
    }
  }

  if (filters.features.length > 0) {
    const matchesFeatures = filters.features.some((feature) => matchesFeatureLabel(game, feature));
    if (!matchesFeatures) {
      return false;
    }
  }

  if (filters.hardware.length > 0) {
    const matchesHardware = filters.hardware.some((hardware) =>
      matchesHardwareLabel(game, hardware),
    );
    if (!matchesHardware) {
      return false;
    }
  }

  if (filters.genres.length > 0) {
    const matchesGenres = filters.genres.some((genre) => matchesGenreLabel(game, genre));
    if (!matchesGenres) {
      return false;
    }
  }

  if (filters.categories.length > 0) {
    const matchesCategories = filters.categories.some((category) =>
      matchesCategoryLabel(game, category, context),
    );
    if (!matchesCategories) {
      return false;
    }
  }

  if (filters.productCategories.length === 0) {
    return false;
  }

  const productCategory = getGameProductCategory(game);
  if (!filters.productCategories.map((entry) => entry.toLowerCase()).includes(productCategory)) {
    return false;
  }

  return true;
}

export function countActiveAdvancedFilters(
  filters: LibraryAdvancedFilters,
  defaults: LibraryAdvancedFilters,
): number {
  let count = 0;
  if (filters.players.length > 0) count += 1;
  if (filters.features.length > 0) count += 1;
  if (filters.hardware.length > 0) count += 1;
  if (filters.genres.length > 0) count += 1;
  if (filters.status.length > 0) count += 1;
  if (filters.platforms.length > 0) count += 1;
  if (filters.launchers.length > 0) count += 1;
  if (filters.categories.length > 0) count += 1;
  if (filters.sizeQuery.trim()) count += 1;
  if (filters.showGamePassCatalog !== defaults.showGamePassCatalog) count += 1;
  const defaultCategories = new Set(defaults.productCategories.map((entry) => entry.toLowerCase()));
  const currentCategories = new Set(filters.productCategories.map((entry) => entry.toLowerCase()));
  const productCategoriesChanged =
    defaultCategories.size !== currentCategories.size ||
    [...defaultCategories].some((entry) => !currentCategories.has(entry));
  if (productCategoriesChanged) count += 1;

  return count;
}
