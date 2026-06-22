import { normalizeLauncherKey } from "./formatters";
import type { LibraryAdvancedFilters } from "./library-filters";
import type { GameGroup } from "./game-groups";
import { STORAGE_KEYS } from "./storage-keys";
import type { LibrarySortOption } from "./library-sort";
import type { Game } from "./types";

export const SIZE_QUERY_SEARCH_REGEX = /(?:size\s*)?([><=])\s*(\d+(?:\.\d+)?)\s*(kb|mb|gb|tb)?/i;

export const FALLBACK_MOCK_GAMES: Game[] = [
  {
    id: "steam-Neo-Tokyo Drift",
    title: "Neo-Tokyo Drift",
    description: "Last played: Today. New content pack...",
    version: "1.8.2",
    status: "installed",
    platform: "windows",
    installPath: "C:/Games/OpenGameLauncher/Starfall Outpost",
    lastPlayed: "Today",
    playtimeMinutes: 3480,
  },
  {
    id: "steam-Steel Battalion X",
    title: "Steel Battalion X",
    description: "52 hours played",
    version: "0.9.4",
    status: "update_available",
    platform: "windows",
    installPath: "C:/Games/OpenGameLauncher/Iron Vale",
    lastPlayed: "May 17, 2026",
    playtimeMinutes: 920,
  },
  {
    id: "steam-Netrunner: Phantom",
    title: "Netrunner: Phantom",
    description: "Never played",
    version: "2.1.0",
    status: "update_available",
    platform: "linux",
    playtimeMinutes: 0,
  },
  {
    id: "steam-Akira's Revenge",
    title: "Akira's Revenge",
    description: "Downloading",
    version: "1.2.7",
    status: "installed",
    platform: "linux",
    installPath: "~/.local/share/open-game-launcher/games/embers-and-engines",
    lastPlayed: "May 12, 2026",
    playtimeMinutes: 2145,
    coverUrl: "/artwork/demo-cover.svg",
    iconUrl: "/artwork/demo-icon.svg",
    logoUrl: "/artwork/demo-logo.svg",
    logoUrls: ["/artwork/demo-logo.svg"],
  },
  {
    id: "software-open-streamer",
    title: "Open Streamer Tool",
    description: "Open source broadcasting software",
    version: "29.1.2",
    status: "installed",
    platform: "windows",
    installPath: "C:/Program Files/OpenStreamer",
    playtimeMinutes: 50,
  },
  {
    id: "video-cyber-punk",
    title: "Cyber Punk Trailer",
    description: "Official theatrical cinematic trailer",
    version: "1.0.0",
    status: "installed",
    platform: "windows",
    installPath: "C:/Users/User/Videos/cyberpunk.mp4",
  },
  {
    id: "dlc-blood-tide",
    title: "Blood Tide - Season Pass",
    description: "Expansion pack for Blood Tide",
    version: "1.0.0",
    status: "not_installed",
    platform: "windows",
  },
  {
    id: "beta-mech-warrior",
    title: "Mech Warrior - Beta Access",
    description: "Early playtest access build",
    version: "0.1.0",
    status: "installed",
    platform: "linux",
  },
];

export const PRODUCT_CATEGORIES = [
  "game",
  "software",
  "video",
  "dlc",
  "soundtrack",
  "demo",
  "beta",
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
  showGamePassCatalog: getXboxConnectionStatus(),
};

export function getXboxConnectionStatus(): boolean {
  try {
    if (localStorage.getItem(STORAGE_KEYS.XBOX_USERNAME)) {
      return true;
    }

    const cache = localStorage.getItem(STORAGE_KEYS.XBOX_GAMES_CACHE);
    if (cache) {
      const parsed = JSON.parse(cache);
      return Array.isArray(parsed);
    }
  } catch {
    /* ignore */
  }
  return false;
}

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
    showGamePassCatalog: getXboxConnectionStatus()
      ? true
      : typeof stored.showGamePassCatalog === "boolean"
        ? stored.showGamePassCatalog
        : false,
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
  if (launcher !== "ubisoft" || !game.id.startsWith("ubisoft-owned-")) {
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
    text.includes(" dlc") ||
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
    text.includes("knuckles") ||
    text.includes("gauntlet") ||
    text.includes("revolver") ||
    text.includes("pistol") ||
    text.includes("rifle") ||
    text.includes("kukri") ||
    text.includes("rapier") ||
    text.includes("sword") ||
    text.includes("spear") ||
    text.includes("axe") ||
    text.includes("artbook") ||
    text.includes("art book") ||
    text.includes("soundtrack") ||
    text.includes("ornament") ||
    text.includes("figurehead") ||
    text.includes("pre-order") ||
    text.includes("preorder") ||
    text.includes("promo") ||
    text.includes("giveaway") ||
    text.includes("xp boost") ||
    text.includes("loot") ||
    text.includes("ubicollectibles") ||
    text.includes("edition") ||
    text.includes("hero skin") ||
    text.includes("premier") ||
    text.includes("welcome") ||
    text.includes("signature") ||
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
      suffix.includes("freedom cry") ||
      suffix.includes("last stand") ||
      suffix.includes("human conditions") ||
      suffix.includes("no compromise") ||
      suffix.includes("bad blood") ||
      suffix.includes("road to") ||
      suffix.includes("conspiracy") ||
      suffix.includes("void dasher") ||
      suffix.includes("dedsec") ||
      suffix.startsWith("the ") ||
      suffix.includes("base game") ||
      suffix.includes("gold edition") ||
      suffix.includes("deluxe") ||
      suffix.includes("ultimate") ||
      suffix.includes("starter") ||
      suffix.includes("elite") ||
      suffix.includes("special") ||
      suffix.includes("animus")
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
  if (game.genres && game.genres.length > 0) {
    return {
      ...game,
      sizeGb: game.sizeGb || Number((((game.title.length * 7) % 115) + 0.5).toFixed(1)),
      players: game.players && game.players.length > 0 ? game.players : ["Singleplayer"],
      features: game.features ?? [],
      productCategory: game.productCategory || "game",
      steamDeckCompatibility: game.steamDeckCompatibility || "playable",
      protonCompatible: game.protonCompatible !== undefined ? game.protonCompatible : true,
    };
  }

  const title = game.title;
  const id = game.id;
  const lowerTitle = title.toLowerCase();

  if (
    lowerTitle.includes("neo-tokyo") ||
    id.includes("starfall-outpost") ||
    id.includes("neo-tokyo")
  ) {
    return {
      ...game,
      sizeGb: 12.4,
      players: ["Singleplayer", "Multiplayer", "Co-op", "PvP"],
      features: [
        "Steam Achievements",
        "Full Controller Support",
        "Steam Trading Cards",
        "Steam Cloud",
        "Stats",
      ],
      genres: ["Racing", "Action", "Sports"],
      productCategory: "game",
      steamDeckCompatibility: "verified",
      protonCompatible: true,
    };
  }
  if (
    lowerTitle.includes("steel battalion") ||
    id.includes("iron-vale") ||
    id.includes("steel-battalion")
  ) {
    return {
      ...game,
      sizeGb: 58.2,
      players: ["Singleplayer", "Multiplayer", "Co-op", "Online Co-op"],
      features: [
        "Steam Achievements",
        "Full Controller Support",
        "Steam Cloud",
        "Stats",
        "Leaderboards",
      ],
      genres: ["Strategy", "Simulation", "Action"],
      productCategory: "game",
      steamDeckCompatibility: "playable",
      protonCompatible: true,
    };
  }
  if (lowerTitle.includes("netrunner") || id.includes("neon-rally") || id.includes("netrunner")) {
    return {
      ...game,
      sizeGb: 0.35,
      players: [],
      features: [],
      genres: ["Indie", "Casual"],
      productCategory: "soundtrack",
      steamDeckCompatibility: "unknown",
      protonCompatible: false,
    };
  }
  if (lowerTitle.includes("akira") || id.includes("embers-and-engines") || id.includes("akira")) {
    return {
      ...game,
      sizeGb: 4.1,
      players: ["Singleplayer"],
      features: ["Full Controller Support", "Stats"],
      genres: ["Action", "Indie", "Casual"],
      productCategory: "demo",
      steamDeckCompatibility: "verified",
      protonCompatible: true,
    };
  }
  if (lowerTitle.includes("streamer tool") || id.includes("streamer")) {
    return {
      ...game,
      sizeGb: 0.8,
      players: [],
      features: ["Stats"],
      genres: ["Simulation"],
      productCategory: "software",
      steamDeckCompatibility: "unsupported",
      protonCompatible: false,
    };
  }
  if (lowerTitle.includes("trailer") || id.includes("cyber-punk")) {
    return {
      ...game,
      sizeGb: 1.2,
      players: [],
      features: [],
      genres: ["Casual"],
      productCategory: "video",
      steamDeckCompatibility: "unknown",
      protonCompatible: false,
    };
  }
  if (lowerTitle.includes("blood tide") || id.includes("blood-tide")) {
    return {
      ...game,
      sizeGb: 0.15,
      players: ["Singleplayer", "Multiplayer"],
      features: ["Steam Achievements"],
      genres: ["RPG", "Adventure", "Indie"],
      productCategory: "dlc",
      steamDeckCompatibility: "verified",
      protonCompatible: true,
    };
  }
  if (lowerTitle.includes("mech warrior") || id.includes("mech-warrior")) {
    return {
      ...game,
      sizeGb: 34.5,
      players: ["Multiplayer", "PvP", "MMO"],
      features: ["Full Controller Support", "Stats", "Leaderboards", "In-App Purchases"],
      genres: ["Action", "Strategy", "Early Access"],
      productCategory: "beta",
      steamDeckCompatibility: "playable",
      protonCompatible: true,
    };
  }

  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i);
    hash |= 0;
  }
  hash = Math.abs(hash);

  const genresList = [
    "Action",
    "Adventure",
    "RPG",
    "Strategy",
    "Simulation",
    "Indie",
    "Casual",
    "Sports",
    "Racing",
    "Free to Play",
    "Early Access",
  ];
  const playersList = [
    "Singleplayer",
    "Multiplayer",
    "Co-op",
    "PvP",
    "Online Co-op",
    "Local Co-op",
    "Shared/Split Screen",
    "MMO",
  ];
  const featuresList = [
    "Steam Achievements",
    "Full Controller Support",
    "Steam Trading Cards",
    "Steam Workshop",
    "Steam Cloud",
    "Stats",
    "Leaderboards",
    "In-App Purchases",
    "VR Supported",
    "Comments available",
  ];
  const productCategories = ["game", "software", "video", "dlc", "soundtrack", "demo", "beta"];
  const compatibilities: ("verified" | "playable" | "unsupported" | "unknown")[] = [
    "verified",
    "playable",
    "unsupported",
    "unknown",
  ];

  const numGenres = (hash % 3) + 1;
  const assignedGenres: string[] = [];
  for (let i = 0; i < numGenres; i++) {
    const idx = (hash + i * 7) % genresList.length;
    if (!assignedGenres.includes(genresList[idx])) {
      assignedGenres.push(genresList[idx]);
    }
  }

  const numPlayers = (hash % 4) + 1;
  const assignedPlayers: string[] = [];
  for (let i = 0; i < numPlayers; i++) {
    const idx = (hash + i * 13) % playersList.length;
    if (!assignedPlayers.includes(playersList[idx])) {
      assignedPlayers.push(playersList[idx]);
    }
  }

  const numFeatures = (hash % 5) + 1;
  const assignedFeatures: string[] = [];
  for (let i = 0; i < numFeatures; i++) {
    const idx = (hash + i * 17) % featuresList.length;
    if (!assignedFeatures.includes(featuresList[idx])) {
      assignedFeatures.push(featuresList[idx]);
    }
  }

  const assignedProductCategory = productCategories[hash % productCategories.length];
  const assignedDeckCompatibility = compatibilities[hash % compatibilities.length];
  const sizeGb = Number(((hash % 115) + 0.5).toFixed(1));
  const protonCompatible = hash % 2 === 0;

  return {
    ...game,
    sizeGb,
    players: assignedPlayers,
    features: assignedFeatures,
    genres: assignedGenres,
    productCategory: assignedProductCategory,
    steamDeckCompatibility: assignedDeckCompatibility,
    protonCompatible,
  };
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
