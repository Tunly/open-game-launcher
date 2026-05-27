import {
  Award,
  ChevronDown,
  Download,
  CircleHelp,
  Clock3,
  Cloud,
  FileSearch,
  Gamepad2,
  Grid2X2,
  Heart,
  Laptop,
  Monitor,
  Play,
  Search,
  Settings,
  SlidersHorizontal,
  TerminalSquare,
  Trash2,
  Sparkles,
  X,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import type { PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react";
import { LibrarySidebar } from "../components/library/LibrarySidebar";
import { GameDetails } from "../components/library/GameDetails";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getGameAssetUrl, getGameBannerStyle } from "../lib/assets";
import { addManualGame, launchGame, listInstalledGames, refreshInstalledGames, startDownload, fetchSteamOwnedGames, fetchGogOwnedGames, fetchEpicOwnedGames, normalizeSteamOwnedGames, openSteamScraperWindow, moveGame, syncGameAchievements } from "../lib/launcher";
import type { OwnedGame } from "../lib/launcher";
import type { Game } from "../lib/types";

const STARTUP_LIBRARY_RESCAN_KEY = "launcher_startup_library_rescan_done";
const LIBRARY_SNAPSHOT_KEY = "launcher_library_snapshot";
const LIBRARY_FILTER_STATE_KEY = "launcher_library_filter_state";
const STEAM_OWNED_GAMES_CACHE_KEY = "launcher.steamOwnedGamesCache";
const STEAM_OWNED_GAMES_CACHE_VERSION_KEY = "launcher.steamOwnedGamesCacheVersion";
const STEAM_OWNED_GAMES_CACHE_VERSION = "3";

export type LibrarySortOption = "alphabetical" | "last_played" | "playtime" | "size";

function triggerSilentSteamScraper(steamId: string) {
  console.log("[OG-Launcher] Opening silent Steam scraper window in background...");
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
    const saved = localStorage.getItem(LIBRARY_SNAPSHOT_KEY);
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
    localStorage.setItem(LIBRARY_SNAPSHOT_KEY, JSON.stringify(games));
  } catch {
    // The native cache is authoritative; this snapshot only prevents UI flicker.
  }
}

function readLocalStorageString(key: string) {
  try {
    const value = localStorage.getItem(key);
    if (!value) {
      return "";
    }

    const parsed = JSON.parse(value);
    return typeof parsed === "string" ? parsed.trim() : "";
  } catch {
    return localStorage.getItem(key)?.trim().replace(/^"|"$/g, "") ?? "";
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
  // If we already have real metadata from backend, let's preserve it!
  if (game.genres && game.genres.length > 0) {
    return {
      ...game,
      sizeGb: game.sizeGb || Number(((game.title.length * 7 % 115) + 0.5).toFixed(1)),
      players: game.players || ["Singleplayer"],
      productCategory: game.productCategory || "game",
      steamDeckCompatibility: game.steamDeckCompatibility || "playable",
      protonCompatible: game.protonCompatible !== undefined ? game.protonCompatible : true
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

// Helper to check size matching
function matchSize(gameSizeGb: number, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  const sizeRegex = /(?:size\s*)?([><=])\s*(\d+(?:\.\d+)?)\s*(kb|mb|gb|tb)?/i;
  const match = trimmed.match(sizeRegex);
  if (!match) return true;

  const operator = match[1];
  const rawVal = parseFloat(match[2]);
  const unit = match[3] || "gb";

  let valInGb = rawVal;
  if (unit === "kb") valInGb = rawVal / (1024 * 1024);
  else if (unit === "mb") valInGb = rawVal / 1024;
  else if (unit === "tb") valInGb = rawVal * 1024;

  if (operator === ">") return gameSizeGb > valInGb;
  if (operator === "<") return gameSizeGb < valInGb;
  if (operator === "=") return Math.abs(gameSizeGb - valInGb) < 0.05;

  return true;
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
  categories: [] as string[],
  sizeQuery: "",
  productCategories: ["game", "software", "video", "dlc", "soundtrack", "demo", "beta"] as string[],
};

type AdvancedFilters = typeof initialAdvancedFilters;

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
    categories: normalizeStringArray(stored.categories),
    sizeQuery: typeof stored.sizeQuery === "string" ? stored.sizeQuery : "",
    productCategories: normalizeStringArray(stored.productCategories).length > 0
      ? normalizeStringArray(stored.productCategories)
      : initialAdvancedFilters.productCategories,
  };
}

function readPersistedLibraryFilterState(): PersistedLibraryFilterState {
  try {
    const saved = localStorage.getItem(LIBRARY_FILTER_STATE_KEY);
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

function executableTitleFromPath(path: string) {
  const fileName = path.split(/[\\/]/).pop() ?? path;
  return fileName.replace(/\.exe$/i, "").replace(/[_-]+/g, " ").trim() || fileName;
}

export function getGameLogoCandidates(game: Game) {
  return [game.logoUrl, ...(game.logoUrls ?? [])].filter(
    (logoUrl, index, logoUrls): logoUrl is string =>
      Boolean(logoUrl) && logoUrls.indexOf(logoUrl) === index,
  );
}

function getGameIconCandidates(game: Game) {
  return [
    game.iconUrl,
    ...(game.iconUrls ?? []),
    game.logoUrl,
    ...(game.logoUrls ?? []),
    game.coverUrl,
  ].filter(
    (iconUrl, index, iconUrls): iconUrl is string =>
      Boolean(iconUrl) && iconUrls.indexOf(iconUrl) === index,
  );
}

export function getLogoPositionClass(game: Game) {
  switch (game.logoPosition) {
    case "upperCenter":
      return "left-1/2 top-[9%] max-h-[42%] w-[min(44%,420px)] -translate-x-1/2";
    case "centerCenter":
      return "left-1/2 top-1/2 max-h-[46%] w-[min(46%,440px)] -translate-x-1/2 -translate-y-1/2";
    case "bottomCenter":
      return "bottom-[13%] left-1/2 max-h-[42%] w-[min(44%,420px)] -translate-x-1/2";
    case "bottomLeft":
    default:
      return "bottom-[12%] left-[5%] max-h-[42%] w-[min(38%,360px)]";
  }
}

export function getLogoPlacementStyle(game: Game) {
  return {
    width: game.logoWidthPercent
      ? `${Math.min(Math.max(game.logoWidthPercent, 18), 52)}%`
      : undefined,
    maxHeight: game.logoHeightPercent
      ? `${Math.min(Math.max(game.logoHeightPercent, 24), 46)}%`
      : undefined,
  };
}

function formatLastPlayed(lastPlayed?: string | null) {
  if (!lastPlayed) {
    return "Not played";
  }

  const date = new Date(lastPlayed);
  if (Number.isNaN(date.getTime())) {
    return lastPlayed;
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatPlayTime(playtimeMinutes?: number) {
  if (!playtimeMinutes || playtimeMinutes <= 0) {
    return "0 hours";
  }

  const hours = playtimeMinutes / 60;
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} hours`;
}


export function getGameSource(game: Game) {
  const id = game.id.toLowerCase();
  const description = game.description.toLowerCase();

  if (id.startsWith("epic-") || description.includes("epic")) return "epic";
  if (id.startsWith("gog-") || description.includes("gog")) return "gog";
  if (id.startsWith("ubisoft-") || description.includes("ubisoft")) return "ubisoft";
  if (id.startsWith("xbox-") || description.includes("xbox")) return "xbox";
  if (id.startsWith("steam-") || description.includes("steam")) return "steam";
  if (id.startsWith("battlenet-") || description.includes("battle.net")) return "battlenet";
  if (id.startsWith("ea-") || description.includes("ea app") || description.includes("origin")) return "ea";

  return game.platform;
}

export function getFallbackBannerClass(game: Game) {
  if (game.coverUrl) {
    return "";
  }

  return `library-source-art library-source-art-${getGameSource(game)}`;
}

function PlatformIcon({ platform, className = "h-4 w-4" }: { platform: string; className?: string }) {
  if (platform === "windows") return <Monitor className={className} />;
  if (platform === "macos") return <Laptop className={className} />;
  if (platform === "linux") return <TerminalSquare className={className} />;
  return <Gamepad2 className={className} />;
}

function LibraryRow({
  game,
  selected,
  onSelect,
  isFavorite,
}: {
  game: Game;
  selected?: boolean;
  onSelect: (game: Game) => void;
  isFavorite?: boolean;
}) {
  const [iconCandidateIndex, setIconCandidateIndex] = useState(0);
  const iconCandidates = getGameIconCandidates(game);
  const iconUrl = getGameAssetUrl(iconCandidates[iconCandidateIndex]);

  useEffect(() => {
    setIconCandidateIndex(0);
  }, [game.id, game.iconUrl, game.iconUrls]);

  return (
    <button
      className={`flex min-h-[52px] w-full min-w-0 items-center gap-2 border-2 px-3 py-2 text-left transition ${
        selected
          ? "border-black bg-[#139a82] text-[#fffaf0]"
          : "border-transparent text-[#171411] hover:bg-[#dfd4c1]"
      }`}
      type="button"
      onClick={() => onSelect(game)}
    >
      <span
        className={`grid h-[22px] w-[22px] shrink-0 place-items-center overflow-hidden border border-black text-[10px] leading-none ${
          selected ? "bg-[#e8c843] text-[#171411]" : "bg-[#d8cbb7]"
        }`}
      >
        {iconUrl ? (
          <img
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            src={iconUrl}
            onError={() =>
              setIconCandidateIndex((currentIndex) =>
                currentIndex + 1 >= iconCandidates.length
                  ? iconCandidates.length
                  : currentIndex + 1,
              )
            }
          />
        ) : (
          <PlatformIcon platform={game.platform} className="h-3.5 w-3.5" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-black leading-none">
          {game.title}
        </span>
      </span>

      {isFavorite && (
        <Heart className="h-3 w-3 fill-[#b7102a] text-[#b7102a] shrink-0" />
      )}
    </button>
  );
}

type LibraryScrollbarState = {
  height: number;
  top: number;
  visible: boolean;
};

function useLibraryScrollbar(targetRef: RefObject<HTMLElement>) {
  const [scrollbarState, setScrollbarState] = useState<LibraryScrollbarState>({
    height: 0,
    top: 0,
    visible: false,
  });

  const updateScrollbar = useCallback(() => {
    const target = targetRef.current;

    if (!target) {
      setScrollbarState((current) =>
        current.visible ? { height: 0, top: 0, visible: false } : current,
      );
      return;
    }

    const maxScrollTop = target.scrollHeight - target.clientHeight;
    const visible = maxScrollTop > 1;

    if (!visible) {
      setScrollbarState((current) =>
        current.visible ? { height: 0, top: 0, visible: false } : current,
      );
      return;
    }

    const trackHeight = target.clientHeight;
    const thumbHeight = Math.max(28, Math.round((target.clientHeight / target.scrollHeight) * trackHeight));
    const maxThumbTop = Math.max(1, trackHeight - thumbHeight);
    const thumbTop = Math.round((target.scrollTop / maxScrollTop) * maxThumbTop);

    setScrollbarState((current) => {
      if (
        current.visible === visible &&
        current.height === thumbHeight &&
        current.top === thumbTop
      ) {
        return current;
      }

      return {
        height: thumbHeight,
        top: thumbTop,
        visible,
      };
    });
  }, [targetRef]);

  useEffect(() => {
    const target = targetRef.current;

    if (!target) {
      return;
    }

    updateScrollbar();
    target.addEventListener("scroll", updateScrollbar, { passive: true });

    const resizeObserver = new ResizeObserver(updateScrollbar);
    resizeObserver.observe(target);

    const mutationObserver = new MutationObserver(updateScrollbar);
    mutationObserver.observe(target, { childList: true, subtree: true });

    window.addEventListener("resize", updateScrollbar);
    const animationFrame = window.requestAnimationFrame(updateScrollbar);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateScrollbar);
      target.removeEventListener("scroll", updateScrollbar);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [targetRef, updateScrollbar]);

  return {
    scrollbarState,
    updateScrollbar,
  };
}

function LibraryCustomScrollbar({ targetRef }: { targetRef: RefObject<HTMLElement> }) {
  const { scrollbarState, updateScrollbar } = useLibraryScrollbar(targetRef);

  const scrollToThumbPosition = useCallback(
    (track: HTMLDivElement, clientY: number, thumbOffset: number) => {
      const target = targetRef.current;

      if (!target || !scrollbarState.visible) {
        return;
      }

      const trackRect = track.getBoundingClientRect();
      const maxScrollTop = target.scrollHeight - target.clientHeight;
      const maxThumbTop = Math.max(1, trackRect.height - scrollbarState.height);
      const nextThumbTop = Math.min(
        maxThumbTop,
        Math.max(0, clientY - trackRect.top - thumbOffset),
      );

      target.scrollTop = (nextThumbTop / maxThumbTop) * maxScrollTop;
      updateScrollbar();
    },
    [scrollbarState.height, scrollbarState.visible, targetRef, updateScrollbar],
  );

  if (!scrollbarState.visible) {
    return null;
  }

  return (
    <div
      className="library-custom-scrollbar"
      aria-hidden="true"
      onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) {
          return;
        }

        scrollToThumbPosition(event.currentTarget, event.clientY, scrollbarState.height / 2);
      }}
    >
      <div
        className="library-custom-scrollbar-thumb"
        style={{
          height: `${scrollbarState.height}px`,
          transform: `translateY(${scrollbarState.top}px)`,
        }}
        onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
          event.preventDefault();
          event.stopPropagation();

          const thumb = event.currentTarget;
          const track = thumb.parentElement;

          if (!(track instanceof HTMLDivElement)) {
            return;
          }

          const thumbOffset = event.clientY - thumb.getBoundingClientRect().top;
          thumb.setPointerCapture(event.pointerId);

          const handlePointerMove = (moveEvent: PointerEvent) => {
            scrollToThumbPosition(track, moveEvent.clientY, thumbOffset);
          };

          const handlePointerUp = (upEvent: PointerEvent) => {
            thumb.releasePointerCapture(upEvent.pointerId);
            document.removeEventListener("pointermove", handlePointerMove);
            document.removeEventListener("pointerup", handlePointerUp);
          };

          document.addEventListener("pointermove", handlePointerMove);
          document.addEventListener("pointerup", handlePointerUp, { once: true });
        }}
      />
    </div>
  );
}

function Metric({
  icon,
  title,
  value,
}: {
  icon: ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="grid min-h-[64px] min-w-0 grid-cols-[28px_minmax(0,1fr)] items-center gap-2 border-4 border-black bg-[#fbf4e7] px-3 py-2 shadow-[3px_3px_0_#171411]">
      <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden">{icon}</span>
      <div className="min-w-0 overflow-hidden">
        <div className="text-[11px] font-black uppercase leading-[0.95] sm:text-[12px]">
          {title}
        </div>
        <div className="neo-copy mt-1 truncate text-[11px] font-bold leading-none sm:text-[12px]">
          {value}
        </div>
      </div>
    </div>
  );
}

export function LibraryPage() {
  const gameListScrollRef = useRef<HTMLDivElement>(null);
  const detailScrollRef = useRef<HTMLElement>(null);
  const automaticSyncInFlightRef = useRef(false);
  const autoAchievementSyncAttemptedRef = useRef<Set<string>>(new Set());
  const lastFocusSyncAtRef = useRef(0);
  const [initialLibrarySnapshot] = useState(readLibrarySnapshot);
  const [installedGames, setInstalledGames] = useState<Game[]>(initialLibrarySnapshot);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
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
      const saved = localStorage.getItem("launcher_favorites");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [hiddenGames, setHiddenGames] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("launcher_hidden");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [customCategories, setCustomCategories] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem("launcher_custom_categories");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem("launcher_favorites", JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem("launcher_hidden", JSON.stringify(hiddenGames));
  }, [hiddenGames]);

  useEffect(() => {
    localStorage.setItem("launcher_custom_categories", JSON.stringify(customCategories));
  }, [customCategories]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      localStorage.setItem(
        LIBRARY_FILTER_STATE_KEY,
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
      const saved = localStorage.getItem("launcher_dynamic_collections");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("launcher_dynamic_collections", JSON.stringify(dynamicCollections));
  }, [dynamicCollections]);

  const [newCollectionName, setNewCollectionName] = useState("");
  const [selectedCollectionName, setSelectedCollectionName] = useState<string | null>(null);

  // ----------------------------------------------------
  // MANUAL COLLECTIONS STATES (localStorage)
  // ----------------------------------------------------
  const [manualCollections, setManualCollections] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem("launcher_manual_collections");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem("launcher_manual_collections", JSON.stringify(manualCollections));
  }, [manualCollections]);

  const [selectedManualCollectionName, setSelectedManualCollectionName] = useState<string | null>(null);

  function saveCurrentFilterAsCollection(name: string) {
    if (!name.trim()) return;
    const newCol: DynamicCollection = {
      name: name.trim(),
      filters: advancedFilters,
      platformFilter: activePlatformFilter,
      searchQuery: searchQuery
    };
    setDynamicCollections(prev => {
      const filtered = prev.filter(c => c.name.toLowerCase() !== name.trim().toLowerCase());
      return [...filtered, newCol];
    });
    setNewCollectionName("");
    setSelectedCollectionName(name.trim());
  }

  function applyCollection(collection: DynamicCollection) {
    setAdvancedFilters(collection.filters);
    setActivePlatformFilter(collection.platformFilter);
    setSearchQuery(collection.searchQuery);
    setSelectedCollectionName(collection.name);
  }

  function clearActiveCollection() {
    setSelectedCollectionName(null);
    setAdvancedFilters(initialAdvancedFilters);
    setActivePlatformFilter("all");
    setSearchQuery("");
  }

  function deleteCollection(name: string, event: React.MouseEvent) {
    event.stopPropagation();
    setDynamicCollections(prev => prev.filter(c => c.name !== name));
    if (selectedCollectionName === name) {
      setSelectedCollectionName(null);
    }
  }

  // ----------------------------------------------------
  // QUERY FILTER ENGINE (USEMEMO)
  // ----------------------------------------------------
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const shouldShowLibraryLoading = isDiscoveringGames && installedGames.length === 0;

  // Parse size querying from the main search bar
  const sizeRegexInSearch = /(?:size\s*)?([><=])\s*(\d+(?:\.\d+)?)\s*(kb|mb|gb|tb)?/i;
  const sizeMatch = searchQuery.match(sizeRegexInSearch);
  let parsedSearchText = searchQuery;
  let activeSizeQueryFromSearch = "";
  if (sizeMatch) {
    activeSizeQueryFromSearch = sizeMatch[0];
    parsedSearchText = searchQuery.replace(sizeRegexInSearch, "").trim();
  }

  const filteredGames = useMemo(() => {
    // Fallback to mock data if scanning returns empty
    const baseGames = installedGames.length > 0 ? installedGames : fallbackMockGames;
    const enriched = baseGames.map(enrichGameWithMetadata);

    const filtered = enriched.filter((game) => {
      // Hidden games logic: Hide by default unless "Hidden" filter is active
      const isHidden = hiddenGames[game.id] === true;
      const isHiddenFilterActive = advancedFilters.status.includes("Hidden");
      if (isHidden && !isHiddenFilterActive) {
        return false;
      }
      if (!isHidden && isHiddenFilterActive && advancedFilters.status.length === 1) {
        return false;
      }

      // Quick Platform filter (sidebar)
      if (activePlatformFilter !== "all") {
        if (activePlatformFilter === "windows" && game.platform !== "windows") {
          return false;
        }
        if (activePlatformFilter === "macos" && game.platform !== "macos") {
          return false;
        }
        if (activePlatformFilter === "linux") {
          // Native linux or Windows game via Proton
          const isLinuxNative = game.platform === "linux";
          const isProton = game.platform === "windows" && game.protonCompatible === true;
          if (!isLinuxNative && !isProton) {
            return false;
          }
        }
      }

      // Title Search
      if (parsedSearchText) {
        const norm = parsedSearchText.toLowerCase();
        if (!game.title.toLowerCase().includes(norm)) {
          return false;
        }
      }

      // Size querying (Popup or Search input)
      const sizeQ = advancedFilters.sizeQuery || activeSizeQueryFromSearch;
      if (sizeQ) {
        if (!matchSize(game.sizeGb || 0, sizeQ)) {
          return false;
        }
      }

      // Advanced Platform Filter
      if (advancedFilters.platforms.length > 0) {
        const matchesPlatform = advancedFilters.platforms.some((plat) => {
          const lowerPlat = plat.toLowerCase();
          if (lowerPlat.includes("win")) return game.platform === "windows";
          if (lowerPlat.includes("mac")) return game.platform === "macos";
          if (lowerPlat.includes("lin")) {
            return game.platform === "linux" || (game.platform === "windows" && game.protonCompatible === true);
          }
          return false;
        });
        if (!matchesPlatform) return false;
      }

      // Players Filter
      if (advancedFilters.players.length > 0) {
        const gamePlayers = game.players || [];
        const matchesPlayers = advancedFilters.players.some((p) => {
          const normP = p.toLowerCase().replace(/[^a-z0-9]/g, "_");
          return gamePlayers.some(gp => gp.toLowerCase().replace(/[^a-z0-9]/g, "_") === normP);
        });
        if (!matchesPlayers) return false;
      }

      // Features Filter
      if (advancedFilters.features.length > 0) {
        const gameFeatures = game.features || [];
        const matchesFeatures = advancedFilters.features.some((f) => {
          const normF = f.toLowerCase().replace(/[^a-z0-9]/g, "_");

          if (normF.includes("achieve")) return gameFeatures.includes("Steam Achievements");
          if (normF.includes("controller")) return gameFeatures.includes("Full Controller Support");
          if (normF.includes("card")) return gameFeatures.includes("Steam Trading Cards");
          if (normF.includes("workshop")) return gameFeatures.includes("Steam Workshop");
          if (normF.includes("cloud")) return gameFeatures.includes("Steam Cloud");
          if (normF.includes("stats")) return gameFeatures.includes("Stats");
          if (normF.includes("leader")) return gameFeatures.includes("Leaderboards");
          if (normF.includes("purchase")) return gameFeatures.includes("In-App Purchases");
          if (normF.includes("vr")) return gameFeatures.includes("VR Supported");
          if (normF.includes("comment")) return gameFeatures.includes("Comments available") || game.description.includes("comment") || game.id.includes("starfall");

          return gameFeatures.some(gf => gf.toLowerCase().replace(/[^a-z0-9]/g, "_") === normF);
        });
        if (!matchesFeatures) return false;
      }

      // Hardware Compatibility
      if (advancedFilters.hardware.length > 0) {
        const matchesHardware = advancedFilters.hardware.some((hw) => {
          const normHw = hw.toLowerCase();
          if (normHw.includes("verified")) return game.steamDeckCompatibility === "verified";
          if (normHw.includes("playable")) return game.steamDeckCompatibility === "playable";
          if (normHw.includes("controller")) return (game.features || []).includes("Full Controller Support");
          if (normHw.includes("vr")) return (game.features || []).includes("VR Supported");
          return false;
        });
        if (!matchesHardware) return false;
      }

      // Sizenre
      if (advancedFilters.genres.length > 0) {
        const gameSizenres = game.genres || [];
        const matchesSizenres = advancedFilters.genres.some((g) => {
          const normG = g.toLowerCase().replace(/[^a-z0-9]/g, "_");
          return gameSizenres.some(gg => gg.toLowerCase().replace(/[^a-z0-9]/g, "_") === normG);
        });
        if (!matchesSizenres) return false;
      }

      // Custom Categories Filter
      if (advancedFilters.categories.length > 0) {
        const gameCats = customCategories[game.id] || [];
        const matchesCats = advancedFilters.categories.some((cat) => gameCats.includes(cat));
        if (!matchesCats) return false;
      }

      // Product Categories Filter
      if (advancedFilters.productCategories.length > 0) {
        const cat = game.productCategory || "game";
        if (!advancedFilters.productCategories.includes(cat)) {
          return false;
        }
      }

      // Play Status Filter
      if (advancedFilters.status.length > 0) {
        const matchesStatus = advancedFilters.status.some((stat) => {
          const normStat = stat.toLowerCase();
          if (normStat === "installed") return game.status === "installed";
          if (normStat === "uninstalled") return game.status !== "installed";
          if (normStat === "played") return (game.playtimeMinutes || 0) > 0;
          if (normStat === "never played") return (game.playtimeMinutes || 0) === 0;
          if (normStat === "favorites") return favorites[game.id] === true;
          if (normStat === "hidden") return hiddenGames[game.id] === true;
          return false;
        });
        if (!matchesStatus) return false;
      }

      // Manual Collections Filter
      if (selectedManualCollectionName) {
        const gameIdsInCollection = manualCollections[selectedManualCollectionName] || [];
        if (!gameIdsInCollection.includes(game.id)) {
          return false;
        }
      }

      return true;
    });

    // Sorting
    switch (sortOption) {
      case "alphabetical":
        filtered.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "last_played":
        filtered.sort((a, b) => {
          const aTime = a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : Number.NEGATIVE_INFINITY;
          const bTime = b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : Number.NEGATIVE_INFINITY;
          return bTime - aTime;
        });
        break;
      case "playtime":
        filtered.sort((a, b) => (b.playtimeMinutes || 0) - (a.playtimeMinutes || 0));
        break;
      case "size":
        filtered.sort((a, b) => (b.sizeGb || 0) - (a.sizeGb || 0));
        break;
    }

    return filtered;
  }, [
    installedGames,
    activePlatformFilter,
    advancedFilters,
    favorites,
    hiddenGames,
    customCategories,
    activeSizeQueryFromSearch,
    parsedSearchText,
    selectedManualCollectionName,
    manualCollections,
    sortOption,
  ]);

  /** Convert backend OwnedGame into a frontend Game object */
  function ownedGameToGame(og: OwnedGame): Game {
    return {
      id: og.id,
      title: og.title,
      description: og.description,
      version: "1.0",
      coverUrl: og.coverUrl ?? undefined,
      logoUrl: og.logoUrl ?? undefined,
      iconUrl: og.iconUrl ?? undefined,
      iconUrls: [],
      logoUrls: [],
      logoPosition: "centerCenter",
      status: "not_installed",
      platform: "windows",
      playtimeMinutes: og.playtimeMinutes,
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
      let games = forceRefresh
        ? await refreshInstalledGames()
        : await listInstalledGames();

      const steamId = localStorage.getItem("launcher.steamId")?.replace(/"/g, "") || "";
      console.log("[OG-Launcher] Steam ID from localStorage:", JSON.stringify(steamId), "length:", steamId.length);

      if (steamId) {
        try {
          let ownedRaw: OwnedGame[] = [];

          // Load owned games from the local WebView scraper cache
          const cacheStr = localStorage.getItem(STEAM_OWNED_GAMES_CACHE_KEY);
          const cacheVersion = localStorage.getItem(STEAM_OWNED_GAMES_CACHE_VERSION_KEY);
          if (!forceRefresh && cacheVersion === STEAM_OWNED_GAMES_CACHE_VERSION && cacheStr) {
            try {
              ownedRaw = normalizeSteamOwnedGames(JSON.parse(cacheStr));
              console.log("[OG-Launcher] Loaded Steam owned games from cache:", ownedRaw.length, "games");
            } catch (err) {
              console.warn("Failed to parse steamOwnedGamesCache:", err);
            }
          }

          if (ownedRaw.length === 0) {
            ownedRaw = normalizeSteamOwnedGames(await fetchSteamOwnedGames(steamId));
            if (ownedRaw.length > 0) {
              localStorage.setItem(STEAM_OWNED_GAMES_CACHE_KEY, JSON.stringify(ownedRaw));
              localStorage.setItem(STEAM_OWNED_GAMES_CACHE_VERSION_KEY, STEAM_OWNED_GAMES_CACHE_VERSION);
            }
          }

          // Trigger a silent scrape in the background using WebView cookies to update the cache
          triggerSilentSteamScraper(steamId);

          if (ownedRaw.length > 0) {
            const ownedGames = ownedRaw.map(ownedGameToGame);
            const installedSteamAppIds = new Set<string>();
            games.forEach((g) => {
              if (g.launchUri?.startsWith("steam://rungameid/")) {
                const appid = g.launchUri.replace("steam://rungameid/", "");
                installedSteamAppIds.add(appid);
              }
            });

            const installedTitles = new Set(games.map(g => g.title.toLowerCase().trim()));

            const uninstalledOwnedGames = ownedGames.filter((og) => {
              const appid = og.id.replace("steam-owned-", "");
              return !installedSteamAppIds.has(appid) && !installedTitles.has(og.title.toLowerCase().trim());
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

      // 1. Fetch and merge GOG owned games
      const gogTokenStr = localStorage.getItem("launcher.gogToken");
      if (gogTokenStr) {
        try {
          const tokenObj = JSON.parse(gogTokenStr);
          if (tokenObj && tokenObj.accessToken) {
            const ownedRaw = await fetchGogOwnedGames(tokenObj.accessToken);
            const ownedGogGames = ownedRaw.map(ownedGameToGame);
            if (ownedGogGames.length > 0) {
              const installedGogIds = new Set<string>();
              games.forEach((g) => {
                if (g.id.startsWith("gog-")) {
                  installedGogIds.add(g.id.replace("gog-", ""));
                }
              });

              const installedTitles = new Set(games.map(g => g.title.toLowerCase().trim()));

              const uninstalledOwnedGogGames = ownedGogGames.filter((og) => {
                const gogId = og.id.replace("gog-owned-", "");
                return !installedGogIds.has(gogId) && !installedTitles.has(og.title.toLowerCase().trim());
              });

              games = [...games, ...uninstalledOwnedGogGames];
            }
          }
        } catch (err) {
          console.warn("Failed to fetch owned GOG games during load:", err);
        }
      }

      // 2. Fetch and merge Epic owned games
      const epicTokenStr = localStorage.getItem("launcher.epicToken");
      if (epicTokenStr) {
        try {
          const tokenObj = JSON.parse(epicTokenStr);
          if (tokenObj && tokenObj.accessToken && tokenObj.accountId) {
            const ownedRaw = await fetchEpicOwnedGames(tokenObj.accessToken, tokenObj.accountId);
            const ownedEpicGames = ownedRaw.map(ownedGameToGame);
            if (ownedEpicGames.length > 0) {
              const installedEpicIds = new Set<string>();
              games.forEach((g) => {
                if (g.id.startsWith("epic-")) {
                  installedEpicIds.add(g.id.replace("epic-", ""));
                }
              });

              const installedTitles = new Set(games.map(g => g.title.toLowerCase().trim()));

              const uninstalledOwnedEpicGames = ownedEpicGames.filter((og) => {
                const epicParts = og.id.replace("epic-owned-", "").split(":");
                const catalogItemId = epicParts[1] || "";
                const appName = epicParts[2] || "";

                return !installedEpicIds.has(catalogItemId) &&
                       !installedEpicIds.has(appName) &&
                       !installedTitles.has(og.title.toLowerCase().trim());
              });

              games = [...games, ...uninstalledOwnedEpicGames];
            }
          }
        } catch (err) {
          console.warn("Failed to fetch owned Epic games during load:", err);
        }
      }

      if (!shouldApplyResult()) {
        return;
      }

      setInstalledGames((current) =>
        areGameListsEqual(current, games) ? current : games,
      );
      setDiscoveryMessage(
        games.length > 0
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
      if (sessionStorage.getItem(STARTUP_LIBRARY_RESCAN_KEY) === "true") {
        return false;
      }

      sessionStorage.setItem(STARTUP_LIBRARY_RESCAN_KEY, "true");
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
      await loadInstalledGames(
        false,
        () => isMounted,
        initialLibrarySnapshot.length === 0,
      );

      if (isMounted && shouldRunStartupLibraryRescan()) {
        await loadInstalledGames(true, () => isMounted, false);
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
        setSelectedGame((current) => (current ? applyUpdate(current) : current));
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

    const unlistenInventory = listen<LibraryInventoryChanged>("library_inventory_changed", (event) => {
      if (!isMounted) return;
      console.log("[OG-Launcher] Library inventory changed:", event.payload);
      void runAutomaticLibrarySync(false);
    });

    const unlistenSteam = listen<string>("steam_login_success", () => {
      if (!isMounted) return;
      console.log("[OG-Launcher] Steam connected - reloading library...");
      void runAutomaticLibrarySync(false);
    });

    const unlistenScrapedSuccess = listen<unknown[]>("steam_scraped_games_success", (event) => {
      if (!isMounted) return;
      const ownedGames = normalizeSteamOwnedGames(event.payload);
      console.log("[OG-Launcher] Scraper successfully fetched games:", ownedGames.length);
      localStorage.setItem(STEAM_OWNED_GAMES_CACHE_KEY, JSON.stringify(ownedGames));
      localStorage.setItem(STEAM_OWNED_GAMES_CACHE_VERSION_KEY, STEAM_OWNED_GAMES_CACHE_VERSION);
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

  // Update selected game if list updates
  useEffect(() => {
    if (filteredGames.length === 0) {
      setSelectedGame(null);
      return;
    }

    if (!selectedGame || !filteredGames.some((game) => game.id === selectedGame.id)) {
      setSelectedGame(filteredGames[0]);
    }
  }, [filteredGames, selectedGame]);

  // Image preloading
  useEffect(() => {
    const listToPreload = installedGames.length > 0 ? installedGames : fallbackMockGames;
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
  }, [installedGames]);

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
    if (!selectedGame || selectedGame.achievements?.length) {
      return;
    }

    if (!getSteamAppId(selectedGame) || !readLocalStorageString("launcher.steamId")) {
      return;
    }

    if (autoAchievementSyncAttemptedRef.current.has(selectedGame.id)) {
      return;
    }

    autoAchievementSyncAttemptedRef.current.add(selectedGame.id);
    void syncAchievementsForGame(selectedGame, { silent: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGame?.id, selectedGame?.achievements?.length]);

  async function handlePlay() {
    if (!selectedGame) {
      return;
    }

    setStatusMessage(null);

    try {
      if (
        selectedGame.id.startsWith("steam-owned-") ||
        selectedGame.id.startsWith("gog-owned-") ||
        selectedGame.id.startsWith("epic-owned-")
      ) {
        const response = await launchGame(selectedGame.id);
        setStatusMessage(response.message);
        return;
      }

      if (selectedGame.status === "installed") {
        const response = await launchGame(selectedGame.id);
        setStatusMessage(response.message);
        return;
      }

      const response = await startDownload(selectedGame.id);
      setStatusMessage(response.message);
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  }

  async function syncAchievementsForGame(game: Game, options: { silent?: boolean } = {}) {
    const hasSteamAppId = Boolean(getSteamAppId(game));
    if (!hasSteamAppId) {
      if (!options.silent) {
        setStatusMessage(`${game.title} does not expose a Steam AppID for achievement sync.`);
      }
      return;
    }

    const steamId = readLocalStorageString("launcher.steamId");
    const steamApiKey = readLocalStorageString("launcher.steamApiKey");
    if (!steamId && !steamApiKey) {
      if (!options.silent) {
        setStatusMessage("Steam achievement sync needs a connected Steam account or a Steam Web API Key in Settings.");
      }
      return;
    }

    if (!options.silent) {
      setStatusMessage(null);
    }
    setSyncingAchievementGameId(game.id);

    try {
      const response = await syncGameAchievements(
        game.id,
        steamId || undefined,
        steamApiKey || undefined,
      );

      setInstalledGames((current) =>
        current.map((game) => (game.id === response.game.id ? response.game : game)),
      );
      setSelectedGame((current) => (current?.id === response.game.id ? response.game : current));
      if (!options.silent) {
        setStatusMessage(response.message);
      }
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
    if (!selectedGame) {
      return;
    }

    await syncAchievementsForGame(selectedGame);
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
      setSelectedGame(game);
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

  // Enrich selectedGame if available
  const enrichedSelectedGame = selectedGame ? enrichGameWithMetadata(selectedGame) : null;

  return (
    <div className="library-steam-shell h-full min-h-0 overflow-hidden border-x-0 border-black bg-[#fbf4e7] text-[#171411] sm:border-x-4">
      <div className="relative grid h-full min-h-0 min-w-0 grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[290px_minmax(0,1fr)]">

        {/* ====================================================
            SIDEBAR PANEL
            ==================================================== */}
        <LibrarySidebar
          games={installedGames}
          filteredGames={filteredGames}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          sortOption={sortOption}
          setSortOption={setSortOption}
          isFilterPopupOpen={isFilterPopupOpen}
          setIsFilterPopupOpen={setIsFilterPopupOpen}
          activePlatformFilter={activePlatformFilter}
          advancedFilters={advancedFilters}
          groupOption={"none"}
          groupedGames={{}}
          selectedGame={selectedGame}
          setSelectedGame={setSelectedGame}
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
            <div className="flex items-center justify-between border-b-4 border-black pb-2 mb-4">
              <h3 className="neo-title text-2xl flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-[#b7102a]" />
                Advanced Filters
              </h3>
              <button
                onClick={() => setIsFilterPopupOpen(false)}
                className="grid h-8 w-8 place-items-center border-2 border-black bg-[#efe3cf] hover:bg-[#d8cbb7]"
                type="button"
                aria-label="Close filters"
              >
                <X className="h-4 w-4" />
              </button>
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

              {/* FEATURES CHECKBOXES */}
              <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#000]">
                <h4 className="font-black uppercase text-[12px] border-b border-black pb-1 mb-2 flex items-center justify-between">
                  <span>Features</span>
                  {advancedFilters.features.length > 0 && (
                    <button onClick={() => setAdvancedFilters(prev => ({ ...prev, features: [] }))} className="text-[10px] underline lowercase">clear</button>
                  )}
                </h4>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    "Steam Achievements", "Full Controller Support", "Steam Trading Cards",
                    "Steam Workshop", "Steam Cloud", "Stats", "Leaderboards",
                    "In-App Purchases", "VR Supported", "Comments available"
                  ].map((f) => {
                    const isChecked = advancedFilters.features.includes(f);
                    return (
                      <label key={f} className="flex items-center gap-1.5 text-[11px] font-bold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setAdvancedFilters(prev => ({
                              ...prev,
                              features: isChecked ? prev.features.filter(x => x !== f) : [...prev.features, f]
                            }));
                          }}
                          className="w-3.5 h-3.5 border-2 border-black accent-[#139a82]"
                        />
                        <span>{f}</span>
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
                  <span>Sizenre</span>
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
          handleSyncAchievements={handleSyncAchievements}
          isSyncingAchievements={syncingAchievementGameId === selectedGame?.id}
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
          setSelectedCollectionName={setSelectedCollectionName}
          detailScrollRef={detailScrollRef}
          isDiscoveringGames={isDiscoveringGames}
          discoveryMessage={discoveryMessage}
          moveGame={moveGame}
          runAutomaticLibrarySync={runAutomaticLibrarySync}
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
        <span className="hidden sm:inline">Downloads - 2 of 2 items Complete</span>
        <button type="button">Friends & Chat +</button>
      </footer>
    </div>
  );
}
