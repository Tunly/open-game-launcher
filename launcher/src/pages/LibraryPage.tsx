import {
  Download,
  FileSearch,
  Play,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";

import { LibrarySidebar } from "../components/library/LibrarySidebar";
import { GameDetails } from "../components/library/GameDetails";
import { PlatformSourceIcon } from "../components/library/PlatformIcons";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useActivityLogger } from "../hooks/useActivityLogger";
import { getGameAssetUrl } from "../lib/assets";
import {
  addManualGame,
  captureScreenshot,
  fetchEpicOwnedGames,
  fetchUbisoftOwnedGames,
  fetchGamePassCatalog,
  eaFetchOwnedGames,
  eaGetToken,
  fetchGogOwnedGames,
  fetchSteamOwnedGames,
  gogGetToken,
  gogRefreshToken,
  installXboxGame,
  launchGame,
  launchXboxGame,
  listInstalledGames,
  moveGame,
  normalizeSteamOwnedGames,
  openSteamScraperWindow,
  refreshInstalledGames,
  launchCrossPlayJoin,
  startDownload,
  syncGameAchievements,
} from "../lib/launcher";
import { useCloudAutoSync } from "../hooks/useCloudAutoSync";
import { syncGamePlaytimeStats } from "../lib/supabase/playtime";
import type { OwnedGame } from "../lib/launcher";
import type { Game } from "../lib/types";
import {
  groupGames,
  isInstallableGame,
  isPlayableGame,
  supportedAchievementSyncGames,
  type GameGroup,
} from "../lib/game-groups";
import {
  applyCustomArtwork,
  type CustomArtworkKind,
  type CustomArtworkMap,
} from "../lib/custom-artwork";
import {
  executableTitleFromPath,
  formatPlayTime,
  getGameSource,
  getGameLogoCandidates,
  normalizeLauncherKey,
} from "../lib/formatters";
import {
  countActiveAdvancedFilters,
  gamePassesAdvancedFilters,
  LIBRARY_FEATURE_FILTER_OPTIONS,
  LIBRARY_STORE_FILTER_OPTIONS,
  matchesSearchQuery,
  matchesSizeQuery,
  type LibraryAdvancedFilters,
} from "../lib/library-filters";
import { STEAM_OWNED_GAMES_CACHE_VERSION, STORAGE_KEYS } from "../lib/storage-keys";
import { useDownloadStore } from "../stores/downloadStore";

const SIZE_QUERY_SEARCH_REGEX = /(?:size\s*)?([><=])\s*(\d+(?:\.\d+)?)\s*(kb|mb|gb|tb)?/i;
const LOGO_PRELOAD_LIMIT = 48;

export type LibrarySortOption = "alphabetical" | "last_played" | "playtime" | "size";

type ProviderPickerState = {
  mode: "play" | "install";
  title: string;
  variants: Game[];
} | null;

function groupLastPlayedMillis(group: GameGroup): number {
  if (!group.lastPlayedAt) {
    return Number.NEGATIVE_INFINITY;
  }

  const parsed = Date.parse(group.lastPlayedAt);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function groupSizeGb(group: GameGroup): number {
  return group.variants.reduce((total, game) => total + (game.sizeGb ?? 0), 0);
}

function sortGameGroups(groups: GameGroup[], sortOption: LibrarySortOption): GameGroup[] {
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

function triggerSilentSteamScraper(steamId: string) {
  void openSteamScraperWindow(steamId).catch((err) => {
    console.warn("Failed to open silent steam scraper window:", err);
  });
}

type GameActivityUpdate = {
  gameId: string;
  lastPlayed?: string | null;
  playtimeMinutes?: number | null;
};

type LibraryInventoryChanged = {
  reason: string;
  gameCount: number;
};

function readLibrarySnapshot() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.LIBRARY_SNAPSHOT);
    if (!saved) {
      return [];
    }

    const games = JSON.parse(saved);
    return Array.isArray(games) ? (games as Game[]) : [];
  } catch {
    return [];
  }
}

function writeLibrarySnapshot(games: Game[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.LIBRARY_SNAPSHOT, JSON.stringify(games));
  } catch {
    // The native cache is authoritative; this snapshot only prevents UI flicker.
  }
}

function readLocalStorageString(key: string) {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return "";
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : "";
  } catch {
    // Stored as a raw string, possibly with surrounding quote characters.
    const trimmed = raw.trim();
    if (trimmed.length >= 2) {
      const first = trimmed[0];
      const last = trimmed[trimmed.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        return trimmed.slice(1, -1);
      }
    }
    return trimmed;
  }
}

function getSteamAppId(game: Game) {
  if (game.launcher === "steam" && game.externalId && /^\d+$/.test(game.externalId)) {
    return game.externalId;
  }

  for (const prefix of ["steam-owned-", "steam-"]) {
    if (game.id.startsWith(prefix)) {
      const appId = game.id.slice(prefix.length);
      if (/^\d+$/.test(appId)) {
        return appId;
      }
    }
  }

  const launchUriAppId = game.launchUri?.match(/^steam:\/\/rungameid\/(\d+)$/)?.[1];
  return launchUriAppId ?? null;
}

function areGameListsEqual(left: Game[], right: Game[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((game, index) => JSON.stringify(game) === JSON.stringify(right[index]));
}

function parseLibrarySearchQuery(query: string) {
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

// ----------------------------------------------------
// FALLBACK MOCK GAMES FOR WEB/BROWSER DEMONSTRATION
// ----------------------------------------------------
const fallbackMockGames: Game[] = [
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
  }
];

// ----------------------------------------------------
// RESTRUCTURING GAME DATA WITH RICH METADATA
// ----------------------------------------------------
function enrichGameWithMetadata(game: Game): Game {
  // Preserve backend metadata; fill gaps so advanced filters stay usable.
  if (game.genres && game.genres.length > 0) {
    return {
      ...game,
      sizeGb: game.sizeGb || Number(((game.title.length * 7 % 115) + 0.5).toFixed(1)),
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

  // 1. Explicit matches for known launcher/mock games
  if (lowerTitle.includes("neo-tokyo") || id.includes("starfall-outpost") || id.includes("neo-tokyo")) {
    return {
      ...game,
      sizeGb: 12.4,
      players: ["Singleplayer", "Multiplayer", "Co-op", "PvP"],
      features: ["Steam Achievements", "Full Controller Support", "Steam Trading Cards", "Steam Cloud", "Stats"],
      genres: ["Racing", "Action", "Sports"],
      productCategory: "game",
      steamDeckCompatibility: "verified",
      protonCompatible: true
    };
  }
  if (lowerTitle.includes("steel battalion") || id.includes("iron-vale") || id.includes("steel-battalion")) {
    return {
      ...game,
      sizeGb: 58.2,
      players: ["Singleplayer", "Multiplayer", "Co-op", "Online Co-op"],
      features: ["Steam Achievements", "Full Controller Support", "Steam Cloud", "Stats", "Leaderboards"],
      genres: ["Strategy", "Simulation", "Action"],
      productCategory: "game",
      steamDeckCompatibility: "playable",
      protonCompatible: true
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
      protonCompatible: false
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
      protonCompatible: true
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
      protonCompatible: false
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
      protonCompatible: false
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
      protonCompatible: true
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
      protonCompatible: true
    };
  }

  // 2. Sizeneric deterministic hashing for any scanned games
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i);
    hash |= 0;
  }
  hash = Math.abs(hash);

  const genresList = ["Action", "Adventure", "RPG", "Strategy", "Simulation", "Indie", "Casual", "Sports", "Racing", "Free to Play", "Early Access"];
  const playersList = ["Singleplayer", "Multiplayer", "Co-op", "PvP", "Online Co-op", "Local Co-op", "Shared/Split Screen", "MMO"];
  const featuresList = ["Steam Achievements", "Full Controller Support", "Steam Trading Cards", "Steam Workshop", "Steam Cloud", "Stats", "Leaderboards", "In-App Purchases", "VR Supported", "Comments available"];
  const productCategories = ["game", "software", "video", "dlc", "soundtrack", "demo", "beta"];
  const compatibilities: ("verified" | "playable" | "unsupported" | "unknown")[] = ["verified", "playable", "unsupported", "unknown"];

  const numSizenres = (hash % 3) + 1;
  const assignedSizenres: string[] = [];
  for (let i = 0; i < numSizenres; i++) {
    const idx = (hash + i * 7) % genresList.length;
    if (!assignedSizenres.includes(genresList[idx])) {
      assignedSizenres.push(genresList[idx]);
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
  const protonCompatible = (hash % 2) === 0;

  return {
    ...game,
    sizeGb,
    players: assignedPlayers,
    features: assignedFeatures,
    genres: assignedSizenres,
    productCategory: assignedProductCategory,
    steamDeckCompatibility: assignedDeckCompatibility,
    protonCompatible
  };
}

interface DynamicCollection {
  name: string;
  filters: typeof initialAdvancedFilters;
  platformFilter: "all" | "windows" | "macos" | "linux";
  searchQuery: string;
}

const initialAdvancedFilters = {
  players: [] as string[],
  features: [] as string[],
  hardware: [] as string[],
  genres: [] as string[],
  status: [] as string[],
  platforms: [] as string[],
  launchers: [] as string[],
  categories: [] as string[],
  sizeQuery: "",
  productCategories: ["game", "software", "video", "dlc", "soundtrack", "demo", "beta"] as string[],
  showGamePassCatalog: getXboxConnectionStatus(),
};

function getXboxConnectionStatus(): boolean {
  try {
    if (localStorage.getItem(STORAGE_KEYS.XBOX_USERNAME)) {
      return true;
    }

    const cache = localStorage.getItem(STORAGE_KEYS.XBOX_GAMES_CACHE);
    if (cache) {
      const parsed = JSON.parse(cache);
      return Array.isArray(parsed);
    }
  } catch { /* ignore */ }
  return false;
}

type AdvancedFilters = LibraryAdvancedFilters;

type PersistedLibraryFilterState = {
  activePlatformFilter: "all" | "windows" | "macos" | "linux";
  advancedFilters: AdvancedFilters;
  searchQuery: string;
  sortOption: LibrarySortOption;
};

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeAdvancedFilters(value: unknown): AdvancedFilters {
  const stored = value && typeof value === "object"
    ? value as Partial<Record<keyof AdvancedFilters, unknown>>
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
    productCategories: normalizeStringArray(stored.productCategories).length > 0
      ? normalizeStringArray(stored.productCategories)
      : initialAdvancedFilters.productCategories,
    showGamePassCatalog: getXboxConnectionStatus() ? true : (typeof stored.showGamePassCatalog === "boolean" ? stored.showGamePassCatalog : false),
  };
}

function readPersistedLibraryFilterState(): PersistedLibraryFilterState {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.LIBRARY_FILTER_STATE);
    const parsed = saved ? JSON.parse(saved) : {};
    const state = parsed && typeof parsed === "object"
      ? parsed as Partial<PersistedLibraryFilterState>
      : {};
    const activePlatformFilter = ["all", "windows", "macos", "linux"].includes(state.activePlatformFilter ?? "")
      ? state.activePlatformFilter as PersistedLibraryFilterState["activePlatformFilter"]
      : "all";
    const sortOption = ["alphabetical", "last_played", "playtime", "size"].includes(state.sortOption ?? "")
      ? state.sortOption as LibrarySortOption
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function readCustomArtworkMap(): CustomArtworkMap {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.LIBRARY_CUSTOM_ARTWORK);
    const parsed: unknown = saved ? JSON.parse(saved) : {};
    return parsed && typeof parsed === "object" ? parsed as CustomArtworkMap : {};
  } catch {
    return {};
  }
}

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read selected artwork file."));
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Selected artwork file could not be converted."));
    };
    reader.readAsDataURL(file);
  });
}

function isUnrealEngineAssetEntry(game: Pick<Game, "id" | "title" | "description" | "launcher" | "status">): boolean {
  const launcher = normalizeLauncherKey(game.launcher, game.id);
  if (launcher !== "epic") {
    return false;
  }

  const text = `${game.id} ${game.title} ${game.description}`.toLowerCase();
  const titleLower = game.title.toLowerCase();
  const unrealMarker =
    text.includes("unreal engine")
    || text.includes("unrealengine")
    || text.includes("unreal marketplace")
    || text.includes("ue marketplace")
    || text.includes("marketplaceassets")
    || text.includes("marketplace assets")
    || text.includes("fab.com")
    || text.includes("\"fab\"")
    || text.includes("\"ue\"")
    || text.includes("uefn")
    || text.includes("ue-")
    || /\bue[45]?\b/.test(text);
  const assetMarker =
    text.includes("asset")
    || text.includes("vault")
    || text.includes("plugin")
    || text.includes("plugins")
    || text.includes("template")
    || text.includes("sample project")
    || text.includes("sample")
    || text.includes("environment")
    || text.includes("environments")
    || text.includes("material")
    || text.includes("materials")
    || text.includes("blueprint")
    || text.includes("blueprints")
    || text.includes("mesh")
    || text.includes("meshes")
    || text.includes("animation pack")
    || text.includes("animation")
    || text.includes("animations")
    || text.includes("vfx")
    || text.includes("sfx")
    || text.includes("sound effects")
    || text.includes("music pack")
    || text.includes("texture")
    || text.includes("textures")
    || text.includes("props")
    || text.includes("characters")
    || text.includes("3d model")
    || text.includes("kitbash")
    || text.includes("props pack")
    || text.includes("modular")
    || text.includes("low poly")
    || text.includes("stylized");

  // For epic-owned entries, also check title-only patterns that indicate
  // non-game content (e.g. Megascans, content packs from Fab/UE Marketplace)
  if (game.id.startsWith("epic-owned-")) {
    const titleAssetMarker =
      titleLower.includes("asset")
      || titleLower.includes("plugin")
      || titleLower.includes("template")
      || titleLower.includes("megascans")
      || titleLower.includes("quixel")
      || titleLower.includes("material")
      || titleLower.includes("mesh")
      || titleLower.includes("blueprint")
      || titleLower.includes("texture")
      || titleLower.includes("environment")
      || titleLower.includes("modular")
      || titleLower.includes("props")
      || titleLower.includes("vfx")
      || titleLower.includes("sfx")
      || titleLower.includes("animation pack")
      || titleLower.includes("stylized")
      || titleLower.includes("low poly")
      || titleLower.includes("kitbash")
      || titleLower.includes("3d model");
    return unrealMarker || assetMarker || titleAssetMarker;
  }

  return unrealMarker && assetMarker;
}

function isUbisoftDlcEntry(game: Pick<Game, "id" | "title" | "description" | "launcher">): boolean {
  const launcher = normalizeLauncherKey(game.launcher, game.id);
  if (launcher !== "ubisoft" || !game.id.startsWith("ubisoft-owned-")) {
    return false;
  }

  const titleLower = game.title.toLowerCase();
  const text = `${game.title} ${game.description}`.toLowerCase();

  // ── Internal / meta entries ──
  if (titleLower.includes("benchmark")
    || titleLower.includes("pts")
    || titleLower.includes("language pack")
    || titleLower.includes("texture pack")
    || titleLower.includes("ultra hd")
    || titleLower.includes("hd texture")
    || titleLower.includes("high-rez")
  ) {
    return true;
  }

  // ── DLC keyword matching ──
  const hasDlcKeyword = text.includes(" dlc")
    || text.includes("add-on")
    || text.includes("addon")
    || text.includes("season pass")
    || text.includes("battle pass")
    || text.includes("expansion")
    || text.includes("pack")
    || text.includes("paket")
    || text.includes("pass")
    || text.includes("bonus")
    || text.includes("upgrade")
    || text.includes("credit")
    || text.includes("coin")
    || text.includes("currency")
    || text.includes("helix")
    || text.includes("year")
    || text.includes("episode ")
    || text.includes("bundle")
    || text.includes("unlock")
    || text.includes("skin")
    || text.includes("outfit")
    || text.includes("costume")
    || text.includes("weapon")
    || text.includes("cosmetic")
    || text.includes("knuckles")
    || text.includes("gauntlet")
    || text.includes("revolver")
    || text.includes("pistol")
    || text.includes("rifle")
    || text.includes("kukri")
    || text.includes("rapier")
    || text.includes("sword")
    || text.includes("spear")
    || text.includes("axe")
    || text.includes("artbook")
    || text.includes("art book")
    || text.includes("soundtrack")
    || text.includes("ornament")
    || text.includes("figurehead")
    || text.includes("pre-order")
    || text.includes("preorder")
    || text.includes("promo")
    || text.includes("giveaway")
    || text.includes("xp boost")
    || text.includes("loot")
    || text.includes("ubicollectibles")
    || text.includes("edition")
    || text.includes("hero skin")
    || text.includes("premier")
    || text.includes("welcome")
    || text.includes("signature")
    || text.includes("season ");

  if (hasDlcKeyword) {
    return true;
  }

  // ── Pattern: "Base Game - DLC Subtitle" ──
  const dashIdx = titleLower.indexOf(" - ");
  if (dashIdx !== -1) {
    const suffix = titleLower.slice(dashIdx + 3);
    if (suffix.includes("hero")
      || suffix.includes("operator")
      || suffix.includes("character")
      || suffix.includes("quest")
      || suffix.includes("mission")
      || suffix.includes("dead kings")
      || suffix.includes("secrets of")
      || suffix.includes("freedom cry")
      || suffix.includes("last stand")
      || suffix.includes("human conditions")
      || suffix.includes("no compromise")
      || suffix.includes("bad blood")
      || suffix.includes("road to")
      || suffix.includes("conspiracy")
      || suffix.includes("void dasher")
      || suffix.includes("dedsec")
      || suffix.startsWith("the ")
      || suffix.includes("base game")
      || suffix.includes("gold edition")
      || suffix.includes("deluxe")
      || suffix.includes("ultimate")
      || suffix.includes("starter")
      || suffix.includes("elite")
      || suffix.includes("special")
      || suffix.includes("animus")
    ) {
      return true;
    }
  }

  return false;
}

function shouldHideNonGameLibraryEntry(game: Pick<Game, "id" | "title" | "description" | "launcher" | "status">): boolean {
  return isUnrealEngineAssetEntry(game) || isUbisoftDlcEntry(game);
}



export function LibraryPage() {
  const gameListScrollRef = useRef<HTMLDivElement>(null);
  const detailScrollRef = useRef<HTMLElement>(null);
  const automaticSyncInFlightRef = useRef(false);
  const autoAchievementSyncAttemptedRef = useRef<Set<string>>(new Set());
  const lastManualAchievementSyncRef = useRef<Map<string, number>>(new Map());
  const ACHIEVEMENT_SYNC_COOLDOWN_MS = 30_000;
  const lastFocusSyncAtRef = useRef(0);
  const { logGameStart, logAchievement, logScreenshot } = useActivityLogger();

  async function handleCaptureScreenshot() {
    if (!selectedGame) return;
    try {
      const dataUrl = await captureScreenshot();
      void logScreenshot(selectedGame.id, selectedGame.title, dataUrl);
      setStatusMessage("Screenshot captured and posted to your activity feed.");
    } catch (err) {
      setStatusMessage(`Screenshot failed: ${getErrorMessage(err)}`);
    }
  }
  const [initialLibrarySnapshot] = useState(readLibrarySnapshot);
  const installedGamesRef = useRef<Game[]>(initialLibrarySnapshot);
  const [installedGames, setInstalledGames] = useState<Game[]>(initialLibrarySnapshot);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [pendingSelectedGameId, setPendingSelectedGameId] = useState<string | null>(null);
  const [providerPicker, setProviderPicker] = useState<ProviderPickerState>(null);
  const [isDiscoveringGames, setIsDiscoveringGames] = useState(initialLibrarySnapshot.length === 0);
  const [discoveryMessage, setDiscoveryMessage] = useState<string | null>(null);
  const [logoCandidateIndexes, setLogoCandidateIndexes] = useState<
    Record<string, number>
  >(
    () => ({}),
  );
  const [loadedLogoUrls, setLoadedLogoUrls] = useState<Set<string>>(
    () => new Set(),
  );
  const [persistedLibraryFilterState] = useState(readPersistedLibraryFilterState);
  const [searchQuery, setSearchQuery] = useState(persistedLibraryFilterState.searchQuery);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isAddGameOpen, setIsAddGameOpen] = useState(false);
  const [addGameTitle, setAddGameTitle] = useState("");
  const [addGamePath, setAddGamePath] = useState("");
  const [addGameError, setAddGameError] = useState<string | null>(null);
  const [isAddingGame, setIsAddingGame] = useState(false);
  const [syncingAchievementGameId, setSyncingAchievementGameId] = useState<string | null>(null);
  const [customArtwork, setCustomArtwork] = useState<CustomArtworkMap>(readCustomArtworkMap);
  const downloadCount = useDownloadStore((s) => s.items.length);
  const completedDownloadCount = useDownloadStore((s) => s.completedCount());
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    installedGamesRef.current = installedGames;
  }, [installedGames]);

  useEffect(() => {
    const joinGame = searchParams.get("join");
    const platform = searchParams.get("platform");
    if (joinGame && platform) {
      void launchCrossPlayJoin(platform, joinGame)
        .then(() => {
          setStatusMessage(`Joining game on ${platform}...`);
          setSearchParams({}, { replace: true });
        })
        .catch((err: unknown) => {
          setStatusMessage(err instanceof Error ? err.message : String(err));
          setSearchParams({}, { replace: true });
        });
    }
  }, [searchParams, setSearchParams]);

  // ----------------------------------------------------
  // FILTER STATES
  // ----------------------------------------------------
  const [activePlatformFilter, setActivePlatformFilter] = useState<"all" | "windows" | "macos" | "linux">(
    persistedLibraryFilterState.activePlatformFilter,
  );
  const [isFilterPopupOpen, setIsFilterPopupOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState(persistedLibraryFilterState.advancedFilters);
  const [sortOption, setSortOption] = useState<LibrarySortOption>(persistedLibraryFilterState.sortOption);

  // ----------------------------------------------------
  // FAVORITE & HIDDEN & CATEGORIES STATES (localStorage)
  // ----------------------------------------------------
  const [favorites, setFavorites] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LIBRARY_FAVORITES);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [hiddenGames, setHiddenGames] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LIBRARY_HIDDEN);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [customCategories, setCustomCategories] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LIBRARY_CUSTOM_CATEGORIES);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LIBRARY_FAVORITES, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LIBRARY_HIDDEN, JSON.stringify(hiddenGames));
  }, [hiddenGames]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LIBRARY_CUSTOM_CATEGORIES, JSON.stringify(customCategories));
  }, [customCategories]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.LIBRARY_CUSTOM_ARTWORK, JSON.stringify(customArtwork));
    } catch (error) {
      console.warn("Failed to persist custom artwork:", error);
      setStatusMessage("Artwork could not be saved. Try a smaller image file.");
    }
  }, [customArtwork]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      localStorage.setItem(
        STORAGE_KEYS.LIBRARY_FILTER_STATE,
        JSON.stringify({
          activePlatformFilter,
          advancedFilters,
          searchQuery,
          sortOption,
        } satisfies PersistedLibraryFilterState),
      );
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [activePlatformFilter, advancedFilters, searchQuery, sortOption]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      writeLibrarySnapshot(installedGames);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [installedGames]);

  // ----------------------------------------------------
  // DYNAMIC COLLECTIONS STATES (localStorage)
  // ----------------------------------------------------
  const [dynamicCollections, setDynamicCollections] = useState<DynamicCollection[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LIBRARY_DYNAMIC_COLLECTIONS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LIBRARY_DYNAMIC_COLLECTIONS, JSON.stringify(dynamicCollections));
  }, [dynamicCollections]);

  const [newCollectionName, setNewCollectionName] = useState("");
  const [selectedCollectionName, setSelectedCollectionName] = useState<string | null>(null);

  // ----------------------------------------------------
  // MANUAL COLLECTIONS STATES (localStorage)
  // ----------------------------------------------------
  const [manualCollections, setManualCollections] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LIBRARY_MANUAL_COLLECTIONS);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LIBRARY_MANUAL_COLLECTIONS, JSON.stringify(manualCollections));
  }, [manualCollections]);

  const [selectedManualCollectionName, setSelectedManualCollectionName] = useState<string | null>(null);

  function applyDynamicCollection(name: string) {
    const collection = dynamicCollections.find(
      (entry) => entry.name.toLowerCase() === name.toLowerCase(),
    );
    if (!collection) {
      return;
    }

    setSelectedCollectionName(collection.name);
    setSelectedManualCollectionName(null);
    setAdvancedFilters(collection.filters);
    setActivePlatformFilter(collection.platformFilter);
    setSearchQuery(collection.searchQuery);
  }

  function selectManualCollection(name: string) {
    setSelectedManualCollectionName(name);
    setSelectedCollectionName(null);
  }

  function clearCollectionSelection() {
    setSelectedCollectionName(null);
    setSelectedManualCollectionName(null);
  }

  function resetAdvancedFilters() {
    setAdvancedFilters({
      ...initialAdvancedFilters,
      showGamePassCatalog: getXboxConnectionStatus(),
    });
    setActivePlatformFilter("all");
    setSearchQuery("");
    setSelectedCollectionName(null);
    setSelectedManualCollectionName(null);
  }

  const activeAdvancedFilterCount = useMemo(
    () => countActiveAdvancedFilters(advancedFilters, {
      ...initialAdvancedFilters,
      showGamePassCatalog: getXboxConnectionStatus(),
    }),
    [advancedFilters],
  );

  function saveCurrentFilterAsCollection(name: string) {
    if (!name.trim()) return;
    const trimmedName = name.trim();
    const newCol: DynamicCollection = {
      name: trimmedName,
      filters: advancedFilters,
      platformFilter: activePlatformFilter,
      searchQuery: searchQuery
    };
    setDynamicCollections(prev => {
      const filtered = prev.filter(c => c.name.toLowerCase() !== trimmedName.toLowerCase());
      return [...filtered, newCol];
    });
    setNewCollectionName("");
    applyDynamicCollection(trimmedName);
  }



  // ----------------------------------------------------
  // QUERY FILTER ENGINE (USEMEMO)
  // ----------------------------------------------------

  const shouldShowLibraryLoading = isDiscoveringGames && installedGames.length === 0;
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const baseLibraryGames = useMemo(
    () => (installedGames.length > 0 ? installedGames : fallbackMockGames)
      .filter((game) => !shouldHideNonGameLibraryEntry(game))
      .map((game) => applyCustomArtwork(game, customArtwork[game.id])),
    [customArtwork, installedGames],
  );
  const enrichedLibraryGames = useMemo(
    () => baseLibraryGames.map(enrichGameWithMetadata),
    [baseLibraryGames],
  );
  const {
    activeSizeQueryFromSearch,
    parsedSearchText,
  } = useMemo(
    () => parseLibrarySearchQuery(deferredSearchQuery),
    [deferredSearchQuery],
  );
  const selectedManualCollectionIds = useMemo(() => {
    if (!selectedManualCollectionName) {
      return null;
    }

    return new Set(manualCollections[selectedManualCollectionName] || []);
  }, [manualCollections, selectedManualCollectionName]);

  const libraryGroups = useMemo(
    () => sortGameGroups(groupGames(enrichedLibraryGames), sortOption),
    [enrichedLibraryGames, sortOption],
  );

  const filteredVariantGames = useMemo(() => {
    const filterContext = {
      activePlatformFilter,
      favorites,
      hiddenGames,
      customCategories,
    };

    const filtered = enrichedLibraryGames.filter((game) => {
      if (!matchesSearchQuery(game, parsedSearchText)) {
        return false;
      }

      const sizeQ = advancedFilters.sizeQuery || activeSizeQueryFromSearch;
      if (sizeQ && !matchesSizeQuery(game.sizeGb || 0, sizeQ)) {
        return false;
      }

      if (!gamePassesAdvancedFilters(game, advancedFilters, filterContext)) {
        return false;
      }

      if (selectedManualCollectionIds) {
        if (!selectedManualCollectionIds.has(game.id)) {
          return false;
        }
      }

      return true;
    });

    return filtered;
  }, [
    enrichedLibraryGames,
    activePlatformFilter,
    advancedFilters,
    favorites,
    hiddenGames,
    customCategories,
    activeSizeQueryFromSearch,
    parsedSearchText,
    selectedManualCollectionIds,
  ]);

  const filteredGroups = useMemo(
    () => sortGameGroups(groupGames(filteredVariantGames), sortOption),
    [filteredVariantGames, sortOption],
  );

  const selectedGroup = useMemo(
    () => filteredGroups.find((group) => group.id === selectedGroupId) ?? null,
    [filteredGroups, selectedGroupId],
  );

  const selectedGame = selectedGroup?.displayGame ?? null;
  const selectedPrimaryGame = selectedGroup?.primaryGame ?? null;

  const { maybeSyncOnLaunch: maybeAutoSyncOnLaunch } = useCloudAutoSync({
    game: selectedPrimaryGame ?? selectedGame,
    onMessage: setStatusMessage,
  });

  /** Convert backend OwnedGame into a frontend Game object */
  function ownedGameToGame(og: OwnedGame): Game {
    let launcher = "manual";
    if (og.id.startsWith("steam-")) launcher = "steam";
    else if (og.id.startsWith("epic-")) launcher = "epic";
    else if (og.id.startsWith("gog-")) launcher = "gog";
    else if (og.id.startsWith("xbox-") || og.id.startsWith("gamepass-")) launcher = "xbox";
    else if (og.id.startsWith("ubisoft-")) launcher = "ubisoft";
    else if (og.id.startsWith("ea-")) launcher = "ea";
    else if (og.id.startsWith("battlenet-")) launcher = "battlenet";

    const ubisoftLaunchId = og.externalId ?? og.id.replace(/^ubisoft-owned-/, "");
    const gogLaunchId = og.externalId ?? og.id.replace(/^gog-owned-/, "");
    const eaLaunchId = og.externalId ?? og.id.replace(/^ea-owned-/, "");
    const steamLaunchId = og.externalId ?? og.id.replace(/^steam-owned-/, "");

    return {
      id: og.id,
      externalId: og.externalId ?? undefined,
      title: og.title,
      launchUri: og.id.startsWith("steam-owned-") && /^\d+$/.test(steamLaunchId)
        ? `steam://install/${steamLaunchId}`
        : og.id.startsWith("ubisoft-owned-") && ubisoftLaunchId
          ? `uplay://launch/${ubisoftLaunchId}`
          : og.id.startsWith("gog-owned-") && gogLaunchId
            ? `gogalaxy://openGameView/${gogLaunchId}`
            : og.id.startsWith("ea-owned-") && eaLaunchId
              ? `origin://launchgame/${eaLaunchId}`
              : undefined,
      description: og.description,
      version: "1.0",
      coverUrl: og.coverUrl ?? undefined,
      logoUrl: og.logoUrl ?? undefined,
      iconUrl: og.iconUrl ?? undefined,
      iconUrls: og.iconUrl ? [og.iconUrl] : [],
      logoUrls: og.logoUrl ? [og.logoUrl] : [],
      logoPosition: "centerCenter",
      status: "not_installed",
      platform: "windows",
      launcher,
      playtimeMinutes: og.playtimeMinutes,
      lastPlayedAt: og.lastPlayedAt,
      lastPlayed: og.lastPlayedAt ?? undefined,
      cloudGamingUrl: og.cloudGamingUrl ?? undefined,
    } as Game;
  }

  async function loadInstalledGames(
    forceRefresh = false,
    shouldApplyResult: () => boolean = () => true,
    showLoading = true,
  ) {
    if (showLoading) {
      setIsDiscoveringGames(true);
      setDiscoveryMessage(null);
    }

    try {
      let games = (forceRefresh
        ? await refreshInstalledGames()
        : await listInstalledGames()
      ).map((game): Game => ({
        ...game,
        launcher: normalizeLauncherKey(game.launcher, game.id),
      }));

      const steamId = readLocalStorageString(STORAGE_KEYS.STEAM_ID);

      if (steamId) {
        try {
          let ownedRaw: OwnedGame[] = [];

          // Load owned games from the local WebView scraper cache
          const cacheStr = localStorage.getItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE);
          const cacheVersion = localStorage.getItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE_VERSION);
          if (!forceRefresh && cacheVersion === STEAM_OWNED_GAMES_CACHE_VERSION && cacheStr) {
            try {
              ownedRaw = normalizeSteamOwnedGames(JSON.parse(cacheStr));
            } catch (err) {
              console.warn("Failed to parse steamOwnedGamesCache:", err);
            }
          }

          if (ownedRaw.length === 0) {
            ownedRaw = normalizeSteamOwnedGames(await fetchSteamOwnedGames(steamId));
            if (ownedRaw.length > 0) {
              localStorage.setItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE, JSON.stringify(ownedRaw));
              localStorage.setItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE_VERSION, STEAM_OWNED_GAMES_CACHE_VERSION);
            }
          }

          // Trigger a silent scrape in the background using WebView cookies to update the cache
          triggerSilentSteamScraper(steamId);

          if (ownedRaw.length > 0) {
            const ownedGames = ownedRaw.map(ownedGameToGame);
            const installedSteamAppIds = new Set<string>();
            games.forEach((g) => {
              if (g.id.startsWith("steam-")) {
                installedSteamAppIds.add(g.id.replace("steam-", ""));
                installedSteamAppIds.add(g.title.toLowerCase());
              }
            });

            const uninstalledOwnedGames = ownedGames.filter((og) => {
              const appid = og.id.replace("steam-owned-", "");
              return !installedSteamAppIds.has(appid) && !installedSteamAppIds.has(og.title.toLowerCase());
            });

            games = [...games, ...uninstalledOwnedGames];
          }
        } catch (err) {
          const msg = String(err);
          console.warn("Failed to fetch owned steam games during load:", msg);
          if (msg.includes("400") || msg.includes("403") || msg.includes("Game Details")) {
            setStatusMessage("Warning: Steam: Please set 'Game Details' to Public in Steam > Profile > Privacy Settings. OG-Launcher will sync automatically.");
          }
        }
      }

      // 1. Fetch and merge GOG owned games (backend token is source of truth)
      try {
        const backendToken = await gogGetToken();
        const localTokenStr = localStorage.getItem(STORAGE_KEYS.GOG_TOKEN);
        const hasGogSession = Boolean(backendToken?.accessToken) || Boolean(localTokenStr);

        if (hasGogSession) {
          try {
            const refreshed = await gogRefreshToken();
            if (refreshed?.accessToken) {
              localStorage.setItem(STORAGE_KEYS.GOG_TOKEN, JSON.stringify({
                accessToken: refreshed.accessToken,
                refreshToken: refreshed.refreshToken,
                expiresAt: refreshed.expiresAt,
                userId: refreshed.userId,
              }));
            }
          } catch {
            // Token refresh failed, proceed with existing token
          }

          const ownedRaw = await fetchGogOwnedGames();
          const ownedGogGames = ownedRaw.map(ownedGameToGame);
          if (ownedGogGames.length > 0) {
            const installedGogKeys = new Set<string>();
            games.forEach((g) => {
              if (!g.id.startsWith("gog-")) {
                return;
              }

              installedGogKeys.add(g.id);
              installedGogKeys.add(g.id.replace(/^gog-/, ""));
              installedGogKeys.add(g.title.toLowerCase());
              if (g.externalId) {
                installedGogKeys.add(g.externalId);
                installedGogKeys.add(`gog-owned-${g.externalId}`);
              }
            });

            const uninstalledOwnedGogGames = ownedGogGames.filter((og) => {
              const ownedId = og.externalId ?? og.id.replace(/^gog-owned-/, "");
              if (installedGogKeys.has(og.id) || installedGogKeys.has(og.title.toLowerCase())) {
                return false;
              }
              if (installedGogKeys.has(ownedId) || installedGogKeys.has(`gog-owned-${ownedId}`)) {
                return false;
              }
              return true;
            });

            games = [...games, ...uninstalledOwnedGogGames];
          }
        }
      } catch (err) {
        console.warn("Failed to fetch owned GOG games during load:", err);
      }

      // Fetch and merge EA App owned games (requires valid backend token)
      try {
        const eaToken = await eaGetToken();
        if (!eaToken?.accessToken) {
          localStorage.removeItem(STORAGE_KEYS.EA_TOKEN);
        } else {
          localStorage.setItem(STORAGE_KEYS.EA_TOKEN, JSON.stringify({
            accessToken: eaToken.accessToken,
            capturedAt: eaToken.capturedAt,
          }));

          const ownedRaw = await eaFetchOwnedGames();
          const ownedEaGames = ownedRaw.map(ownedGameToGame);
          if (ownedEaGames.length > 0) {
            const installedEaKeys = new Set<string>();
            games.forEach((g) => {
              const launcher = (g.launcher || "").toLowerCase();
              if (!g.id.startsWith("ea-") && !launcher.includes("ea")) {
                return;
              }

              installedEaKeys.add(g.id);
              installedEaKeys.add(g.title.toLowerCase());
              if (g.externalId) {
                installedEaKeys.add(g.externalId);
                installedEaKeys.add(`ea-owned-${g.externalId}`);
              }
            });

            const uninstalledOwnedEaGames = ownedEaGames.filter((og) => {
              const ownedId = og.externalId ?? og.id.replace(/^ea-owned-/, "");
              if (installedEaKeys.has(og.id) || installedEaKeys.has(og.title.toLowerCase())) {
                return false;
              }
              if (installedEaKeys.has(ownedId) || installedEaKeys.has(`ea-owned-${ownedId}`)) {
                return false;
              }
              return true;
            });

            games = [...games, ...uninstalledOwnedEaGames];
          } else {
            setStatusMessage("EA is connected but returned 0 games. Try Settings → EA App → Disconnect, then connect again.");
          }
        }
      } catch (err) {
        const msg = getErrorMessage(err);
        console.warn("Failed to fetch owned EA games during load:", msg);
        if (msg.includes("expired") || msg.includes("not connected")) {
          localStorage.removeItem(STORAGE_KEYS.EA_TOKEN);
        }
        setStatusMessage(`Warning: EA library sync failed: ${msg}`);
      }

      // 2. Fetch and merge Epic owned games
      const epicTokenStr = localStorage.getItem(STORAGE_KEYS.EPIC_TOKEN);
      if (epicTokenStr) {
        try {
          const tokenObj = JSON.parse(epicTokenStr);
          if (tokenObj && tokenObj.accessToken) {
            const ownedRaw = await fetchEpicOwnedGames();
            const ownedEpicGames = ownedRaw
              .map(ownedGameToGame)
              .filter((game) => !shouldHideNonGameLibraryEntry(game));
            if (ownedEpicGames.length > 0) {
              const installedEpicIds = new Set<string>();
              games.forEach((g) => {
                if (g.id.startsWith("epic-")) {
                  installedEpicIds.add(g.id.replace("epic-", ""));
                  installedEpicIds.add(g.title.toLowerCase());
                }
              });

              const uninstalledOwnedEpicGames = ownedEpicGames.filter((og) => {
                const epicParts = og.id.replace("epic-owned-", "").split(":");
                const catalogItemId = epicParts[1] || "";
                const appName = epicParts[2] || "";

                return !installedEpicIds.has(catalogItemId) &&
                       !installedEpicIds.has(appName) &&
                       !installedEpicIds.has(og.title.toLowerCase());
              });

              games = [...games, ...uninstalledOwnedEpicGames];
            }
          }
        } catch (err) {
          console.warn("Failed to fetch owned Epic games during load:", err);
        }
      }

      // 3. Fetch and merge Ubisoft owned games
      try {
        const ubiRaw = await fetchUbisoftOwnedGames();
        const ownedUbiGames = ubiRaw
          .map(ownedGameToGame)
          .filter((game) => !shouldHideNonGameLibraryEntry(game));
        if (ownedUbiGames.length > 0) {
          const installedUbiKeys = new Set<string>();
          games.forEach((g) => {
            if (!g.id.startsWith("ubisoft-")) {
              return;
            }

            installedUbiKeys.add(g.id);
            installedUbiKeys.add(g.id.replace(/^ubisoft-/, ""));
            installedUbiKeys.add(g.title.toLowerCase());
            if (g.externalId) {
              installedUbiKeys.add(g.externalId);
              installedUbiKeys.add(`ubisoft-owned-${g.externalId}`);
            }
          });

          const uninstalledOwnedUbiGames = ownedUbiGames.filter((og) => {
            const ownedNumericId = og.externalId ?? og.id.replace(/^ubisoft-owned-/, "");
            if (installedUbiKeys.has(og.id) || installedUbiKeys.has(og.title.toLowerCase())) {
              return false;
            }
            if (installedUbiKeys.has(ownedNumericId) || installedUbiKeys.has(`ubisoft-owned-${ownedNumericId}`)) {
              return false;
            }
            return true;
          });

          games = [...games, ...uninstalledOwnedUbiGames];
        }
      } catch (err) {
        console.warn("Failed to fetch owned Ubisoft games during load:", err);
      }

      // 4. Fetch and merge Xbox owned games
      const xboxGamesStr = localStorage.getItem(STORAGE_KEYS.XBOX_GAMES_CACHE);
      if (xboxGamesStr) {
        try {
          const xboxRaw = JSON.parse(xboxGamesStr);
          if (Array.isArray(xboxRaw) && xboxRaw.length > 0) {
            const ownedXboxGames = xboxRaw.map(ownedGameToGame);
            const installedXboxIds = new Set<string>();
            games.forEach((g) => {
              if (g.id.startsWith("xbox-")) {
                installedXboxIds.add(g.id.replace("xbox-", ""));
                installedXboxIds.add(g.title.toLowerCase());
              }
            });

            const uninstalledOwnedXboxGames = ownedXboxGames.filter((og) => {
              const xboxId = og.id.replace("xbox-owned-", "");
              return !installedXboxIds.has(xboxId) && !installedXboxIds.has(og.title.toLowerCase());
            });

            games = [...games, ...uninstalledOwnedXboxGames];
          }
        } catch (err) {
          console.warn("Failed to load Xbox games from cache:", err);
        }
      }

      // 5. Fetch and merge Game Pass catalog
      const gamePassGamesStr = localStorage.getItem(STORAGE_KEYS.GAME_PASS_CATALOG_CACHE);
      if (gamePassGamesStr) {
        try {
            const gamePassRaw = JSON.parse(gamePassGamesStr);
            if (Array.isArray(gamePassRaw) && gamePassRaw.length > 0) {
              const gamePassGames = gamePassRaw.map(ownedGameToGame);
              games = [...games, ...gamePassGames];
            }
        } catch (err) {
          console.warn("Failed to load Game Pass catalog from cache:", err);
        }
      }

      // 6. Fetch and merge Battle.net owned games
      const battlenetGamesStr = localStorage.getItem(STORAGE_KEYS.BATTLENET_GAMES_CACHE);
      if (battlenetGamesStr) {
        try {
          const battlenetRaw = JSON.parse(battlenetGamesStr);
          if (Array.isArray(battlenetRaw) && battlenetRaw.length > 0) {
            const ownedBattlenetGames = battlenetRaw.map(ownedGameToGame);
            const installedBattlenetIds = new Set<string>();
            games.forEach((g) => {
              if (g.id.startsWith("battlenet-")) {
                installedBattlenetIds.add(g.id.replace("battlenet-", ""));
                installedBattlenetIds.add(g.title.toLowerCase());
                if (g.externalId) installedBattlenetIds.add(g.externalId);
              }
            });

            const uninstalledOwnedBattlenetGames = ownedBattlenetGames.filter((og) => {
              const bnetId = og.id.replace("battlenet-owned-", "");
              const extId = og.externalId || bnetId;
              return !installedBattlenetIds.has(bnetId)
                && !installedBattlenetIds.has(extId)
                && !installedBattlenetIds.has(og.title.toLowerCase());
            });

            games = [...games, ...uninstalledOwnedBattlenetGames];
          }
        } catch (err) {
          console.warn("Failed to load Battle.net games from cache:", err);
        }
      }

      if (!shouldApplyResult()) {
        return;
      }

      const gamesWithoutAssets = games.filter((game) => !shouldHideNonGameLibraryEntry(game));
      setInstalledGames((current) =>
        areGameListsEqual(current, gamesWithoutAssets) ? current : gamesWithoutAssets,
      );
      setDiscoveryMessage(
        gamesWithoutAssets.length > 0
          ? null
          : "No installed Steam, Epic, or GOG games found. Demo mode loaded.",
      );
    } catch {
      if (!shouldApplyResult()) {
        return;
      }

      setInstalledGames([]);
      setDiscoveryMessage(
        forceRefresh
          ? "Automatic sync not available. Showing mock library."
          : "Saved library not available. Showing mock library.",
      );
    } finally {
      if (showLoading && shouldApplyResult()) {
        setIsDiscoveringGames(false);
      }
    }
  }

  function shouldRunStartupLibraryRescan() {
    try {
      if (sessionStorage.getItem(STORAGE_KEYS.STARTUP_LIBRARY_RESCAN_DONE) === "true") {
        return false;
      }

      sessionStorage.setItem(STORAGE_KEYS.STARTUP_LIBRARY_RESCAN_DONE, "true");
      return true;
    } catch {
      return true;
    }
  }

  async function runAutomaticLibrarySync(forceRefresh = false) {
    if (automaticSyncInFlightRef.current) {
      return;
    }

    automaticSyncInFlightRef.current = true;
    try {
      await loadInstalledGames(forceRefresh, () => true, false);
    } finally {
      automaticSyncInFlightRef.current = false;
    }
  }

  // Load cached games first, then run one silent sync per app session for new installs.
  useEffect(() => {
    let isMounted = true;

    async function loadLibrary() {
      if (automaticSyncInFlightRef.current) return;
      automaticSyncInFlightRef.current = true;
      try {
        const shouldRefreshOnStartup = shouldRunStartupLibraryRescan();

        if (initialLibrarySnapshot.length > 0 && shouldRefreshOnStartup) {
          await loadInstalledGames(true, () => isMounted, false);
        } else {
          await loadInstalledGames(
            false,
            () => isMounted,
            initialLibrarySnapshot.length === 0,
          );

          if (isMounted && shouldRefreshOnStartup) {
            await loadInstalledGames(true, () => isMounted, false);
          }
        }
      } finally {
        automaticSyncInFlightRef.current = false;
      }
    }

    void loadLibrary();

    return () => {
      isMounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLibrarySnapshot.length]);

  useEffect(() => {
    let isMounted = true;
    
    if (advancedFilters.showGamePassCatalog) {
      const cacheStr = localStorage.getItem(STORAGE_KEYS.GAME_PASS_CATALOG_CACHE);
      let needsFetch = !cacheStr;
      if (cacheStr) {
        try {
          const parsed = JSON.parse(cacheStr);
          if (!Array.isArray(parsed) || parsed.length === 0) {
            needsFetch = true;
          }
        } catch {
          needsFetch = true;
        }
      }

      if (needsFetch) {
        setIsDiscoveringGames(true);
        setDiscoveryMessage("Fetching Xbox Game Pass Catalog (~500 games)...");
        fetchGamePassCatalog().then(games => {
          if (!isMounted) return;
          localStorage.setItem(STORAGE_KEYS.GAME_PASS_CATALOG_CACHE, JSON.stringify(games));
          void runAutomaticLibrarySync(true);
        }).catch(err => {
          if (!isMounted) return;
          console.error("Game Pass fetch failed", err);
        }).finally(() => {
          if (!isMounted) return;
          setIsDiscoveringGames(false);
          setDiscoveryMessage(null);
        });
      } else {
        void runAutomaticLibrarySync(false);
      }
    }

    return () => {
      isMounted = false;
    };
    // Mount-only Game Pass bootstrap; library sync closure is intentionally stable enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advancedFilters.showGamePassCatalog]);

  useEffect(() => {
    let isMounted = true;

    const unlistenPromise = listen<GameActivityUpdate>(
      "game_activity_updated",
      (event) => {
        if (!isMounted) {
          return;
        }

        const update = event.payload;
        const applyUpdate = (game: Game): Game =>
          game.id === update.gameId
            ? {
                ...game,
                lastPlayed: update.lastPlayed ?? game.lastPlayed,
                lastPlayedAt: update.lastPlayed ?? game.lastPlayedAt,
                playtimeMinutes: update.playtimeMinutes ?? game.playtimeMinutes,
              }
            : game;

        setInstalledGames((current) => current.map(applyUpdate));

        const sourceGame = installedGamesRef.current.find((game) => game.id === update.gameId);
        if (sourceGame) {
          const updatedGame = applyUpdate(sourceGame);
          void syncGamePlaytimeStats({
            game: updatedGame,
            playtimeMinutes: updatedGame.playtimeMinutes,
            lastPlayedAt: updatedGame.lastPlayedAt ?? updatedGame.lastPlayed ?? null,
          }).catch((error) => {
            console.warn("Failed to sync playtime stats:", error);
          });
        }
      },
    );

    return () => {
      isMounted = false;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // Auto-reload library when Steam, GOG or Epic account connects or silent scrape completes
  useEffect(() => {
    let isMounted = true;

    const unlistenInventory = listen<LibraryInventoryChanged>("library_inventory_changed", () => {
      if (!isMounted) return;
      void runAutomaticLibrarySync(false);
    });

    const unlistenSteam = listen<string>("steam_login_success", () => {
      if (!isMounted) return;
      void runAutomaticLibrarySync(false);
    });

    const unlistenGog = listen<string>("gog_login_code", () => {
      if (!isMounted) return;
      void runAutomaticLibrarySync(true);
    });

    const unlistenEa = listen("ea_login_success", () => {
      if (!isMounted) return;
      void runAutomaticLibrarySync(true);
    });

    const handleBattlenetUpdated = () => {
      if (!isMounted) return;
      void runAutomaticLibrarySync(false);
    };
    window.addEventListener("battlenet_library_updated", handleBattlenetUpdated);

    const unlistenScrapedSuccess = listen<unknown[]>("steam_scraped_games_success", (event) => {
      if (!isMounted) return;
      const ownedGames = normalizeSteamOwnedGames(event.payload);
      localStorage.setItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE, JSON.stringify(ownedGames));
      localStorage.setItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE_VERSION, STEAM_OWNED_GAMES_CACHE_VERSION);
      void runAutomaticLibrarySync(false);
    });

    const unlistenScrapedError = listen<string>("steam_scraped_games_error", (event) => {
      if (!isMounted) return;
      console.warn("[OG-Launcher] Silent scraper failed:", event.payload);
      setStatusMessage(`Warning: Steam: ${event.payload}`);
    });

    return () => {
      isMounted = false;
      void unlistenInventory.then((u) => u());
      void unlistenSteam.then((u) => u());
      void unlistenGog.then((u) => u());
      void unlistenEa.then((u) => u());
      window.removeEventListener("battlenet_library_updated", handleBattlenetUpdated);
      void unlistenScrapedSuccess.then((u) => u());
      void unlistenScrapedError.then((u) => u());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const syncOnFocus = () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      const now = Date.now();
      if (now - lastFocusSyncAtRef.current < 30_000) {
        return;
      }

      lastFocusSyncAtRef.current = now;
      void runAutomaticLibrarySync(true);
    };

    window.addEventListener("focus", syncOnFocus);
    document.addEventListener("visibilitychange", syncOnFocus);

    return () => {
      window.removeEventListener("focus", syncOnFocus);
      document.removeEventListener("visibilitychange", syncOnFocus);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-enable Game Pass catalog when Xbox is connected
  useEffect(() => {
    const checkAndEnable = () => {
      if (getXboxConnectionStatus() && !advancedFilters.showGamePassCatalog) {
        setAdvancedFilters(prev => ({ ...prev, showGamePassCatalog: true }));
      }
    };

    checkAndEnable();

    const handleFocus = () => checkAndEnable();
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [advancedFilters.showGamePassCatalog]);

  // Update selected group if list updates
  useEffect(() => {
    if (filteredGroups.length === 0) {
      setSelectedGroupId(null);
      return;
    }

    if (pendingSelectedGameId) {
      const pendingGroup = filteredGroups.find((group) =>
        group.variants.some((game) => game.id === pendingSelectedGameId),
      );
      if (pendingGroup) {
        setSelectedGroupId(pendingGroup.id);
        setPendingSelectedGameId(null);
        return;
      }
    }

    if (!selectedGroupId || !filteredGroups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(filteredGroups[0].id);
    }
  }, [filteredGroups, pendingSelectedGameId, selectedGroupId]);

  // Image preloading
  useEffect(() => {
    const listToPreload = [
      ...(selectedGame ? [selectedGame] : []),
      ...filteredGroups.slice(0, LOGO_PRELOAD_LIMIT).map((group) => group.displayGame),
    ];
    const logoUrls = Array.from(
      new Set(
        listToPreload.flatMap((game) => getGameLogoCandidates(game).slice(0, 2)),
      ),
    );

    const preloadImages = logoUrls
      .map((logoUrl) => getGameAssetUrl(logoUrl))
      .filter((logoUrl): logoUrl is string => Boolean(logoUrl))
      .map((logoUrl) => {
        const image = new Image();
        image.decoding = "async";
        image.onload = () => handleLogoLoad(logoUrl);
        image.src = logoUrl;
        return image;
      });

    return () => {
      preloadImages.forEach((image) => {
        image.onload = null;
      });
    };
  }, [filteredGroups, selectedGame]);

  // Autoclose status notices
  useEffect(() => {
    if (!statusMessage) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setStatusMessage(null);
    }, 4500);

    return () => window.clearTimeout(timeout);
  }, [statusMessage]);

  useEffect(() => {
    if (!selectedGroup || selectedGroup.achievements.length > 0) {
      return;
    }

    const candidates = supportedAchievementSyncGames(selectedGroup).filter(
      (game) => !(game.achievements?.length),
    );
    if (candidates.length === 0) {
      return;
    }

    for (const game of candidates) {
      if (autoAchievementSyncAttemptedRef.current.has(game.id)) {
        continue;
      }

      if (getGameSource(game) === "steam" && !readLocalStorageString(STORAGE_KEYS.STEAM_ID)) {
        continue;
      }

      autoAchievementSyncAttemptedRef.current.add(game.id);
      void syncAchievementsForGame(game, { silent: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroup?.id, selectedGroup?.achievements.length]);

  async function handlePlayVariant(game: Game) {
    setStatusMessage(null);

    try {
      if (game.id.startsWith("xbox-owned-")) {
        const pfn = game.id.replace("xbox-owned-", "");
        await installXboxGame(pfn);
        setStatusMessage("Opened Microsoft Store for installation.");
        return;
      }
      
      if (game.id.startsWith("xbox-")) {
        const pfn = game.id.replace("xbox-", "");
        await launchXboxGame(pfn);
        setStatusMessage("Launching Xbox game...");
        void logGameStart(game.id, game.title, { launcher: "xbox" });
        void syncGamePlaytimeStats({
          game,
          playtimeMinutes: game.playtimeMinutes,
          lastPlayedAt: new Date().toISOString(),
          countSessionStart: true,
        }).catch((error) => {
          console.warn("Failed to sync play session start:", error);
        });
        return;
      }

      // For owned games that are NOT installed, route through the download manager
      // so they appear in the Download Queue with live progress tracking.
      if (
        game.status !== "installed" &&
        (game.id.startsWith("steam-owned-") ||
         game.id.startsWith("gog-owned-") ||
         game.id.startsWith("epic-owned-") ||
         game.id.startsWith("ea-owned-") ||
         game.id.startsWith("ubisoft-owned-") ||
         game.id.startsWith("battlenet-owned-"))
      ) {
        const response = await startDownload(
          game.id,
          game.title,
          game.downloadUrl,
          game.downloadSha256,
        );
        setStatusMessage(response.message);
        return;
      }

      // For owned games that ARE installed, launch them via their native client
      if (
        game.id.startsWith("steam-owned-") ||
        game.id.startsWith("gog-owned-") ||
        game.id.startsWith("epic-owned-")
      ) {
        const response = await launchGame(game.id);
        setStatusMessage(response.message);
        void logGameStart(game.id, game.title, { launcher: game.launcher });
        void syncGamePlaytimeStats({
          game,
          playtimeMinutes: game.playtimeMinutes,
          lastPlayedAt: new Date().toISOString(),
          countSessionStart: true,
        }).catch((error) => {
          console.warn("Failed to sync play session start:", error);
        });
        void maybeAutoSyncOnLaunch();
        return;
      }

      if (game.status === "installed") {
        const response = await launchGame(game.id);
        setStatusMessage(response.message);
        void logGameStart(game.id, game.title, { launcher: game.launcher });
        void syncGamePlaytimeStats({
          game,
          playtimeMinutes: game.playtimeMinutes,
          lastPlayedAt: new Date().toISOString(),
          countSessionStart: true,
        }).catch((error) => {
          console.warn("Failed to sync play session start:", error);
        });
        void maybeAutoSyncOnLaunch();
        return;
      }

      const response = await startDownload(
        game.id,
        game.title,
        game.downloadUrl,
        game.downloadSha256,
      );
      setStatusMessage(response.message);
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  }

  async function handlePlay() {
    if (!selectedGroup) {
      return;
    }

    const playableVariants = selectedGroup.variants.filter(isPlayableGame);
    if (playableVariants.length > 1) {
      setProviderPicker({
        mode: "play",
        title: selectedGroup.title,
        variants: playableVariants,
      });
      return;
    }

    if (playableVariants.length === 1) {
      await handlePlayVariant(playableVariants[0]);
      return;
    }

    const installableVariants = selectedGroup.variants.filter(isInstallableGame);
    if (installableVariants.length > 1) {
      setProviderPicker({
        mode: "install",
        title: selectedGroup.title,
        variants: installableVariants,
      });
      return;
    }

    if (installableVariants.length === 1) {
      await handlePlayVariant(installableVariants[0]);
    }
  }

  async function handleInstallFromProvider() {
    if (!selectedGroup) {
      return;
    }

    const installableVariants = selectedGroup.variants.filter(isInstallableGame);
    if (installableVariants.length > 1) {
      setProviderPicker({
        mode: "install",
        title: selectedGroup.title,
        variants: installableVariants,
      });
      return;
    }

    if (installableVariants.length === 1) {
      await handlePlayVariant(installableVariants[0]);
    }
  }

  async function syncAchievementsForGame(game: Game, options: { silent?: boolean; force?: boolean } = {}) {
    let steamId: string | null = null;
    const syncSource = getGameSource(game);

    if (syncSource !== "xbox") {
      const hasSteamAppId = Boolean(getSteamAppId(game));
      if (!hasSteamAppId) {
        if (!options.silent) {
          setStatusMessage(`${game.title} does not expose a Steam AppID for achievement sync.`);
        }
        return;
      }

      steamId = readLocalStorageString(STORAGE_KEYS.STEAM_ID);
      if (!steamId) {
        if (!options.silent) {
          setStatusMessage("Steam achievement sync needs a connected Steam account in Settings.");
        }
        return;
      }
    }

    if (!options.silent && !options.force) {
      const last = lastManualAchievementSyncRef.current.get(game.id) ?? 0;
      const elapsed = Date.now() - last;
      if (elapsed < ACHIEVEMENT_SYNC_COOLDOWN_MS) {
        const remaining = Math.ceil((ACHIEVEMENT_SYNC_COOLDOWN_MS - elapsed) / 1000);
        setStatusMessage(`Please wait ${remaining}s before syncing again.`);
        return;
      }
      lastManualAchievementSyncRef.current.set(game.id, Date.now());
    }

    const syncTarget = syncSource === "xbox" ? "Xbox" : "Steam";

    if (!options.silent) {
      setStatusMessage(`Syncing ${syncTarget} achievements...`);
    }
    setSyncingAchievementGameId(game.id);

    try {
      const response = await syncGameAchievements(
        game,
        steamId || undefined,
      );

      setInstalledGames((current) => {
        const previous = current.find((g) => g.id === response.game.id);
        const previousUnlocked = new Set(
          previous?.achievements?.filter((a) => a.unlockedAt).map((a) => a.id) ?? [],
        );
        const newUnlocks =
          response.game.achievements?.filter(
            (a) => a.unlockedAt && !previousUnlocked.has(a.id),
          ) ?? [];
        for (const unlock of newUnlocks) {
          void logAchievement(
            response.game.id,
            response.game.title,
            unlock.name ?? null,
            { achievementId: unlock.id, rarity: unlock.rarity ?? null },
          );
        }
        if (newUnlocks.length > 0 && !options.silent) {
          setStatusMessage(
            `${newUnlocks.length} new achievement${newUnlocks.length === 1 ? "" : "s"} unlocked!`,
          );
        } else if (!options.silent) {
          setStatusMessage(response.message);
        }
        return current.map((game) => (game.id === response.game.id ? response.game : game));
      });
    } catch (error) {
      if (!options.silent) {
        setStatusMessage(getErrorMessage(error));
      } else {
        console.warn("[OG-Launcher] Auto achievement sync failed:", getErrorMessage(error));
      }
    } finally {
      setSyncingAchievementGameId(null);
    }
  }

  async function handleSyncAchievements() {
    if (!selectedGroup) {
      return;
    }

    const candidates = supportedAchievementSyncGames(selectedGroup);
    if (candidates.length === 0) {
      setStatusMessage("No Steam or Xbox variant is available for achievement sync.");
      return;
    }

    for (const game of candidates) {
      await syncAchievementsForGame(game, { force: candidates.length > 1 });
    }
  }

  async function handleAddManualGame() {
    const title = addGameTitle.trim();
    const installPath = addGamePath.trim();

    if (!title || !installPath) {
      setAddGameError("Title and EXE are required.");
      return;
    }

    setIsAddingGame(true);
    setAddGameError(null);
    setStatusMessage(null);

    try {
      const game = await addManualGame({ title, installPath });
      setInstalledGames((current) => {
        const withoutDuplicate = current.filter((item) => item.id !== game.id);
        return [...withoutDuplicate, game];
      });
      setPendingSelectedGameId(game.id);
      setAddGameTitle("");
      setAddGamePath("");
      setAddGameError(null);
      setIsAddGameOpen(false);
      setStatusMessage(`${game.title} has been added to the library.`);
    } catch (error) {
      setAddGameError(getErrorMessage(error));
    } finally {
      setIsAddingGame(false);
    }
  }

  function handleSelectGameExecutable() {
    setAddGameError(null);
    setAddGameError("File selection is disabled without the dialog plugin. Enter the EXE path manually.");
  }

  function handleLogoError(game: Game) {
    const candidates = getGameLogoCandidates(game);

    setLogoCandidateIndexes((current) => {
      const currentIndex = current[game.id] ?? 0;
      return {
        ...current,
        [game.id]: currentIndex + 1 >= candidates.length
          ? candidates.length
          : currentIndex + 1,
      };
    });
  }

  function handleLogoLoad(logoUrl: string) {
    setLoadedLogoUrls((current) => {
      if (current.has(logoUrl)) {
        return current;
      }

      const next = new Set(current);
      next.add(logoUrl);
      return next;
    });
  }

  async function handleSelectCustomArtwork(
    gameId: string,
    kind: CustomArtworkKind,
    file: File,
  ) {
    if (!file.type.startsWith("image/")) {
      setStatusMessage("Only image files can be used as custom artwork.");
      return;
    }

    try {
      const dataUrl = await readImageAsDataUrl(file);
      setCustomArtwork((current) => ({
        ...current,
        [gameId]: {
          ...current[gameId],
          [`${kind}Url`]: dataUrl,
          updatedAt: Date.now(),
        },
      }));
      setLogoCandidateIndexes((current) => ({ ...current, [gameId]: 0 }));
      setStatusMessage(`Custom ${kind} artwork saved.`);
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  }

  function handleResetCustomArtwork(gameId: string, kind?: CustomArtworkKind) {
    setCustomArtwork((current) => {
      const currentArtwork = current[gameId];
      if (!currentArtwork) {
        return current;
      }

      const next = { ...current };
      if (!kind) {
        delete next[gameId];
        return next;
      }

      const nextArtwork = { ...currentArtwork };
      delete nextArtwork[`${kind}Url`];
      nextArtwork.updatedAt = Date.now();

      if (!nextArtwork.coverUrl && !nextArtwork.iconUrl && !nextArtwork.logoUrl) {
        delete next[gameId];
      } else {
        next[gameId] = nextArtwork;
      }

      return next;
    });
    setLogoCandidateIndexes((current) => ({ ...current, [gameId]: 0 }));
    setStatusMessage(kind ? `Custom ${kind} artwork reset.` : "Custom artwork reset.");
  }

  const enrichedSelectedGame = selectedGame;

  return (
    <div className="library-steam-shell h-full min-h-0 overflow-hidden border-x-0 border-black bg-[#fbf4e7] text-[#171411] sm:border-x-4">
      <div className="relative grid h-full min-h-0 min-w-0 grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[290px_minmax(0,1fr)]">

        {/* ====================================================
            SIDEBAR PANEL
            ==================================================== */}
        <LibrarySidebar
          games={libraryGroups}
          filteredGames={filteredGroups}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          sortOption={sortOption}
          setSortOption={setSortOption}
          isFilterPopupOpen={isFilterPopupOpen}
          setIsFilterPopupOpen={setIsFilterPopupOpen}
          activePlatformFilter={activePlatformFilter}
          advancedFilters={advancedFilters}
          hasActiveFilters={
            Boolean(searchQuery.trim())
            || activePlatformFilter !== "all"
            || activeAdvancedFilterCount > 0
            || Boolean(selectedCollectionName)
            || Boolean(selectedManualCollectionName)
          }
          onResetFilters={resetAdvancedFilters}
          groupOption={"none"}
          groupedGames={{}}
          selectedGroup={selectedGroup}
          setSelectedGroup={(group) => setSelectedGroupId(group.id)}
          favorites={favorites}
          fallbackMockGames={fallbackMockGames}
          listScrollRef={gameListScrollRef}
          setIsAddGameOpen={setIsAddGameOpen}
          setAddGameError={setAddGameError}
        />
        {/* ====================================================
            ADVANCED FILTER POPUP PANEL (Overlay)
            ==================================================== */}
        {isFilterPopupOpen ? (
          <div
            className="absolute left-2 right-2 top-12 z-50 max-h-[82vh] overflow-y-auto border-4 border-black bg-[#fbf4e7] p-4 shadow-[6px_6px_0_#171411] sm:left-[260px] sm:right-auto sm:w-[380px] lg:left-[290px]"
            style={{ fontFamily: '"Arial Narrow", Impact, sans-serif' }}
          >
            <div className="flex items-center justify-between border-b-4 border-black pb-2 mb-4 gap-2">
              <h3 className="neo-title text-2xl flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-[#b7102a]" />
                Advanced Filters
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={resetAdvancedFilters}
                  className="neo-copy border-2 border-black bg-[#efe3cf] px-2 py-1 text-[9px] font-black uppercase hover:bg-[#d8cbb7]"
                  type="button"
                >
                  Reset All
                </button>
                <button
                  onClick={() => setIsFilterPopupOpen(false)}
                  className="grid h-8 w-8 place-items-center border-2 border-black bg-[#efe3cf] hover:bg-[#d8cbb7]"
                  type="button"
                  aria-label="Close filters"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {/* PLATFORM CHECKBOXES */}
              <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#000]">
                <h4 className="font-black uppercase text-[12px] border-b border-black pb-1 mb-2 flex items-center justify-between">
                  <span>Platform</span>
                  {advancedFilters.platforms.length > 0 && (
                    <button onClick={() => setAdvancedFilters(prev => ({ ...prev, platforms: [] }))} className="text-[10px] underline lowercase">clear</button>
                  )}
                </h4>
                <div className="grid grid-cols-3 gap-1">
                  {["Windows", "macOS", "Linux"].map((plat) => {
                    const isChecked = advancedFilters.platforms.includes(plat);
                    return (
                      <button
                        key={plat}
                        onClick={() => {
                          setAdvancedFilters(prev => ({
                            ...prev,
                            platforms: isChecked ? prev.platforms.filter(p => p !== plat) : [...prev.platforms, plat]
                          }));
                        }}
                        className={`border-2 border-black py-1 px-1 text-[10px] font-black uppercase transition ${
                          isChecked ? "bg-[#139a82] text-white shadow-[1px_1px_0_#000]" : "bg-[#ded3c1] hover:bg-[#d5c7b1]"
                        }`}
                      >
                        {plat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* LAUNCHERS CHECKBOXES */}
              <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#000]">
                <h4 className="font-black uppercase text-[12px] border-b border-black pb-1 mb-2 flex items-center justify-between">
                  <span>Game Platform (Store)</span>
                  {advancedFilters.launchers && advancedFilters.launchers.length > 0 && (
                    <button onClick={() => setAdvancedFilters(prev => ({ ...prev, launchers: [] }))} className="text-[10px] underline lowercase">clear</button>
                  )}
                </h4>
                <div className="grid grid-cols-3 gap-1">
                  {LIBRARY_STORE_FILTER_OPTIONS.map((l) => {
                    const isChecked = advancedFilters.launchers?.includes(l.toLowerCase());
                    return (
                      <button
                        key={l}
                        onClick={() => {
                          setAdvancedFilters(prev => {
                            const launchers = prev.launchers || [];
                            return {
                              ...prev,
                              launchers: isChecked ? launchers.filter(x => x !== l.toLowerCase()) : [...launchers, l.toLowerCase()]
                            };
                          });
                        }}
                        className={`border-2 border-black py-1 px-1 text-[10px] font-black uppercase transition ${
                          isChecked ? "bg-[#139a82] text-white shadow-[1px_1px_0_#000]" : "bg-[#ded3c1] hover:bg-[#d5c7b1]"
                        }`}
                      >
                        {l}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* PLAYER COUNT CHECKBOXES */}
              <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#000]">
                <h4 className="font-black uppercase text-[12px] border-b border-black pb-1 mb-2 flex items-center justify-between">
                  <span>Player Count</span>
                  {advancedFilters.players.length > 0 && (
                    <button onClick={() => setAdvancedFilters(prev => ({ ...prev, players: [] }))} className="text-[10px] underline lowercase">clear</button>
                  )}
                </h4>
                <div className="grid grid-cols-2 gap-1.5">
                  {["Singleplayer", "Multiplayer", "Co-op", "PvP", "Online Co-op", "Local Co-op", "Shared/Split Screen", "MMO"].map((p) => {
                    const isChecked = advancedFilters.players.includes(p);
                    return (
                      <label key={p} className="flex items-center gap-1.5 text-[11px] font-bold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setAdvancedFilters(prev => ({
                              ...prev,
                              players: isChecked ? prev.players.filter(x => x !== p) : [...prev.players, p]
                            }));
                          }}
                          className="w-3.5 h-3.5 border-2 border-black accent-[#139a82]"
                        />
                        <span>{p}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* FEATURES */}
              <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#000]">
                <h4 className="font-black uppercase text-[12px] border-b border-black pb-1 mb-2 flex items-center justify-between">
                  <span>Features</span>
                  {advancedFilters.features.length > 0 && (
                    <button onClick={() => setAdvancedFilters(prev => ({ ...prev, features: [] }))} className="text-[10px] underline lowercase">clear</button>
                  )}
                </h4>
                <div className="grid grid-cols-2 gap-1.5">
                  {LIBRARY_FEATURE_FILTER_OPTIONS.map((feature) => {
                    const isChecked = advancedFilters.features.includes(feature);
                    return (
                      <label key={feature} className="flex items-center gap-1.5 text-[11px] font-bold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setAdvancedFilters(prev => ({
                              ...prev,
                              features: isChecked
                                ? prev.features.filter((entry) => entry !== feature)
                                : [...prev.features, feature],
                            }));
                          }}
                          className="w-3.5 h-3.5 border-2 border-black accent-[#139a82]"
                        />
                        <span>{feature}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* HARDWARE COMPATIBILITY */}
              <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#000]">
                <h4 className="font-black uppercase text-[12px] border-b border-black pb-1 mb-2 flex items-center justify-between">
                  <span>Hardware Compatibility</span>
                  {advancedFilters.hardware.length > 0 && (
                    <button onClick={() => setAdvancedFilters(prev => ({ ...prev, hardware: [] }))} className="text-[10px] underline lowercase">clear</button>
                  )}
                </h4>
                <div className="grid grid-cols-2 gap-1.5">
                  {["Steam Deck Verified", "Steam Deck Playable", "Full Controller Support", "VR"].map((hw) => {
                    const isChecked = advancedFilters.hardware.includes(hw);
                    return (
                      <label key={hw} className="flex items-center gap-1.5 text-[11px] font-bold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setAdvancedFilters(prev => ({
                              ...prev,
                              hardware: isChecked ? prev.hardware.filter(x => x !== hw) : [...prev.hardware, hw]
                            }));
                          }}
                          className="w-3.5 h-3.5 border-2 border-black accent-[#139a82]"
                        />
                        <span>{hw}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* GENRE BUTTONS */}
              <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#000]">
                <h4 className="font-black uppercase text-[12px] border-b border-black pb-1 mb-2 flex items-center justify-between">
                  <span>Genre</span>
                  {advancedFilters.genres.length > 0 && (
                    <button onClick={() => setAdvancedFilters(prev => ({ ...prev, genres: [] }))} className="text-[10px] underline lowercase">clear</button>
                  )}
                </h4>
                <div className="grid grid-cols-3 gap-1">
                  {["Action", "Adventure", "RPG", "Strategy", "Simulation", "Indie", "Casual", "Sports", "Racing", "Free to Play", "Early Access"].map((g) => {
                    const isChecked = advancedFilters.genres.includes(g);
                    return (
                      <button
                        key={g}
                        onClick={() => {
                          setAdvancedFilters(prev => ({
                            ...prev,
                            genres: isChecked ? prev.genres.filter(x => x !== g) : [...prev.genres, g]
                          }));
                        }}
                        className={`border-2 border-black py-0.5 px-0.5 text-[9px] font-black uppercase transition ${
                          isChecked ? "bg-[#139a82] text-white shadow-[1px_1px_0_#000]" : "bg-[#ded3c1] hover:bg-[#d5c7b1]"
                        }`}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* GAME PASS CATALOG FILTER */}
              <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#000]">
                <h4 className="font-black uppercase text-[12px] border-b border-black pb-1 mb-2">
                  Xbox Game Pass
                </h4>
                <label className="flex items-center gap-1.5 text-[11px] font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advancedFilters.showGamePassCatalog}
                    onChange={(e) => setAdvancedFilters(prev => ({ ...prev, showGamePassCatalog: e.target.checked }))}
                    className="w-3.5 h-3.5 border-2 border-black accent-[#139a82]"
                  />
                  <span>Show Game Pass Catalog</span>
                </label>
              </div>

              {/* PLAY STATUS CHECKBOXES */}
              <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#000]">
                <h4 className="font-black uppercase text-[12px] border-b border-black pb-1 mb-2 flex items-center justify-between">
                  <span>Play Status</span>
                  {advancedFilters.status.length > 0 && (
                    <button onClick={() => setAdvancedFilters(prev => ({ ...prev, status: [] }))} className="text-[10px] underline lowercase">clear</button>
                  )}
                </h4>
                <div className="grid grid-cols-2 gap-1.5">
                  {["Installed", "Uninstalled", "Played", "Never Played", "Favorites", "Hidden"].map((st) => {
                    const isChecked = advancedFilters.status.includes(st);
                    return (
                      <label key={st} className="flex items-center gap-1.5 text-[11px] font-bold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setAdvancedFilters(prev => ({
                              ...prev,
                              status: isChecked ? prev.status.filter(x => x !== st) : [...prev.status, st]
                            }));
                          }}
                          className="w-3.5 h-3.5 border-2 border-black accent-[#139a82]"
                        />
                        <span>{st}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* CUSTOM CATEGORIES CHECKBOXES */}
              {Array.from(new Set(Object.values(customCategories).flat())).length > 0 ? (
                <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#000]">
                  <h4 className="font-black uppercase text-[12px] border-b border-black pb-1 mb-2 flex items-center justify-between">
                    <span>Kategorie (Benutzerdefiniert)</span>
                    {advancedFilters.categories.length > 0 && (
                      <button onClick={() => setAdvancedFilters(prev => ({ ...prev, categories: [] }))} className="text-[10px] underline lowercase">clear</button>
                    )}
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {Array.from(new Set(Object.values(customCategories).flat())).map((cat) => {
                      const isChecked = advancedFilters.categories.includes(cat);
                      return (
                        <button
                          key={cat}
                          onClick={() => {
                            setAdvancedFilters(prev => ({
                              ...prev,
                              categories: isChecked ? prev.categories.filter(x => x !== cat) : [...prev.categories, cat]
                            }));
                          }}
                          className={`border border-black py-0.5 px-1.5 text-[10px] font-bold transition rounded-sm ${
                            isChecked ? "bg-[#139a82] text-white" : "bg-[#ded3c1] hover:bg-[#d5c7b1]"
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* PRODUCT CATEGORIES FILTER */}
              <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#000]">
                <h4 className="font-black uppercase text-[11px] border-b border-black pb-1 mb-2">
                  Product Categories (Show/Hide)
                </h4>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { key: "game", label: "Games" },
                    { key: "software", label: "Software" },
                    { key: "video", label: "Videos" },
                    { key: "dlc", label: "DLCs" },
                    { key: "soundtrack", label: "Soundtracks" },
                    { key: "demo", label: "Demos" },
                    { key: "beta", label: "Beta Access" }
                  ].map(({ key, label }) => {
                    const isChecked = advancedFilters.productCategories.includes(key);
                    return (
                      <label key={key} className="flex items-center gap-1.5 text-[11px] font-bold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setAdvancedFilters(prev => ({
                              ...prev,
                              productCategories: isChecked
                                ? prev.productCategories.filter(x => x !== key)
                                : [...prev.productCategories, key]
                            }));
                          }}
                          className="w-3.5 h-3.5 border-2 border-black accent-[#139a82]"
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* SIZE FILTER TEXT & PRESETS */}
              <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#000]">
                <h4 className="font-black uppercase text-[12px] border-b border-black pb-1 mb-2 flex items-center justify-between">
                  <span>Size</span>
                  {advancedFilters.sizeQuery && (
                    <button onClick={() => setAdvancedFilters(prev => ({ ...prev, sizeQuery: "" }))} className="text-[10px] underline lowercase">clear</button>
                  )}
                </h4>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="z.B. size:>10gb, size:<5gb"
                    value={advancedFilters.sizeQuery}
                    onChange={(e) => setAdvancedFilters(prev => ({ ...prev, sizeQuery: e.target.value }))}
                    className="neo-copy h-8 w-full border-2 border-black bg-[#f4ead8] px-2 text-[11px] font-bold outline-none placeholder:text-[#686157]"
                  />
                  <div className="flex gap-1">
                    {["size:>10gb", "size:<5gb", "size:=50gb"].map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setAdvancedFilters(prev => ({ ...prev, sizeQuery: preset }))}
                        className="border border-black bg-[#ded3c1] hover:bg-[#d5c7b1] px-1.5 py-0.5 text-[9px] font-black uppercase"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* SAVED COLLECTIONS */}
              {(dynamicCollections.length > 0 || Object.keys(manualCollections).length > 0) ? (
                <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#000]">
                  <h4 className="font-black uppercase text-[12px] border-b border-black pb-1 mb-2 flex items-center justify-between">
                    <span>Collections</span>
                    {(selectedCollectionName || selectedManualCollectionName) ? (
                      <button
                        type="button"
                        onClick={clearCollectionSelection}
                        className="text-[10px] underline lowercase"
                      >
                        clear
                      </button>
                    ) : null}
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {dynamicCollections.map((collection) => (
                      <button
                        key={`dynamic-${collection.name}`}
                        type="button"
                        onClick={() => applyDynamicCollection(collection.name)}
                        className={`border-2 border-black px-2 py-0.5 text-[10px] font-black uppercase transition ${
                          selectedCollectionName === collection.name
                            ? "bg-[#b7102a] text-white shadow-[1px_1px_0_#000]"
                            : "bg-[#ded3c1] hover:bg-[#d5c7b1]"
                        }`}
                      >
                        {collection.name}
                      </button>
                    ))}
                    {Object.keys(manualCollections).map((collectionName) => (
                      <button
                        key={`manual-${collectionName}`}
                        type="button"
                        onClick={() => selectManualCollection(collectionName)}
                        className={`border-2 border-black px-2 py-0.5 text-[10px] font-black uppercase transition ${
                          selectedManualCollectionName === collectionName
                            ? "bg-[#139a82] text-white shadow-[1px_1px_0_#000]"
                            : "bg-[#ded3c1] hover:bg-[#d5c7b1]"
                        }`}
                      >
                        {collectionName}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* SAVE AS DYNAMIC COLLECTION PANEL */}
              <div className="border-4 border-[#b7102a] bg-[#fbf4e7] p-2 mt-4 shadow-[2px_2px_0_#000]">
                <h4 className="font-black uppercase text-[11px] text-[#b7102a] mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Save as Dynamic Collection
                </h4>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Collection Name..."
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    className="neo-copy h-8 flex-1 border-2 border-black bg-[#f4ead8] px-2 text-[11px] font-bold outline-none"
                  />
                  <button
                    onClick={() => saveCurrentFilterAsCollection(newCollectionName)}
                    disabled={!newCollectionName.trim()}
                    className="border-2 border-black bg-[#b7102a] text-white hover:bg-[#9a0b20] px-3 py-1 text-[10px] font-black uppercase disabled:opacity-45"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 border-t-2 border-black pt-3 flex gap-2">
              <button
                onClick={() => setAdvancedFilters(initialAdvancedFilters)}
                className="flex-1 border-2 border-black bg-[#efe3cf] hover:bg-[#d8cbb7] py-1.5 text-[11px] font-black uppercase"
              >
                Reset Filters
              </button>
              <button
                onClick={() => setIsFilterPopupOpen(false)}
                className="flex-1 border-2 border-black bg-black text-white hover:bg-[#2c2c2c] py-1.5 text-[11px] font-black uppercase"
              >
                Apply
              </button>
            </div>
          </div>
        ) : null}


        {/* ====================================================
            GAME DETAILS MAIN CONTENT
            ==================================================== */}
        <GameDetails
          selectedGame={selectedGame}
          enrichedSelectedGame={enrichedSelectedGame}
          shouldShowLibraryLoading={shouldShowLibraryLoading}
          handlePlay={handlePlay}
          onInstallFromProvider={handleInstallFromProvider}
          hasInstallableVariants={Boolean(selectedGroup?.variants.some(isInstallableGame))}
          handleCaptureScreenshot={handleCaptureScreenshot}
          handleSyncAchievements={handleSyncAchievements}
          isSyncingAchievements={Boolean(
            syncingAchievementGameId
            && selectedGroup?.variants.some((game) => game.id === syncingAchievementGameId),
          )}
          gameVariants={selectedGroup?.variants ?? []}
          logoCandidateIndexes={logoCandidateIndexes}
          loadedLogoUrls={loadedLogoUrls}
          handleLogoLoad={handleLogoLoad}
          handleLogoError={handleLogoError}
          statusMessage={statusMessage}
          setStatusMessage={setStatusMessage}
          favorites={favorites}
          setFavorites={setFavorites}
          hiddenGames={hiddenGames}
          setHiddenGames={setHiddenGames}
          customCategories={customCategories}
          setCustomCategories={setCustomCategories}
          manualCollections={manualCollections}
          setManualCollections={setManualCollections}
          setActivePlatformFilter={setActivePlatformFilter}
          clearCollectionSelection={clearCollectionSelection}
          detailScrollRef={detailScrollRef}
          isDiscoveringGames={isDiscoveringGames}
          discoveryMessage={discoveryMessage}
          moveGame={moveGame}
          runAutomaticLibrarySync={runAutomaticLibrarySync}
          customArtwork={selectedPrimaryGame ? customArtwork[selectedPrimaryGame.id] ?? null : null}
          artworkGameId={selectedPrimaryGame?.id}
          onSelectCustomArtwork={handleSelectCustomArtwork}
          onResetCustomArtwork={handleResetCustomArtwork}
        />
      </div>

      {isAddGameOpen ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/45 px-4">
          <form
            className="w-full max-w-[520px] border-4 border-black bg-[#fbf4e7] shadow-[8px_8px_0_#171411]"
            onSubmit={(event) => {
              event.preventDefault();
              void handleAddManualGame();
            }}
          >
            <div className="flex items-center justify-between border-b-4 border-black bg-[#b7102a] px-4 py-3 text-white">
              <h2 className="neo-title text-2xl uppercase leading-none">Add a Game</h2>
              <button
                type="button"
                className="grid h-8 w-8 place-items-center border-2 border-black bg-[#fbf4e7] text-[#171411] shadow-[2px_2px_0_#171411]"
                onClick={() => setIsAddGameOpen(false)}
                aria-label="Close add game"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              <label className="block">
                <span className="neo-copy block text-[11px] font-black uppercase text-[#55504a]">
                  Game title
                </span>
                <input
                  className="mt-1 h-11 w-full border-4 border-black bg-[#fffaf0] px-3 text-[14px] font-black uppercase outline-none shadow-[3px_3px_0_#171411]"
                  value={addGameTitle}
                  onChange={(event) => {
                    setAddGameError(null);
                    setAddGameTitle(event.target.value);
                  }}
                  placeholder="Example: Hollow Knight"
                  autoFocus
                />
              </label>

              <label className="block">
                <span className="neo-copy block text-[11px] font-black uppercase text-[#55504a]">
                  Executable
                </span>
                <div className="mt-1 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <input
                    className="h-11 min-w-0 border-4 border-black bg-[#fffaf0] px-3 text-[13px] font-bold outline-none shadow-[3px_3px_0_#171411]"
                    value={addGamePath}
                    placeholder="C:/Games/Example/Game.exe"
                    onChange={(event) => {
                      const nextPath = event.target.value;
                      setAddGameError(null);
                      setAddGamePath(nextPath);
                      if (!addGameTitle.trim()) {
                        setAddGameTitle(executableTitleFromPath(nextPath));
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="flex h-11 items-center justify-center gap-2 border-4 border-black bg-[#e8c843] px-4 text-[12px] font-black uppercase shadow-[3px_3px_0_#171411]"
                    onClick={handleSelectGameExecutable}
                  >
                    <FileSearch className="h-4 w-4" />
                    Manual Path
                  </button>
                </div>
              </label>

              {addGameError ? (
                <p className="neo-copy border-2 border-black bg-[#f5d6d9] px-3 py-2 text-[11px] font-black uppercase text-[#77101f]">
                  {addGameError}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2 border-t-2 border-black pt-3">
                <button
                  type="button"
                  className="border-2 border-black bg-[#efe3cf] px-4 py-2 text-[12px] font-black uppercase"
                  onClick={() => setIsAddGameOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingGame}
                  className="border-2 border-black bg-[#169b83] px-4 py-2 text-[12px] font-black uppercase text-white shadow-[3px_3px_0_#171411] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isAddingGame ? "Adding..." : "Save Game"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {providerPicker ? (
        <div className="fixed inset-0 z-[85] grid place-items-center bg-black/50 px-4">
          <div className="w-full max-w-[560px] border-4 border-black bg-[#fbf4e7] shadow-[8px_8px_0_#171411]">
            <div className="flex items-center justify-between gap-3 border-b-4 border-black bg-[#b7102a] px-4 py-3 text-white">
              <div className="min-w-0">
                <p className="neo-copy text-[10px] font-black uppercase tracking-[0.14em]">
                  {providerPicker.mode === "play" ? "Choose launch platform" : "Choose install platform"}
                </p>
                <h2 className="neo-title truncate text-2xl uppercase leading-none">
                  {providerPicker.title}
                </h2>
              </div>
              <button
                type="button"
                className="grid h-8 w-8 shrink-0 place-items-center border-2 border-black bg-[#fbf4e7] text-[#171411] shadow-[2px_2px_0_#171411]"
                onClick={() => setProviderPicker(null)}
                aria-label="Close provider picker"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2 p-4">
              {providerPicker.variants.map((variant) => {
                const source = getGameSource(variant);
                const isPlayMode = providerPicker.mode === "play";
                const ActionIcon = isPlayMode ? Play : Download;

                return (
                  <button
                    key={variant.id}
                    type="button"
                    className="grid w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 border-4 border-black bg-[#f4ead8] p-3 text-left shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#efe3cf]"
                    onClick={() => {
                      setProviderPicker(null);
                      void handlePlayVariant(variant);
                    }}
                  >
                    <span className="grid h-9 w-9 place-items-center border-2 border-black bg-[#fbf4e7]">
                      <PlatformSourceIcon game={variant} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-black uppercase leading-tight">
                        {source}
                      </span>
                      <span className="neo-copy mt-1 flex flex-wrap gap-2 text-[10px] font-bold uppercase text-[#55504a]">
                        <span>{variant.status.replace("_", " ")}</span>
                        <span>{formatPlayTime(variant.playtimeMinutes)}</span>
                      </span>
                    </span>
                    <span className={`flex h-10 items-center gap-2 border-2 border-black px-3 text-[11px] font-black uppercase shadow-[2px_2px_0_#171411] ${
                      isPlayMode ? "bg-[#169b83] text-white" : "bg-[#b7102a] text-white"
                    }`}>
                      <ActionIcon className="h-4 w-4" />
                      {isPlayMode ? "Play" : "Install"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <footer className="flex h-10 items-center justify-between border-t-4 border-black bg-[#f4ead8] px-4 text-[14px] font-black">
        <button
          type="button"
          onClick={() => {
            setAddGameError(null);
            setIsAddGameOpen(true);
          }}
        >
          + Add a Game
        </button>
        <span className="hidden sm:inline">
          Downloads - {completedDownloadCount} of {downloadCount} items Complete
        </span>
        <button type="button">Friends & Chat +</button>
      </footer>
    </div>
  );
}
