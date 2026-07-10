import { normalizeLauncherKey } from "./formatters";
import type { LibraryAdvancedFilters } from "./library-filters";
import type { GameGroup } from "./game-groups";
import { STORAGE_KEYS } from "./storage-keys";
import type { LibrarySortOption } from "./library-sort";
import type { Game } from "./types";

export const SIZE_QUERY_SEARCH_REGEX = /(?:size\s*)?([><=])\s*(\d+(?:\.\d+)?)\s*(kb|mb|gb|tb)?/i;

export const PRODUCT_CATEGORIES = [
  "game",
  "software",
  "video",
  "dlc",
  "soundtrack",
  "demo",
  "beta",
  "unknown",
] as const;

export type LibraryPlatformFilter = "all" | "windows" | "macos" | "linux";

export type AdvancedFilters = LibraryAdvancedFilters;

export const initialAdvancedFilters: AdvancedFilters = {
  players: [],
  features: [],
  hardware: [],
  genres: [],
  status: [],
  platforms: [],
  launchers: [],
  categories: [],
  sizeQuery: "",
  productCategories: [...PRODUCT_CATEGORIES],
  showGamePassCatalog: true,
};

export function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function normalizeAdvancedFilters(value: unknown): AdvancedFilters {
  const stored =
    value && typeof value === "object"
      ? (value as Partial<Record<keyof AdvancedFilters, unknown>>)
      : {};

  return {
    players: normalizeStringArray(stored.players),
    features: normalizeStringArray(stored.features),
    hardware: normalizeStringArray(stored.hardware),
    genres: normalizeStringArray(stored.genres),
    status: normalizeStringArray(stored.status),
    platforms: normalizeStringArray(stored.platforms),
    launchers: normalizeStringArray(stored.launchers),
    categories: normalizeStringArray(stored.categories),
    sizeQuery: typeof stored.sizeQuery === "string" ? stored.sizeQuery : "",
    productCategories:
      normalizeStringArray(stored.productCategories).length > 0
        ? normalizeStringArray(stored.productCategories)
        : initialAdvancedFilters.productCategories,
    showGamePassCatalog:
      typeof stored.showGamePassCatalog === "boolean"
        ? stored.showGamePassCatalog
        : initialAdvancedFilters.showGamePassCatalog,
  };
}

export type PersistedLibraryFilterState = {
  activePlatformFilter: LibraryPlatformFilter;
  advancedFilters: AdvancedFilters;
  searchQuery: string;
  sortOption: LibrarySortOption;
};

export function readPersistedLibraryFilterState(): PersistedLibraryFilterState {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.LIBRARY_FILTER_STATE);
    const parsed = saved ? JSON.parse(saved) : {};
    const state =
      parsed && typeof parsed === "object" ? (parsed as Partial<PersistedLibraryFilterState>) : {};
    const activePlatformFilter = ["all", "windows", "macos", "linux"].includes(
      state.activePlatformFilter ?? "",
    )
      ? (state.activePlatformFilter as PersistedLibraryFilterState["activePlatformFilter"])
      : "all";
    const sortOption = ["alphabetical", "last_played", "playtime", "size"].includes(
      state.sortOption ?? "",
    )
      ? (state.sortOption as LibrarySortOption)
      : "alphabetical";

    return {
      activePlatformFilter,
      advancedFilters: normalizeAdvancedFilters(state.advancedFilters),
      searchQuery: typeof state.searchQuery === "string" ? state.searchQuery : "",
      sortOption,
    };
  } catch {
    return {
      activePlatformFilter: "all",
      advancedFilters: initialAdvancedFilters,
      searchQuery: "",
      sortOption: "alphabetical",
    };
  }
}

export function isUnrealEngineAssetEntry(
  game: Pick<Game, "id" | "title" | "description" | "launcher" | "status">,
): boolean {
  const launcher = normalizeLauncherKey(game.launcher, game.id);
  if (launcher !== "epic") {
    return false;
  }

  const text = `${game.id} ${game.title} ${game.description}`.toLowerCase();
  const titleLower = game.title.toLowerCase();
  const unrealMarker =
    text.includes("unreal engine") ||
    text.includes("unrealengine") ||
    text.includes("unreal marketplace") ||
    text.includes("ue marketplace") ||
    text.includes("marketplaceassets") ||
    text.includes("marketplace assets") ||
    text.includes("fab.com") ||
    text.includes('"fab"') ||
    text.includes('"ue"') ||
    text.includes("uefn") ||
    text.includes("ue-") ||
    /\bue[45]?\b/.test(text);
  const assetMarker =
    text.includes("asset") ||
    text.includes("vault") ||
    text.includes("plugin") ||
    text.includes("plugins") ||
    text.includes("template") ||
    text.includes("sample project") ||
    text.includes("sample") ||
    text.includes("environment") ||
    text.includes("environments") ||
    text.includes("material") ||
    text.includes("materials") ||
    text.includes("blueprint") ||
    text.includes("blueprints") ||
    text.includes("mesh") ||
    text.includes("meshes") ||
    text.includes("animation pack") ||
    text.includes("animation") ||
    text.includes("animations") ||
    text.includes("vfx") ||
    text.includes("sfx") ||
    text.includes("sound effects") ||
    text.includes("music pack") ||
    text.includes("texture") ||
    text.includes("textures") ||
    text.includes("props") ||
    text.includes("characters") ||
    text.includes("3d model") ||
    text.includes("kitbash") ||
    text.includes("props pack") ||
    text.includes("modular") ||
    text.includes("low poly") ||
    text.includes("stylized");

  if (game.id.startsWith("epic-owned-")) {
    const titleAssetMarker =
      titleLower.includes("asset") ||
      titleLower.includes("plugin") ||
      titleLower.includes("template") ||
      titleLower.includes("megascans") ||
      titleLower.includes("quixel") ||
      titleLower.includes("material") ||
      titleLower.includes("mesh") ||
      titleLower.includes("blueprint") ||
      titleLower.includes("texture") ||
      titleLower.includes("environment") ||
      titleLower.includes("modular") ||
      titleLower.includes("props") ||
      titleLower.includes("vfx") ||
      titleLower.includes("sfx") ||
      titleLower.includes("animation pack") ||
      titleLower.includes("stylized") ||
      titleLower.includes("low poly") ||
      titleLower.includes("kitbash") ||
      titleLower.includes("3d model");
    return unrealMarker || assetMarker || titleAssetMarker;
  }

  return unrealMarker && assetMarker;
}

export function isUbisoftDlcEntry(
  game: Pick<Game, "id" | "title" | "description" | "launcher">,
): boolean {
  const launcher = normalizeLauncherKey(game.launcher, game.id);
  if (launcher !== "ubisoft") {
    return false;
  }

  const titleLower = game.title.toLowerCase();
  const text = `${game.title} ${game.description}`.toLowerCase();

  if (
    titleLower.includes("benchmark") ||
    titleLower.includes("pts") ||
    titleLower.includes("language pack") ||
    titleLower.includes("texture pack") ||
    titleLower.includes("ultra hd") ||
    titleLower.includes("hd texture") ||
    titleLower.includes("high-rez")
  ) {
    return true;
  }

  const hasDlcKeyword =
    /\bdlc\b/.test(text) ||
    text.includes("add-on") ||
    text.includes("addon") ||
    text.includes("season pass") ||
    text.includes("battle pass") ||
    text.includes("expansion") ||
    text.includes("pack") ||
    text.includes("paket") ||
    text.includes("pass") ||
    text.includes("bonus") ||
    text.includes("upgrade") ||
    text.includes("credit") ||
    text.includes("coin") ||
    text.includes("currency") ||
    text.includes("helix") ||
    text.includes("year") ||
    text.includes("episode ") ||
    text.includes("bundle") ||
    text.includes("unlock") ||
    text.includes("skin") ||
    text.includes("outfit") ||
    text.includes("costume") ||
    text.includes("weapon") ||
    text.includes("cosmetic") ||
    text.includes("gear set") ||
    text.includes("knuckles") ||
    text.includes("gauntlet") ||
    text.includes("belt") ||
    text.includes("breeches") ||
    text.includes("cloak") ||
    text.includes("revolver") ||
    text.includes("pistol") ||
    text.includes("rifle") ||
    text.includes("kukri") ||
    text.includes("rapier") ||
    text.includes("sword") ||
    text.includes("cane-sword") ||
    text.includes("spear") ||
    text.includes("axe") ||
    text.includes("blade") ||
    text.includes("sails") ||
    text.includes("hood") ||
    text.includes("trousers") ||
    text.includes("waistcoat") ||
    text.includes("bracers") ||
    text.includes("bushido") ||
    text.includes("artbook") ||
    text.includes("art book") ||
    text.includes("soundtrack") ||
    text.includes("digital art") ||
    text.includes("ornament") ||
    text.includes("figurehead") ||
    text.includes("pre-order") ||
    text.includes("preorder") ||
    text.includes("promo") ||
    text.includes("giveaway") ||
    text.includes("xp boost") ||
    text.includes("loot") ||
    text.includes("ubicollectibles") ||
    text.includes("hero skin") ||
    text.includes("premier") ||
    text.includes("welcome") ||
    text.includes("signature") ||
    text.includes("initiates") ||
    text.includes("impaler") ||
    text.includes("sabre") ||
    text.includes("honour") ||
    text.includes("season ");

  if (hasDlcKeyword) {
    return true;
  }

  const dashIdx = titleLower.indexOf(" - ");
  if (dashIdx !== -1) {
    const suffix = titleLower.slice(dashIdx + 3);
    if (
      suffix.includes("hero") ||
      suffix.includes("operator") ||
      suffix.includes("character") ||
      suffix.includes("quest") ||
      suffix.includes("mission") ||
      suffix.includes("dead kings") ||
      suffix.includes("secrets of") ||
      suffix.includes("legacy of") ||
      suffix.includes("warlords of") ||
      suffix.includes("wrath of") ||
      suffix.includes("fate of") ||
      suffix.includes("tyranny of") ||
      suffix.includes("siege of") ||
      suffix.includes("underground") ||
      suffix.includes("freedom cry") ||
      suffix.includes("last stand") ||
      suffix.includes("human conditions") ||
      suffix.includes("no compromise") ||
      suffix.includes("bad blood") ||
      suffix.includes("road to") ||
      suffix.includes("conspiracy") ||
      suffix.includes("jack the ripper") ||
      suffix.includes("lost archive") ||
      suffix.includes("calling all units") ||
      suffix.includes("wild run") ||
      suffix.includes("narco road") ||
      suffix.includes("fallen ghosts") ||
      suffix.includes("rocket wings") ||
      suffix.includes("winter fest") ||
      suffix.includes("x games") ||
      suffix.includes("crash &") ||
      suffix.includes("void dasher") ||
      suffix.includes("dedsec") ||
      suffix.includes("curse of") ||
      suffix.includes("guild of") ||
      suffix.includes("pride of") ||
      suffix.includes("trove of") ||
      suffix.includes("streets of") ||
      suffix.includes("runaway") ||
      suffix.includes("naval") ||
      suffix.includes("calamity") ||
      suffix.includes("hidden ones") ||
      suffix.includes("killed by") ||
      suffix.includes("chemical") ||
      suffix.includes("nighthawk") ||
      suffix.includes("suave") ||
      suffix.startsWith("the ") ||
      suffix.includes("animus") ||
      suffix.includes("company logos") ||
      suffix.includes("road 66")
    ) {
      return true;
    }
  }

  return false;
}

export function shouldHideNonGameLibraryEntry(
  game: Pick<Game, "id" | "title" | "description" | "launcher" | "status">,
): boolean {
  return isUnrealEngineAssetEntry(game) || isUbisoftDlcEntry(game);
}

export function groupLastPlayedMillis(group: GameGroup): number {
  if (!group.lastPlayedAt) {
    return Number.NEGATIVE_INFINITY;
  }

  const parsed = Date.parse(group.lastPlayedAt);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

export function groupSizeGb(group: GameGroup): number {
  return group.variants.reduce((total, game) => total + (game.sizeGb ?? 0), 0);
}

export function sortGameGroups(groups: GameGroup[], sortOption: LibrarySortOption): GameGroup[] {
  const sorted = [...groups];
  switch (sortOption) {
    case "alphabetical":
      sorted.sort((left, right) => left.title.localeCompare(right.title));
      break;
    case "last_played":
      sorted.sort((left, right) => groupLastPlayedMillis(right) - groupLastPlayedMillis(left));
      break;
    case "playtime":
      sorted.sort((left, right) => right.playtimeMinutes - left.playtimeMinutes);
      break;
    case "size":
      sorted.sort((left, right) => groupSizeGb(right) - groupSizeGb(left));
      break;
  }
  return sorted;
}

export function enrichGameWithMetadata(game: Game): Game {
  // Discovery and provider adapters already attach metadata they can prove. Do not
  // infer catalog facts from a title or id: an absent field must remain absent so
  // the UI can represent it as unavailable instead of presenting a plausible lie.
  return game;
}

export function parseLibrarySearchQuery(query: string) {
  const sizeMatch = query.match(SIZE_QUERY_SEARCH_REGEX);
  if (!sizeMatch) {
    return {
      activeSizeQueryFromSearch: "",
      parsedSearchText: query,
    };
  }

  return {
    activeSizeQueryFromSearch: sizeMatch[0],
    parsedSearchText: query.replace(SIZE_QUERY_SEARCH_REGEX, "").trim(),
  };
}
