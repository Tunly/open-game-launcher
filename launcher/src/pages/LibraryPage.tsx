import {
  Award,
  ChevronDown,
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
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  TerminalSquare,
  Trash2,
  Sparkles,
  X,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { getGameAssetUrl, getGameBannerStyle } from "../lib/assets";
import { addManualGame, launchGame, listInstalledGames, refreshInstalledGames, startDownload } from "../lib/launcher";
import type { Game } from "../lib/types";

const STARTUP_LIBRARY_RESCAN_KEY = "launcher_startup_library_rescan_done";

type GameActivityUpdate = {
  gameId: string;
  lastPlayed?: string | null;
  playtimeMinutes?: number | null;
};

// ----------------------------------------------------
// FALLBACK MOCK GAMES FOR WEB/BROWSER DEMONSTRATION
// ----------------------------------------------------
const fallbackMockGames: Game[] = [
  {
    id: "steam-Neo-Tokyo Drift",
    title: "Neo-Tokyo Drift",
    description: "Zuletzt gespielt: Heute. Neues Content-Pack...",
    version: "1.8.2",
    status: "installed",
    platform: "windows",
    installPath: "C:/Games/OpenGameLauncher/Starfall Outpost",
    lastPlayed: "Heute",
    playtimeMinutes: 3480,
  },
  {
    id: "steam-Steel Battalion X",
    title: "Steel Battalion X",
    description: "52 Stunden gespielt",
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
    description: "Noch nie gespielt",
    version: "2.1.0",
    status: "update_available",
    platform: "linux",
    playtimeMinutes: 0,
  },
  {
    id: "steam-Akira's Revenge",
    title: "Akira's Revenge",
    description: "Wird heruntergeladen",
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

  // 2. Generic deterministic hashing for any scanned games
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
  const protonCompatible = (hash % 2) === 0;

  return {
    ...game,
    sizeGb,
    players: assignedPlayers,
    features: assignedFeatures,
    genres: assignedGenres,
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function executableTitleFromPath(path: string) {
  const fileName = path.split(/[\\/]/).pop() ?? path;
  return fileName.replace(/\.exe$/i, "").replace(/[_-]+/g, " ").trim() || fileName;
}

function getGameLogoCandidates(game: Game) {
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

function getLogoPositionClass(game: Game) {
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

function getLogoPlacementStyle(game: Game) {
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


function getGameSource(game: Game) {
  const id = game.id.toLowerCase();
  const description = game.description.toLowerCase();

  if (id.startsWith("epic-") || description.includes("epic")) return "epic";
  if (id.startsWith("gog-") || description.includes("gog")) return "gog";
  if (id.startsWith("ubisoft-") || description.includes("ubisoft")) return "ubisoft";
  if (id.startsWith("xbox-") || description.includes("xbox")) return "xbox";
  if (id.startsWith("steam-") || description.includes("steam")) return "steam";

  return game.platform;
}

function getFallbackBannerClass(game: Game) {
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
      className={`flex min-h-[52px] w-full min-w-0 items-center gap-2 px-3 py-2 text-left transition ${
        selected
          ? "border-y-2 border-black bg-[#139a82] text-[#fffaf0]"
          : "text-[#171411] hover:bg-[#dfd4c1]"
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
  const [installedGames, setInstalledGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [isDiscoveringGames, setIsDiscoveringGames] = useState(true);
  const [discoveryMessage, setDiscoveryMessage] = useState<string | null>(null);
  const [logoCandidateIndexes, setLogoCandidateIndexes] = useState<
    Record<string, number>
  >(
    () => ({}),
  );
  const [loadedLogoUrls, setLoadedLogoUrls] = useState<Set<string>>(
    () => new Set(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isAddGameOpen, setIsAddGameOpen] = useState(false);
  const [addGameTitle, setAddGameTitle] = useState("");
  const [addGamePath, setAddGamePath] = useState("");
  const [addGameError, setAddGameError] = useState<string | null>(null);
  const [isAddingGame, setIsAddingGame] = useState(false);

  // ----------------------------------------------------
  // FILTER STATES
  // ----------------------------------------------------
  const [activePlatformFilter, setActivePlatformFilter] = useState<"all" | "windows" | "macos" | "linux">("all");
  const [isFilterPopupOpen, setIsFilterPopupOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState(initialAdvancedFilters);

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

  // Settings popover for selected game
  const [isSettingsPopoverOpen, setIsSettingsPopoverOpen] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState("");

  // Close popovers on game switch
  useEffect(() => {
    setIsSettingsPopoverOpen(false);
    setNewCategoryInput("");
  }, [selectedGame?.id]);

  // ----------------------------------------------------
  // QUERY FILTER ENGINE (USEMEMO)
  // ----------------------------------------------------
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();

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

    return enriched.filter((game) => {
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

      // Genre
      if (advancedFilters.genres.length > 0) {
        const gameGenres = game.genres || [];
        const matchesGenres = advancedFilters.genres.some((g) => {
          const normG = g.toLowerCase().replace(/[^a-z0-9]/g, "_");
          return gameGenres.some(gg => gg.toLowerCase().replace(/[^a-z0-9]/g, "_") === normG);
        });
        if (!matchesGenres) return false;
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

      return true;
    });
  }, [
    installedGames,
    activePlatformFilter,
    advancedFilters,
    favorites,
    hiddenGames,
    customCategories,
    activeSizeQueryFromSearch,
    parsedSearchText,
  ]);

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
      const games = forceRefresh
        ? await refreshInstalledGames()
        : await listInstalledGames();

      if (!shouldApplyResult()) {
        return;
      }

      setInstalledGames(games);
      setDiscoveryMessage(
        games.length > 0
          ? null
          : "Keine installierten Steam-, Epic- oder GOG-Spiele gefunden. Demo-Modus geladen.",
      );
    } catch {
      if (!shouldApplyResult()) {
        return;
      }

      setInstalledGames([]);
      setDiscoveryMessage(
        forceRefresh
          ? "Rescan nicht verfugbar. Zeige Mock-Bibliothek."
          : "Gespeicherte Bibliothek nicht verfugbar. Zeige Mock-Bibliothek.",
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

  // Load cached games first, then rescan once per app session for new installs.
  useEffect(() => {
    let isMounted = true;

    async function loadLibrary() {
      await loadInstalledGames(false, () => isMounted);

      if (isMounted && shouldRunStartupLibraryRescan()) {
        await loadInstalledGames(true, () => isMounted, false);
      }
    }

    void loadLibrary();

    return () => {
      isMounted = false;
    };
  }, []);

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

  async function handlePlay() {
    if (!selectedGame) {
      return;
    }

    setStatusMessage(null);

    try {
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

  async function handleAddManualGame() {
    const title = addGameTitle.trim();
    const installPath = addGamePath.trim();

    if (!title || !installPath) {
      setAddGameError("Titel und EXE werden benotigt.");
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
      setStatusMessage(`${game.title} wurde zur Bibliothek hinzugefugt.`);
    } catch (error) {
      setAddGameError(getErrorMessage(error));
    } finally {
      setIsAddingGame(false);
    }
  }

  function handleSelectGameExecutable() {
    setAddGameError(null);
    setAddGameError("Dateiauswahl ist ohne Dialog-Plugin deaktiviert. Bitte den EXE-Pfad manuell einfugen.");
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
    <div className="library-steam-shell min-h-[calc(100vh-80px)] overflow-x-hidden border-x-0 border-black bg-[#fbf4e7] text-[#171411] sm:border-x-4">
      <div className="relative grid min-h-[calc(100vh-80px)] min-w-0 grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[290px_minmax(0,1fr)]">
        
        {/* ====================================================
            SIDEBAR PANEL
            ==================================================== */}
        <aside className="min-h-0 border-b-4 border-black bg-[#efe3cf] flex flex-col justify-between md:border-b-0 md:border-r-4">
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex h-11 items-center justify-between border-b-4 border-black bg-[#f4ead8]">
              <button className="h-full flex-1 px-3 text-left text-[16px] font-black" type="button">
                Library
              </button>
              <button className="grid h-full w-11 place-items-center border-l-4 border-black" type="button" aria-label="Grid view">
                <Grid2X2 className="h-6 w-6" />
              </button>
            </div>



            {/* Search Input Row */}
            <div className="space-y-2 p-2">
              <label className="flex h-9 items-center gap-2 border-2 border-black bg-[#fbf8ef] px-2.5">
                <Search className="h-4 w-4 text-[#686157]" />
                <input
                  className="neo-copy min-w-0 flex-1 bg-transparent text-[11px] font-black uppercase tracking-[0.08em] text-[#171411] outline-none placeholder:text-[#686157]"
                  aria-label="Search library"
                  placeholder="Search title / size..."
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setIsFilterPopupOpen(!isFilterPopupOpen)}
                  className={`grid h-6 w-6 place-items-center border-2 border-black transition ${
                    isFilterPopupOpen || Object.values(advancedFilters).some(v => Array.isArray(v) ? v.length > 0 : v !== "")
                      ? "bg-[#e8c843]"
                      : "bg-[#d8cbb7] hover:bg-[#cbbcb2]"
                  }`}
                  aria-label="Advanced filters"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </button>
              </label>
            </div>

            {/* Scrollable list of items */}
            <div className="flex-1 overflow-y-auto pb-3">
              
              {/* SAVED DYNAMIC COLLECTIONS */}
              {dynamicCollections.length > 0 ? (
                <div className="px-2 pt-1 border-b-2 border-dashed border-[#ded3c1] pb-2">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase text-[#55504a] tracking-wide mb-1 px-1">
                    <span>Saved Collections</span>
                    {selectedCollectionName && (
                      <button
                        onClick={clearActiveCollection}
                        className="text-[9px] underline hover:text-black font-bold"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {dynamicCollections.map((col) => (
                      <button
                        key={col.name}
                        onClick={() => applyCollection(col)}
                        className={`flex w-full items-center justify-between border-2 border-black px-2 py-1 text-left text-[11px] font-black leading-none transition ${
                          selectedCollectionName === col.name
                            ? "bg-[#e8c843] text-black shadow-[2px_2px_0_#000]"
                            : "bg-[#d8cbb7] text-[#171411] hover:bg-[#dfd4c1]"
                        }`}
                      >
                        <span className="truncate flex items-center gap-1.5">
                          <Sparkles className="h-3 w-3 shrink-0 text-[#b7102a]" />
                          {col.name}
                        </span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[9px] bg-black/15 px-1 border border-black/25">
                            {(() => {
                              const baseList = installedGames.length > 0 ? installedGames : fallbackMockGames;
                              const enriched = baseList.map(enrichGameWithMetadata);
                              return enriched.filter((game) => {
                                if (col.platformFilter !== "all" && game.platform !== col.platformFilter) return false;
                                if (col.filters.productCategories.length > 0 && !col.filters.productCategories.includes(game.productCategory || "game")) return false;
                                if (col.filters.genres.length > 0 && !col.filters.genres.some(g => (game.genres || []).includes(g))) return false;
                                return true;
                              }).length;
                            })()}
                          </span>
                          <Trash2
                            className="h-3 w-3 text-black hover:text-[#b7102a] hover:scale-110 transition"
                            onClick={(e) => deleteCollection(col.name, e)}
                          />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* LIST TITLE */}
              <div className="px-2 pb-1 pt-2 text-[13px] font-black uppercase flex items-center justify-between">
                <span className="min-w-0 truncate">
                  - Installed ({filteredGames.length}
                  {normalizedSearchQuery || activePlatformFilter !== "all" || Object.values(advancedFilters).some(v => Array.isArray(v) ? v.length > 0 : v !== "") ? ` / ${installedGames.length || fallbackMockGames.length}` : ""})
                </span>
                <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => void loadInstalledGames(true)}
                  disabled={isDiscoveringGames}
                  className="grid h-7 w-7 place-items-center border-2 border-black bg-[#f4ead8] text-[#171411] transition hover:bg-[#8cf5e4] disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Bibliothek neu scannen"
                  title="Bibliothek neu scannen"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isDiscoveringGames ? "animate-spin" : ""}`} />
                </button>
                {(searchQuery || activePlatformFilter !== "all" || Object.values(advancedFilters).some(v => Array.isArray(v) ? v.length > 0 : v !== "")) && (
                  <button
                    onClick={clearActiveCollection}
                    className="text-[9px] text-[#b7102a] underline font-bold uppercase"
                  >
                    Reset All
                  </button>
                )}
                </div>
              </div>

              {/* RENDER LIST ROWS */}
              {isDiscoveringGames ? (
                <p className="neo-copy px-3 py-2 text-[11px] font-bold uppercase text-[#55504a]">
                  Bibliothek wird geladen...
                </p>
              ) : filteredGames.length > 0 ? (
                filteredGames.map((game) => (
                  <LibraryRow
                    key={game.id}
                    game={game}
                    selected={selectedGame?.id === game.id}
                    onSelect={setSelectedGame}
                    isFavorite={favorites[game.id] === true}
                  />
                ))
              ) : normalizedSearchQuery && (installedGames.length > 0 || fallbackMockGames.length > 0) ? (
                <p className="neo-copy px-3 py-2 text-[11px] font-bold uppercase leading-5 text-[#55504a]">
                  Keine Spiele fur "{searchQuery.trim()}" gefunden.
                </p>
              ) : (
                <p className="neo-copy px-3 py-2 text-[11px] font-bold uppercase leading-5 text-[#55504a]">
                  {discoveryMessage}
                </p>
              )}
            </div>
          </div>
        </aside>

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

              {/* SPIELERANZAHL CHECKBOXES */}
              <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#000]">
                <h4 className="font-black uppercase text-[12px] border-b border-black pb-1 mb-2 flex items-center justify-between">
                  <span>Spieleranzahl</span>
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
                  <span>Hardware-Kompatibilität</span>
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

              {/* PLAY STATUS CHECKBOXES */}
              <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#000]">
                <h4 className="font-black uppercase text-[12px] border-b border-black pb-1 mb-2 flex items-center justify-between">
                  <span>Spielstatus</span>
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
                  Produktkategorien (Anzeigen/Ausblenden)
                </h4>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { key: "game", label: "Spiele" },
                    { key: "software", label: "Software" },
                    { key: "video", label: "Videos" },
                    { key: "dlc", label: "DLCs" },
                    { key: "soundtrack", label: "Soundtracks" },
                    { key: "demo", label: "Demos" },
                    { key: "beta", label: "Beta-Zugänge" }
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
                  <span>Größe</span>
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
        <main className="min-w-0 overflow-hidden">
          {isDiscoveringGames ? (
            <section className="grid min-h-[calc(100vh-124px)] place-items-center border-b-4 border-black bg-[#efe3cf] px-4 text-center" style={{ fontFamily: '"Arial Narrow", Impact, sans-serif' }}>
              <div className="max-w-[560px] border-4 border-black bg-[#fbf4e7] p-8 shadow-[8px_8px_0_#171411]">
                <Settings className="mx-auto mb-4 h-10 w-10 animate-[spin_4s_linear_infinite] text-[#087d6d]" />
                <h2 className="neo-title text-3xl mb-2 uppercase text-[#171411]">LOADING LIBRARY</h2>
                <div className="neo-dots h-1.5 w-12 bg-black mx-auto mb-4" />
                <p className="neo-copy text-[14px] font-black uppercase text-[#6c675e]">
                  Reading saved games. Use rescan when installs change.
                </p>
              </div>
            </section>
          ) : enrichedSelectedGame ? (
            <>
              {(() => {
                const logoCandidates = getGameLogoCandidates(enrichedSelectedGame);
                const logoCandidateIndex = logoCandidateIndexes[enrichedSelectedGame.id] ?? 0;
                const logoSrc = getGameAssetUrl(logoCandidates[logoCandidateIndex]);
                const gameSource = getGameSource(enrichedSelectedGame);
                const hasUbisoftBanner =
                  gameSource === "ubisoft" && Boolean(enrichedSelectedGame.coverUrl);
                const hasEpicBanner =
                  gameSource === "epic" && Boolean(enrichedSelectedGame.coverUrl);
                const shouldShowTextFallback =
                  !hasUbisoftBanner &&
                  !hasEpicBanner &&
                  (!logoSrc || !loadedLogoUrls.has(logoSrc));
                const logoPositionClass = getLogoPositionClass(enrichedSelectedGame);
                const logoPlacementStyle = getLogoPlacementStyle(enrichedSelectedGame);

                return (
                  <section className="border-b-4 border-black bg-[#171411]">
                    <div
                      className={`steam-game-banner-hero relative overflow-hidden bg-[#0f141b] ${getFallbackBannerClass(enrichedSelectedGame)}`}
                      style={getGameBannerStyle(enrichedSelectedGame.coverUrl, {
                        backgroundPosition: gameSource === "epic" ? "center 24%" : undefined,
                      })}
                    >
                      <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[length:9px_9px]" />
                      {shouldShowTextFallback ? (
                        <h1 className="absolute left-1/2 top-1/2 max-w-[min(62%,720px)] -translate-x-1/2 -translate-y-1/2 text-center text-[clamp(2.4rem,7vw,5.4rem)] font-black uppercase leading-none tracking-normal text-white drop-shadow-[0_7px_14px_rgba(0,0,0,0.75)]">
                          {enrichedSelectedGame.title}
                        </h1>
                      ) : null}
                      {logoSrc ? (
                        <img
                          alt=""
                          aria-hidden="true"
                          className={`absolute ${logoPositionClass} object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.65)]`}
                          style={logoPlacementStyle}
                          src={logoSrc}
                          onLoad={() => handleLogoLoad(logoSrc)}
                          onError={() => handleLogoError(enrichedSelectedGame)}
                        />
                      ) : null}
                    </div>
                  </section>
                );
              })()}

              {/* Game Control Section */}
              <section className="flex flex-wrap items-start gap-3 border-b-4 border-black bg-[#f3e8d7] p-3">
                <div className="flex min-w-[220px] flex-1 sm:flex-none">
                  <button
                    className="flex h-[64px] min-w-0 flex-1 items-center justify-center gap-3 border-4 border-black bg-[#169b83] px-5 text-[22px] font-black uppercase text-white shadow-[3px_3px_0_#171411] sm:min-w-[205px] sm:flex-none sm:text-[26px]"
                    type="button"
                    onClick={() => void handlePlay()}
                  >
                    <Play className="h-7 w-7 fill-current" />
                    Play
                  </button>
                  <button className="grid h-[64px] w-[44px] shrink-0 place-items-center border-y-4 border-r-4 border-black bg-[#169b83] text-white shadow-[3px_3px_0_#171411]" type="button" aria-label="More play options">
                    <ChevronDown className="h-6 w-6" />
                  </button>
                </div>

                <div className="grid min-w-[260px] flex-[999_1_420px] gap-3 sm:grid-cols-2 2xl:grid-cols-[repeat(4,minmax(130px,1fr))]">
                  <Metric icon={<Cloud className="h-7 w-7 fill-black text-black" />} title="Cloud" value="Up to date" />
                  <Metric icon={<Clock3 className="h-7 w-7" />} title="Last Played" value={formatLastPlayed(enrichedSelectedGame.lastPlayed ?? enrichedSelectedGame.lastPlayedAt)} />
                  <Metric icon={<Clock3 className="h-7 w-7" />} title="Play Time" value={formatPlayTime(enrichedSelectedGame.playtimeMinutes)} />
                  <Metric icon={<Award className="h-7 w-7 fill-black text-black" />} title="Achievements" value="0/0" />
                </div>

                {/* DETAILS POPUP INTERACTIONS (Favoriten, Kategorien verwalten, Hidden) */}
                <div className="relative flex w-full flex-wrap items-start justify-start gap-2 self-start border-t-2 border-black/20 pt-1">
                  
                  {/* Settings Button */}
                  <div className="relative">
                    <button
                      onClick={() => setIsSettingsPopoverOpen(!isSettingsPopoverOpen)}
                      className={`grid h-10 w-10 place-items-center border-4 border-black transition ${
                        isSettingsPopoverOpen ? "bg-[#efe3cf]" : "bg-[#fbf4e7] hover:bg-[#efe3cf]"
                      }`}
                      type="button"
                      aria-label="Game Settings"
                    >
                      <Settings className="h-6 w-6 animate-[spin_8s_linear_infinite]" />
                    </button>

                    {isSettingsPopoverOpen ? (
                      <div className="absolute right-0 top-12 z-50 w-64 border-4 border-black bg-[#fbf4e7] p-3 shadow-[5px_5px_0_#171411]" style={{ fontFamily: '"Arial Narrow", Impact, sans-serif' }}>
                        <h4 className="font-black uppercase text-[12px] border-b border-black pb-1 mb-2">
                          Options: {enrichedSelectedGame.title}
                        </h4>
                        
                        {/* HIDE GAME TOGGLE */}
                        <div className="mb-3">
                          <button
                            onClick={() => {
                              const isCurrentlyHidden = hiddenGames[enrichedSelectedGame.id] === true;
                              setHiddenGames(prev => ({ ...prev, [enrichedSelectedGame.id]: !isCurrentlyHidden }));
                            }}
                            className={`w-full border-2 border-black py-1 text-[10px] font-black uppercase transition ${
                              hiddenGames[enrichedSelectedGame.id] === true
                                ? "bg-[#b7102a] text-white shadow-[1px_1px_0_#000]"
                                : "bg-[#ded3c1] text-[#171411] hover:bg-[#d5c7b1]"
                            }`}
                          >
                            {hiddenGames[enrichedSelectedGame.id] === true ? "🛈 Hidden (Ausgeblendet)" : "👁 Hide Game (Ausblenden)"}
                          </button>
                        </div>

                        {/* CUSTOM CATEGORIES */}
                        <div>
                          <label className="block text-[11px] font-black uppercase mb-1">
                            Kategorien verwalten:
                          </label>
                          <div className="flex gap-1 mb-2">
                            <input
                              type="text"
                              placeholder="z.B. Retro, Fav..."
                              value={newCategoryInput}
                              onChange={(e) => setNewCategoryInput(e.target.value)}
                              className="neo-copy h-7 flex-1 border-2 border-black bg-[#f4ead8] px-2 text-[10px] font-bold outline-none"
                            />
                            <button
                              onClick={() => {
                                if (!newCategoryInput.trim()) return;
                                const cat = newCategoryInput.trim();
                                const currentCats = customCategories[enrichedSelectedGame.id] || [];
                                if (!currentCats.includes(cat)) {
                                  setCustomCategories(prev => ({
                                    ...prev,
                                    [enrichedSelectedGame.id]: [...currentCats, cat]
                                  }));
                                }
                                setNewCategoryInput("");
                              }}
                              className="border-2 border-black bg-black text-white hover:bg-[#2c2c2c] px-2 text-[10px] font-black uppercase"
                            >
                              +
                            </button>
                          </div>
                          
                          {(customCategories[enrichedSelectedGame.id] || []).length > 0 ? (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(customCategories[enrichedSelectedGame.id] || []).map((cat) => (
                                <span
                                  key={cat}
                                  className="inline-flex items-center gap-1 bg-[#efe3cf] border border-black px-1.5 py-0.5 text-[9px] font-bold"
                                >
                                  {cat}
                                  <button
                                    onClick={() => {
                                      setCustomCategories(prev => ({
                                        ...prev,
                                        [enrichedSelectedGame.id]: (prev[enrichedSelectedGame.id] || []).filter(c => c !== cat)
                                      }));
                                    }}
                                    className="text-[#b7102a] font-bold"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] italic text-gray-500">Keine Kategorien zugewiesen.</p>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <button
                    className="grid h-10 w-10 place-items-center border-4 border-black bg-[#fbf4e7] hover:bg-[#efe3cf] transition"
                    type="button"
                    aria-label="Controller compatibility"
                    onClick={() => alert(`Controller: ${enrichedSelectedGame.title} hat vollen Gamepad-Support.`)}
                  >
                    <Gamepad2 className="h-6 w-6" />
                  </button>

                  <button
                    className="grid h-10 w-10 place-items-center border-4 border-black bg-[#fbf4e7] hover:bg-[#efe3cf] transition"
                    type="button"
                    aria-label="Information help"
                    onClick={() => alert(`Support: Besuche die Hilfeseite für ${enrichedSelectedGame.title}.`)}
                  >
                    <CircleHelp className="h-6 w-6" />
                  </button>

                  {/* FAVORITES HEART BUTTON */}
                  <button
                    onClick={() => {
                      const isFav = favorites[enrichedSelectedGame.id] === true;
                      setFavorites(prev => ({ ...prev, [enrichedSelectedGame.id]: !isFav }));
                    }}
                    className={`grid h-10 w-10 place-items-center border-4 border-black transition ${
                      favorites[enrichedSelectedGame.id] === true
                        ? "bg-[#b7102a] text-white border-[#b7102a]"
                        : "bg-[#fbf4e7] hover:bg-[#efe3cf] text-[#171411]"
                    }`}
                    type="button"
                    aria-label="Mark as favorite"
                  >
                    <Heart className={`h-6 w-6 ${favorites[enrichedSelectedGame.id] === true ? "fill-current" : ""}`} />
                  </button>
                </div>
              </section>

              {/* Game Metadata & Activity Grid */}
              <section className="px-3 py-3 sm:px-4">
                {statusMessage ? (
                  <div className="neo-copy mb-3 border-2 border-black bg-[#e6dbc8] px-4 py-2 text-xs font-bold uppercase shadow-[2px_2px_0_#171411]">
                    {statusMessage}
                  </div>
                ) : null}

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
                  
                  {/* Left Column: Activity Feed */}
                  <section className="min-w-0">
                    <div className="mb-2 flex items-center justify-between">
                      <h2 className="text-[15px] font-black uppercase leading-none">Activity</h2>
                      <button className="neo-copy text-[10px] font-black uppercase" type="button">
                        View Latest News
                      </button>
                    </div>

                    <div className="mb-4 border-4 border-black bg-[#fbf4e7] px-3 py-2 shadow-[3px_3px_0_#171411]">
                      <input
                        className="neo-copy h-8 w-full border-2 border-black bg-[#f4ead8] px-3 text-[12px] font-bold italic outline-none placeholder:text-[#55504a]"
                        placeholder="Say something about this game to your friends..."
                        type="text"
                      />
                    </div>

                    <div className="space-y-3">
                      <article className="border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]">
                        <div className="border-b-2 border-black px-3 py-2 text-[12px] font-black uppercase">
                          April 18
                        </div>
                        <div className="flex gap-3 p-3">
                          <div
                            className={`h-12 w-12 shrink-0 border-2 border-black bg-[#171411] bg-cover bg-center ${getFallbackBannerClass(enrichedSelectedGame)}`}
                            style={getGameBannerStyle(enrichedSelectedGame.coverUrl)}
                          />
                          <p className="min-w-0 text-[13px] font-bold leading-5">
                            Michael added <span className="font-black">{enrichedSelectedGame.title}</span> to their wishlist.
                          </p>
                        </div>
                      </article>

                      <article className="grid min-h-[96px] grid-cols-[72px_minmax(0,1fr)] border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]">
                        <div className="grid place-items-center bg-[#171411] text-[34px] font-black text-[#fbf4e7]">02</div>
                        <div className="p-3">
                          <span className="border-2 border-black bg-[#169b83] px-2 py-1 text-[10px] font-black uppercase text-white">
                            Update
                          </span>
                          <h3 className="mt-3 break-words text-[16px] font-black leading-tight">
                            Swap Your Title Screen... with patch 1.3.4!!
                          </h3>
                        </div>
                      </article>
                    </div>
                  </section>

                  {/* Right Column: RICH METADATA & Hardware cards */}
                  <aside className="space-y-4">
                    
                    {/* ENRICHED METADATA INFORMATION CARD */}
                    <section className="border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]" style={{ fontFamily: '"Arial Narrow", Impact, sans-serif' }}>
                      <h2 className="border-b-2 border-black px-3 py-2 text-[15px] font-black uppercase leading-none">
                        Metadaten & Infos
                      </h2>
                      <div className="p-3 space-y-2.5 text-[12px] font-bold">
                        <div className="flex justify-between border-b border-black/10 pb-1">
                          <span className="text-[#55504a] uppercase">Größe:</span>
                          <span className="font-black text-right">{enrichedSelectedGame.sizeGb ? `${enrichedSelectedGame.sizeGb.toFixed(1)} GB` : "Unbekannt"}</span>
                        </div>
                        <div className="flex justify-between border-b border-black/10 pb-1">
                          <span className="text-[#55504a] uppercase">Kategorie:</span>
                          <span className="font-black capitalize">{enrichedSelectedGame.productCategory || "game"}</span>
                        </div>
                        <div className="flex justify-between border-b border-black/10 pb-1">
                          <span className="text-[#55504a] uppercase">Plattform:</span>
                          <button
                            type="button"
                            onClick={() => {
                              setActivePlatformFilter(enrichedSelectedGame.platform as "windows" | "macos" | "linux");
                              setSelectedCollectionName(null);
                            }}
                            className="font-black capitalize hover:text-[#139a82] hover:underline flex items-center gap-1 cursor-pointer select-none"
                            title={`Filter nach ${enrichedSelectedGame.platform}`}
                          >
                            <PlatformIcon platform={enrichedSelectedGame.platform} className="h-3.5 w-3.5" />
                            <span className="underline decoration-dotted">{enrichedSelectedGame.platform}</span>
                          </button>
                        </div>
                        {enrichedSelectedGame.protonCompatible && (
                          <div className="flex justify-between border-b border-black/10 pb-1">
                            <span className="text-[#55504a] uppercase">Proton-Support:</span>
                            <span className="font-black text-[#139a82] uppercase">Kompatibel (via Proton)</span>
                          </div>
                        )}
                        <div className="flex justify-between border-b border-black/10 pb-1">
                          <span className="text-[#55504a] uppercase">Steam Deck:</span>
                          <span className={`font-black px-1.5 py-0.5 text-[10px] uppercase border border-black ${
                            enrichedSelectedGame.steamDeckCompatibility === "verified"
                              ? "bg-[#139a82] text-white shadow-[1px_1px_0_#000]"
                              : enrichedSelectedGame.steamDeckCompatibility === "playable"
                                ? "bg-[#e8c843] text-black shadow-[1px_1px_0_#000]"
                                : enrichedSelectedGame.steamDeckCompatibility === "unsupported"
                                  ? "bg-[#b7102a] text-white shadow-[1px_1px_0_#000]"
                                  : "bg-[#efe3cf] text-black"
                          }`}>
                            {enrichedSelectedGame.steamDeckCompatibility || "unknown"}
                          </span>
                        </div>
                        {enrichedSelectedGame.genres && enrichedSelectedGame.genres.length > 0 && (
                          <div className="border-b border-black/10 pb-1">
                            <span className="text-[#55504a] uppercase block mb-1">Genres:</span>
                            <div className="flex flex-wrap gap-1">
                              {enrichedSelectedGame.genres.map(g => (
                                <span key={g} className="bg-[#efe3cf] border border-black px-1.5 py-0.5 text-[9px] uppercase font-black">{g}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {enrichedSelectedGame.players && enrichedSelectedGame.players.length > 0 && (
                          <div>
                            <span className="text-[#55504a] uppercase block mb-1">Spieleranzahl:</span>
                            <div className="flex flex-wrap gap-1">
                              {enrichedSelectedGame.players.map(p => (
                                <span key={p} className="bg-[#efe3cf] border border-black px-1.5 py-0.5 text-[9px] uppercase font-black">{p}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </section>

                    {/* Controller details */}
                    <section className="border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]">
                      <h2 className="border-b-2 border-black px-3 py-2 text-[15px] font-black uppercase leading-none">
                        Controller
                      </h2>
                      <div className="flex gap-3 p-3">
                        <Gamepad2 className="h-9 w-9 shrink-0" />
                        <div className="min-w-0">
                          <h3 className="text-[13px] font-black">Supports Your Xbox Controller</h3>
                          <p className="mt-1 text-[12px] font-bold leading-4">
                            This game should work great with your controller.
                          </p>
                        </div>
                      </div>
                      <button className="block w-full border-t-2 border-black px-3 py-2 text-right text-[11px] font-black uppercase" type="button">
                        View controller settings
                      </button>
                    </section>

                    {/* Friends who play */}
                    <section className="border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]">
                      <h2 className="border-b-2 border-black px-3 py-2 text-[15px] font-black uppercase leading-none">
                        Friends Who Play
                      </h2>
                      <div className="space-y-3 p-3 text-[12px] font-bold leading-4">
                        <p>2 friends have played previously</p>
                        <div className="flex gap-2">
                          {[0, 1].map((friend) => (
                            <div
                              key={friend}
                              className={`h-9 w-9 border-2 border-black bg-[#171411] bg-cover bg-center ${getFallbackBannerClass(enrichedSelectedGame)}`}
                              style={getGameBannerStyle(enrichedSelectedGame.coverUrl)}
                            />
                          ))}
                        </div>
                        <p>1 friend has {enrichedSelectedGame.title} on their wishlist</p>
                        <button className="block w-full pt-2 text-right text-[11px] font-black uppercase" type="button">
                          View all friends who play
                        </button>
                      </div>
                    </section>
                  </aside>
                </div>
              </section>
            </>
          ) : (
            <section className="grid min-h-[calc(100vh-124px)] place-items-center border-b-4 border-black bg-[#f8f0df] px-4 text-center">
              <div className="max-w-[560px] border-4 border-black bg-[#fbf4e7] p-6 shadow-[4px_4px_0_#171411]">
                <h1 className="text-[clamp(2.4rem,12vw,4rem)] font-black uppercase leading-none">
                  Keine Spiele erkannt
                </h1>
                <p className="neo-copy mt-4 text-[13px] font-bold uppercase leading-6 text-[#55504a]">
                  {isDiscoveringGames
                    ? "Bibliothek wird geladen..."
                    : discoveryMessage}
                </p>
                <p className="neo-copy mt-3 text-[11px] font-bold uppercase leading-5 text-[#55504a]">
                  Rescan sucht nach Steam-, Epic-Games-, GOG-, Ubisoft- und Xbox-Installationen auf diesem PC.
                </p>
              </div>
            </section>
          )}
        </main>
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
