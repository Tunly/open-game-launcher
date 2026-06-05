import {
  Play,
  Settings,
  Heart,
  Cloud,
  Clock as Clock3,
  Download,
  Gamepad2,
  PackagePlus,
  CircleHelp,
  Award,
  Trophy,
  LockKeyhole,
  LockKeyholeOpen,
  Camera,
  ImagePlus,
  RotateCcw,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { Game, UnifiedAchievement } from "../../lib/types";
import {
  hasCustomArtwork,
  type CustomArtworkKind,
  type GameCustomArtwork,
} from "../../lib/custom-artwork";
import { Metric } from "./Metric";
import { LibraryCustomScrollbar } from "./LibraryCustomScrollbar";
import { PlatformIcon, PlatformSourceIcon } from "./PlatformIcons";
import {
  formatAchievementProgress,
  formatPlayTime,
  formatLastPlayed,
  getErrorMessage,
  getFallbackBannerClass,
  getGameLogoCandidates,
  getGameSource,
  getLogoPositionClass,
  getLogoPlacementStyle,
  getPlatformBannerClass,
} from "../../lib/formatters";
import { getGameAssetUrl, getGameBannerStyle } from "../../lib/assets";
import { listControllers, uninstallGame } from "../../lib/launcher";
import { isLiveDownloadItem, useDownloadStore } from "../../stores/downloadStore";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { CrossPlayBadge } from "./CrossPlayBadge";
import { getCrossPlayPlatforms } from "../../lib/supabase/crossplay";
import type { CrossPlayPlatform } from "../../lib/types/crossplay";
import { CloudSavesPanel } from "./GameDetails/CloudSavesPanel";
import { GameUpdateFeed } from "./GameUpdateFeed";
import { ControllerLayoutEditor } from "../controllers/ControllerLayoutEditor";
import type { ControllerDevice } from "../../lib/types/controllers";

type AchievementWithSources = UnifiedAchievement & {
  sourceLabels?: string[];
  canonicalSource?: string;
  matchConfidence?: string;
  isAdditional?: boolean;
};

function filterAndSortAchievements(
  achievements: UnifiedAchievement[],
  filter: string,
  sort: "rarity" | "name" | "date",
): UnifiedAchievement[] {
  const filtered = achievements.filter((achievement) => {
    if (filter === "locked") return !achievement.unlockedAt;
    if (filter === "unlocked") return Boolean(achievement.unlockedAt);
    if (filter.startsWith("source:")) {
      const source = filter.slice("source:".length);
      return ((achievement as AchievementWithSources).sourceLabels ?? []).includes(source);
    }
    return true;
  });
  const sorted = [...filtered];
  if (sort === "rarity") {
    // Lower rarity first (rarest = most interesting). Locked with no rarity go to the end.
    sorted.sort((a, b) => {
      const ar = typeof a.rarity === "number" ? a.rarity : Number.POSITIVE_INFINITY;
      const br = typeof b.rarity === "number" ? b.rarity : Number.POSITIVE_INFINITY;
      return ar - br;
    });
  } else if (sort === "name") {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === "date") {
    sorted.sort((a, b) => {
      // Unlocked first, newest first. Locked go to the end.
      if (Boolean(a.unlockedAt) !== Boolean(b.unlockedAt)) {
        return a.unlockedAt ? -1 : 1;
      }
      const at = a.unlockedAt ? Date.parse(a.unlockedAt) : 0;
      const bt = b.unlockedAt ? Date.parse(b.unlockedAt) : 0;
      return bt - at;
    });
  }
  return sorted;
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "unknown";
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "2-digit", month: "short", day: "2-digit" });
}

export interface GameDetailsProps {
  selectedGame: Game | null;
  enrichedSelectedGame: Game | null;
  gameVariants?: Game[];
  shouldShowLibraryLoading: boolean;
  handlePlay: () => void;
  onInstallFromProvider?: () => void;
  hasInstallableVariants?: boolean;
  handleCaptureScreenshot: () => void;
  handleSyncAchievements: () => void;
  isSyncingAchievements: boolean;
  logoCandidateIndexes: Record<string, number>;
  loadedLogoUrls: Set<string>;
  handleLogoLoad: (src: string) => void;
  handleLogoError: (game: Game) => void;
  statusMessage: string | null;
  setStatusMessage: (msg: string | null) => void;
  favorites: Record<string, boolean>;
  setFavorites: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  hiddenGames: Record<string, boolean>;
  setHiddenGames: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  customCategories: Record<string, string[]>;
  setCustomCategories: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  manualCollections: Record<string, string[]>;
  setManualCollections: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  setActivePlatformFilter: (platform: "all" | "windows" | "macos" | "linux") => void;
  clearCollectionSelection: () => void;
  detailScrollRef: React.RefObject<HTMLElement | null>;
  isDiscoveringGames: boolean;
  discoveryMessage: string | null;
  moveGame: (opts: { gameId: string; newPath: string }) => Promise<void>;
  runAutomaticLibrarySync: (force: boolean) => Promise<void>;
  customArtwork: GameCustomArtwork | null;
  artworkGameId?: string;
  onSelectCustomArtwork: (gameId: string, kind: CustomArtworkKind, file: File) => void;
  onResetCustomArtwork: (gameId: string, kind?: CustomArtworkKind) => void;
}

export function GameDetails({
  selectedGame,
  enrichedSelectedGame,
  gameVariants = [],
  shouldShowLibraryLoading,
  handlePlay,
  onInstallFromProvider,
  hasInstallableVariants = false,
  handleCaptureScreenshot,
  handleSyncAchievements,
  isSyncingAchievements,
  logoCandidateIndexes,
  loadedLogoUrls,
  handleLogoLoad,
  handleLogoError,
  statusMessage,
  setStatusMessage,
  favorites,
  setFavorites,
  hiddenGames,
  setHiddenGames,
  customCategories,
  setCustomCategories,
  manualCollections,
  setManualCollections,
  setActivePlatformFilter,
  clearCollectionSelection,
  detailScrollRef,
  isDiscoveringGames,
  discoveryMessage,
  moveGame,
  runAutomaticLibrarySync,
  customArtwork,
  artworkGameId,
  onSelectCustomArtwork,
  onResetCustomArtwork,
}: GameDetailsProps) {
  // Local state that was originally in LibraryPage
  const [isSettingsPopoverOpen, setIsSettingsPopoverOpen] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [isUninstallDialogOpen, setIsUninstallDialogOpen] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [uninstallError, setUninstallError] = useState<string | null>(null);
  const [achievementFilter, setAchievementFilter] = useState("all");
  const [achievementSort, setAchievementSort] = useState<"rarity" | "name" | "date">("rarity");
  const coverArtworkInputRef = useRef<HTMLInputElement>(null);
  const iconArtworkInputRef = useRef<HTMLInputElement>(null);
  const logoArtworkInputRef = useRef<HTMLInputElement>(null);
  const achievements = enrichedSelectedGame?.achievements ?? [];
  const achievementBasisSource =
    (enrichedSelectedGame as (Game & { achievementBasisSource?: string | null }) | null)
      ?.achievementBasisSource ?? null;
  const achievementProviderStatuses =
    (
      enrichedSelectedGame as
        | (Game & {
            achievementProviderStatuses?: Array<{
              source: string;
              status: string;
              stability: string;
              message: string;
            }>;
          })
        | null
    )?.achievementProviderStatuses ?? [];
  const achievementSourceFilters = Array.from(
    new Set(
      achievements.flatMap(
        (achievement) => (achievement as AchievementWithSources).sourceLabels ?? [],
      ),
    ),
  );
  const variantsForActions =
    gameVariants.length > 0 ? gameVariants : enrichedSelectedGame ? [enrichedSelectedGame] : [];
  const variantIds = variantsForActions.map((game) => game.id);
  const primaryArtworkGameId = artworkGameId ?? enrichedSelectedGame?.id;
  const isGroupFavorite = variantIds.some((id) => favorites[id] === true);
  const isGroupHidden = variantIds.length > 0 && variantIds.every((id) => hiddenGames[id] === true);
  const groupCategories = Array.from(
    new Set(variantIds.flatMap((id) => customCategories[id] || [])),
  );
  const unlockedAchievementCount = achievements.filter(
    (achievement) => achievement.unlockedAt,
  ).length;
  const achievementProgressPercent =
    achievements.length === 0
      ? 0
      : Math.round((unlockedAchievementCount / achievements.length) * 100);

  const navigate = useNavigate();
  const [crossPlayPlatforms, setCrossPlayPlatforms] = useState<CrossPlayPlatform[]>([]);
  const [isControllerPanelOpen, setIsControllerPanelOpen] = useState(false);
  const [controllerDevices, setControllerDevices] = useState<ControllerDevice[]>([]);

  useEffect(() => {
    if (!enrichedSelectedGame?.id) {
      setCrossPlayPlatforms([]);
      return;
    }
    let cancelled = false;
    getCrossPlayPlatforms(enrichedSelectedGame.id)
      .then((platforms) => {
        if (!cancelled) setCrossPlayPlatforms(platforms);
      })
      .catch(() => {
        if (!cancelled) setCrossPlayPlatforms([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enrichedSelectedGame?.id]);

  const downloadItems = useDownloadStore((s) => s.items);
  const activeDownload = enrichedSelectedGame
    ? downloadItems.find(
        (download) => variantIds.includes(download.gameId) && isLiveDownloadItem(download),
      )
    : null;

  // Close popovers on game switch
  useEffect(() => {
    setIsSettingsPopoverOpen(false);
    setNewCategoryInput("");
    setIsUninstallDialogOpen(false);
    setUninstallError(null);
    setAchievementFilter("all");
    setAchievementSort("rarity");
    setIsControllerPanelOpen(false);
  }, [selectedGame?.id]);

  function handleArtworkFileChange(kind: CustomArtworkKind, fileList: FileList | null) {
    const file = fileList?.[0];
    if (!primaryArtworkGameId || !file) {
      return;
    }

    onSelectCustomArtwork(primaryArtworkGameId, kind, file);
  }

  function openArtworkPicker(kind: CustomArtworkKind) {
    const input =
      kind === "cover"
        ? coverArtworkInputRef.current
        : kind === "icon"
          ? iconArtworkInputRef.current
          : logoArtworkInputRef.current;

    input?.click();
  }

  async function handleUninstallConfirm() {
    if (!enrichedSelectedGame || isUninstalling) {
      return;
    }

    setIsUninstalling(true);
    try {
      await uninstallGame(enrichedSelectedGame.id);
      setStatusMessage("Uninstall process started. Library will sync automatically.");
      setIsUninstallDialogOpen(false);
      void runAutomaticLibrarySync(true);
    } catch (err) {
      setUninstallError(getErrorMessage(err));
    } finally {
      setIsUninstalling(false);
    }
  }

  return (
    <>
      <div className="library-scroll-frame relative z-10 min-h-0 min-w-0">
        <main
          ref={detailScrollRef}
          className="library-detail-scroll h-full min-h-0 min-w-0 overflow-y-auto overflow-x-hidden"
        >
          {shouldShowLibraryLoading ? (
            <section
              className="grid min-h-[calc(100vh-124px)] place-items-center border-b-4 border-black bg-[#efe3cf] px-4 text-center"
              style={{ fontFamily: '"Arial Narrow", Impact, sans-serif' }}
            >
              <div className="max-w-[560px] border-4 border-black bg-[#fbf4e7] p-8 shadow-[8px_8px_0_#171411]">
                <Settings className="mx-auto mb-4 h-10 w-10 animate-[spin_4s_linear_infinite] text-[#087d6d]" />
                <h2 className="neo-title mb-2 text-3xl uppercase text-[#171411]">
                  LOADING LIBRARY
                </h2>
                <div className="neo-dots mx-auto mb-4 h-1.5 w-12 bg-black" />
                <p className="neo-copy text-[14px] font-black uppercase text-[#6c675e]">
                  Reading saved games. Library sync watches installs automatically.
                </p>
              </div>
            </section>
          ) : enrichedSelectedGame ? (
            <>
              {(() => {
                const logoCandidates = getGameLogoCandidates(enrichedSelectedGame);
                const logoCandidateIndex = logoCandidateIndexes[enrichedSelectedGame.id] ?? 0;
                const gameSource = getGameSource(enrichedSelectedGame);
                const shouldHideHeroOverlay = gameSource === "battlenet";
                const logoSrc = shouldHideHeroOverlay
                  ? undefined
                  : getGameAssetUrl(logoCandidates[logoCandidateIndex]);
                const hasUbisoftBanner =
                  gameSource === "ubisoft" && Boolean(enrichedSelectedGame.coverUrl);
                const hasEpicBanner =
                  gameSource === "epic" && Boolean(enrichedSelectedGame.coverUrl);
                const shouldShowTextFallback =
                  !shouldHideHeroOverlay &&
                  gameSource !== "gog" &&
                  gameSource !== "xbox" &&
                  !hasUbisoftBanner &&
                  !hasEpicBanner &&
                  (!logoSrc || !loadedLogoUrls.has(logoSrc));
                const logoPositionClass = getLogoPositionClass(enrichedSelectedGame);
                const logoPlacementStyle = getLogoPlacementStyle(enrichedSelectedGame);

                return (
                  <section className="border-b-4 border-black bg-[#171411]">
                    <div
                      className={`${getPlatformBannerClass(enrichedSelectedGame)} relative overflow-hidden bg-[#0f141b] ${getFallbackBannerClass(enrichedSelectedGame)}`}
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
                      {crossPlayPlatforms.length > 0 && (
                        <div className="absolute left-1/2 top-[calc(50%+3.4rem)] z-10 -translate-x-1/2">
                          <CrossPlayBadge platforms={crossPlayPlatforms} />
                        </div>
                      )}
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
              <section className="grid items-start gap-3 border-b-4 border-black bg-[#f3e8d7] p-3 xl:grid-cols-[205px_minmax(0,1fr)]">
                <div className="flex min-w-[205px] flex-1 sm:flex-none">
                  {activeDownload ? (
                    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:min-w-[205px] sm:flex-none">
                      <div className="flex items-center justify-between gap-2">
                        <span className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
                          Downloading {activeDownload.progress}%
                        </span>
                        <span className="neo-copy text-[10px] font-bold uppercase text-[#c20b2f]">
                          {activeDownload.speed}
                        </span>
                      </div>
                      <div className="h-3 border-2 border-black bg-[#efe6d4]">
                        <div
                          className="h-full bg-[#c20b2f]"
                          style={{ width: `${activeDownload.progress}%` }}
                        />
                      </div>
                      <button
                        className="neo-copy h-9 border-2 border-black bg-[#171411] px-3 text-[10px] font-bold uppercase text-white transition-colors hover:bg-[#333]"
                        type="button"
                        onClick={() => navigate("/downloads")}
                      >
                        View in Downloads
                      </button>
                    </div>
                  ) : enrichedSelectedGame.status === "not_installed" ? (
                    <button
                      className="flex h-[64px] min-w-0 flex-1 items-center justify-center gap-3 border-4 border-black bg-[#b7102a] px-5 text-[22px] font-black uppercase text-white shadow-[3px_3px_0_#171411] transition-colors hover:bg-[#990a20] xl:w-[205px] xl:flex-none xl:text-[26px]"
                      type="button"
                      onClick={() => void handlePlay()}
                    >
                      <Download className="h-7 w-7" />
                      Install
                    </button>
                  ) : (
                    <div className="flex w-full flex-1 gap-2 sm:flex-none">
                      <button
                        className="flex h-[64px] min-w-0 flex-1 items-center justify-center gap-3 border-4 border-black bg-[#169b83] px-5 text-[22px] font-black uppercase text-white shadow-[3px_3px_0_#171411] sm:min-w-[205px] sm:flex-none sm:text-[26px]"
                        type="button"
                        onClick={() => void handlePlay()}
                      >
                        <Play className="h-7 w-7 fill-current" />
                        Play
                      </button>
                      <button
                        aria-label="Capture screenshot"
                        className="flex h-[64px] w-[64px] shrink-0 items-center justify-center border-4 border-black bg-[#fff9ed] text-[#171411] shadow-[3px_3px_0_#171411] hover:bg-[#f6edd8]"
                        title="Capture screenshot to activity feed"
                        type="button"
                        onClick={() => void handleCaptureScreenshot()}
                      >
                        <Camera className="h-7 w-7" />
                      </button>
                    </div>
                  )}
                  {enrichedSelectedGame.cloudGamingUrl && (
                    <a
                      href={enrichedSelectedGame.cloudGamingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-[64px] min-w-0 flex-1 items-center justify-center gap-2 border-4 border-black bg-[#0d8544] px-3 text-[18px] font-black uppercase text-white shadow-[3px_3px_0_#171411] transition-colors hover:bg-[#0a6634]"
                    >
                      <Cloud className="h-6 w-6" />
                      Play via Cloud
                    </a>
                  )}
                  {enrichedSelectedGame.status !== "not_installed" ? (
                    <button
                      className="flex h-[64px] min-w-0 flex-1 items-center justify-center gap-2 border-4 border-black bg-[#fbf4e7] px-3 text-[18px] font-black uppercase text-[#171411] shadow-[3px_3px_0_#171411] transition-colors hover:bg-[#8cf5e4]"
                      type="button"
                      onClick={() =>
                        navigate(`/mods?gameId=${encodeURIComponent(enrichedSelectedGame.id)}`)
                      }
                    >
                      <PackagePlus className="h-6 w-6" />
                      Mods
                    </button>
                  ) : null}
                  {enrichedSelectedGame.status !== "not_installed" &&
                  hasInstallableVariants &&
                  onInstallFromProvider ? (
                    <button
                      className="flex h-[64px] min-w-0 flex-1 items-center justify-center gap-2 border-4 border-black bg-[#e8c843] px-3 text-[16px] font-black uppercase text-[#171411] shadow-[3px_3px_0_#171411] transition-colors hover:bg-[#f0d95a]"
                      type="button"
                      onClick={() => void onInstallFromProvider()}
                    >
                      <Download className="h-6 w-6" />
                      Install from...
                    </button>
                  ) : null}
                </div>

                <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric
                    icon={<Cloud className="h-7 w-7 fill-black text-black" />}
                    title="Cloud"
                    value="Up to date"
                  />
                  <Metric
                    icon={<Clock3 className="h-7 w-7" />}
                    title="Last Played"
                    value={formatLastPlayed(
                      enrichedSelectedGame.lastPlayed ?? enrichedSelectedGame.lastPlayedAt,
                    )}
                  />
                  <Metric
                    icon={<Clock3 className="h-7 w-7" />}
                    title="Play Time"
                    value={formatPlayTime(enrichedSelectedGame.playtimeMinutes)}
                  />
                  <Metric
                    icon={<Award className="h-7 w-7 fill-black text-black" />}
                    title="Achievements"
                    value={formatAchievementProgress(enrichedSelectedGame)}
                  />
                </div>

                {gameVariants.length > 1 ? (
                  <div className="flex w-full flex-wrap gap-2 border-t-2 border-black/20 pt-2">
                    {gameVariants.map((variant) => (
                      <div
                        key={variant.id}
                        className="flex items-center gap-2 border-2 border-black bg-[#fbf4e7] px-2 py-1 shadow-[2px_2px_0_#171411]"
                        title={variant.title}
                      >
                        <PlatformSourceIcon game={variant} className="h-4 w-4" />
                        <span className="neo-copy text-[10px] font-black uppercase">
                          {getGameSource(variant)}
                        </span>
                        <span
                          className={`neo-copy border border-black px-1.5 py-0.5 text-[8px] font-black uppercase ${
                            variant.status === "installed"
                              ? "bg-[#169b83] text-white"
                              : variant.status === "update_available"
                                ? "bg-[#e8c843] text-[#171411]"
                                : "bg-[#efe3cf] text-[#171411]"
                          }`}
                        >
                          {variant.status.replace("_", " ")}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

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
                      <Settings className="h-6 w-6" />
                    </button>

                    {isSettingsPopoverOpen ? (
                      <div
                        className="absolute left-0 top-12 z-50 w-64 border-4 border-black bg-[#fbf4e7] p-3 shadow-[5px_5px_0_#171411]"
                        style={{ fontFamily: '"Arial Narrow", Impact, sans-serif' }}
                      >
                        <h4 className="mb-2 border-b border-black pb-1 text-[12px] font-black uppercase">
                          Options: {enrichedSelectedGame.title}
                        </h4>

                        {/* QUICK ACTIONS */}
                        <div className="mb-3 grid gap-1.5 border-b border-black pb-3">
                          <button
                            className="flex w-full items-center justify-start gap-2 border-2 border-black bg-[#ded3c1] px-2 py-1.5 text-[10px] font-black uppercase transition hover:bg-[#d5c7b1] disabled:cursor-not-allowed disabled:opacity-55"
                            type="button"
                            disabled={isSyncingAchievements}
                            onClick={() => {
                              setStatusMessage("Syncing platform achievements...");
                              void handleSyncAchievements();
                            }}
                          >
                            <Award
                              className={`h-4 w-4 ${isSyncingAchievements ? "animate-pulse" : ""}`}
                            />
                            Sync Achievements
                          </button>

                          <button
                            className={`flex w-full items-center justify-start gap-2 border-2 border-black px-2 py-1.5 text-[10px] font-black uppercase transition hover:bg-[#d5c7b1] ${
                              isControllerPanelOpen ? "bg-[#8cf5e4]" : "bg-[#ded3c1]"
                            }`}
                            type="button"
                            onClick={() => {
                              setIsControllerPanelOpen((open) => !open);
                              setIsSettingsPopoverOpen(false);
                              void listControllers()
                                .then(setControllerDevices)
                                .catch(() => setControllerDevices([]));
                            }}
                          >
                            <Gamepad2 className="h-4 w-4" />
                            Controller Layouts
                          </button>

                          <button
                            className="flex w-full items-center justify-start gap-2 border-2 border-black bg-[#ded3c1] px-2 py-1.5 text-[10px] font-black uppercase transition hover:bg-[#d5c7b1]"
                            type="button"
                            onClick={() =>
                              alert(
                                `Support: Visit the support page for ${enrichedSelectedGame.title}.`,
                              )
                            }
                          >
                            <CircleHelp className="h-4 w-4" />
                            Support / Help
                          </button>

                          <button
                            onClick={() => {
                              const nextFavorite = !isGroupFavorite;
                              setFavorites((prev) => {
                                const next = { ...prev };
                                variantIds.forEach((id) => {
                                  next[id] = nextFavorite;
                                });
                                return next;
                              });
                            }}
                            className={`flex w-full items-center justify-start gap-2 border-2 border-black px-2 py-1.5 text-[10px] font-black uppercase transition ${
                              isGroupFavorite
                                ? "bg-[#b7102a] text-white shadow-[1px_1px_0_#000]"
                                : "bg-[#ded3c1] text-[#171411] hover:bg-[#d5c7b1]"
                            }`}
                            type="button"
                          >
                            <Heart className={`h-4 w-4 ${isGroupFavorite ? "fill-current" : ""}`} />
                            {isGroupFavorite ? "Favorited" : "Favorite Game"}
                          </button>
                        </div>

                        {/* HIDE GAME TOGGLE */}
                        <div className="mb-3">
                          <button
                            onClick={() => {
                              const nextHidden = !isGroupHidden;
                              setHiddenGames((prev) => {
                                const next = { ...prev };
                                variantIds.forEach((id) => {
                                  next[id] = nextHidden;
                                });
                                return next;
                              });
                            }}
                            className={`w-full border-2 border-black py-1 text-[10px] font-black uppercase transition ${
                              isGroupHidden
                                ? "bg-[#b7102a] text-white shadow-[1px_1px_0_#000]"
                                : "bg-[#ded3c1] text-[#171411] hover:bg-[#d5c7b1]"
                            }`}
                          >
                            {isGroupHidden ? "Hidden" : "Hide Game"}
                          </button>
                        </div>

                        {/* UNINSTALL GAME */}
                        {enrichedSelectedGame.status === "installed" && (
                          <div className="mb-3 border-b border-black pb-3">
                            <button
                              onClick={() => {
                                setUninstallError(null);
                                setIsUninstallDialogOpen(true);
                              }}
                              className="w-full border-2 border-black bg-[#b7102a] py-1 text-[10px] font-black uppercase text-white shadow-[1px_1px_0_#000] transition hover:bg-[#990a20]"
                            >
                              Uninstall Game
                            </button>
                          </div>
                        )}

                        {/* CUSTOM ARTWORK */}
                        <div className="mb-3 border-b border-black pb-3">
                          <input
                            ref={coverArtworkInputRef}
                            className="hidden"
                            type="file"
                            accept="image/*"
                            onChange={(event) => {
                              handleArtworkFileChange("cover", event.currentTarget.files);
                              event.currentTarget.value = "";
                            }}
                          />
                          <input
                            ref={iconArtworkInputRef}
                            className="hidden"
                            type="file"
                            accept="image/*"
                            onChange={(event) => {
                              handleArtworkFileChange("icon", event.currentTarget.files);
                              event.currentTarget.value = "";
                            }}
                          />
                          <input
                            ref={logoArtworkInputRef}
                            className="hidden"
                            type="file"
                            accept="image/*"
                            onChange={(event) => {
                              handleArtworkFileChange("logo", event.currentTarget.files);
                              event.currentTarget.value = "";
                            }}
                          />

                          <span className="mb-1 block text-[11px] font-black uppercase">
                            Custom Artwork:
                          </span>
                          <div className="grid grid-cols-3 gap-1">
                            {(
                              [
                                ["cover", "Banner"],
                                ["icon", "Icon"],
                                ["logo", "Logo"],
                              ] as const
                            ).map(([kind, label]) => (
                              <button
                                key={kind}
                                type="button"
                                className="flex h-8 items-center justify-center gap-1 border-2 border-black bg-[#ded3c1] px-1 text-[9px] font-black uppercase transition hover:bg-[#8cf5e4]"
                                title={`Choose custom ${label.toLowerCase()} artwork`}
                                onClick={() => openArtworkPicker(kind)}
                              >
                                <ImagePlus className="h-3.5 w-3.5" />
                                {label}
                              </button>
                            ))}
                          </div>
                          {hasCustomArtwork(customArtwork) ? (
                            <button
                              type="button"
                              className="mt-2 flex h-8 w-full items-center justify-center gap-1 border-2 border-black bg-[#fbf4e7] px-2 text-[9px] font-black uppercase transition hover:bg-[#efe3cf]"
                              onClick={() => {
                                if (primaryArtworkGameId) {
                                  onResetCustomArtwork(primaryArtworkGameId);
                                }
                              }}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Reset Artwork
                            </button>
                          ) : (
                            <p className="mt-2 text-[10px] font-bold uppercase text-[#655f58]">
                              Uses scanned launcher art.
                            </p>
                          )}
                        </div>

                        {/* CUSTOM CATEGORIES */}
                        <div>
                          <span className="mb-1 block text-[11px] font-black uppercase">
                            Kategorien verwalten:
                          </span>
                          <div className="mb-2 flex gap-1">
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
                                setCustomCategories((prev) => {
                                  const next = { ...prev };
                                  variantIds.forEach((id) => {
                                    const currentCats = next[id] || [];
                                    if (!currentCats.includes(cat)) {
                                      next[id] = [...currentCats, cat];
                                    }
                                  });
                                  return next;
                                });
                                setNewCategoryInput("");
                              }}
                              className="border-2 border-black bg-black px-2 text-[10px] font-black uppercase text-white hover:bg-[#2c2c2c]"
                            >
                              +
                            </button>
                          </div>

                          {groupCategories.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {groupCategories.map((cat) => (
                                <span
                                  key={cat}
                                  className="inline-flex items-center gap-1 border border-black bg-[#efe3cf] px-1.5 py-0.5 text-[9px] font-bold"
                                >
                                  {cat}
                                  <button
                                    onClick={() => {
                                      setCustomCategories((prev) => ({
                                        ...prev,
                                        ...Object.fromEntries(
                                          variantIds.map((id) => [
                                            id,
                                            (prev[id] || []).filter((c) => c !== cat),
                                          ]),
                                        ),
                                      }));
                                    }}
                                    className="font-bold text-[#b7102a]"
                                  >
                                    x
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] italic text-gray-500">
                              No categories assigned.
                            </p>
                          )}
                        </div>

                        {/* ADD TO MANUAL COLLECTION */}
                        <div className="mt-3 border-t border-black pt-2">
                          <span className="mb-1 block text-[11px] font-black uppercase">
                            Add to collection:
                          </span>
                          <select
                            className="neo-copy mb-1 w-full border-2 border-black bg-[#f4ead8] p-1 text-[10px] font-bold outline-none"
                            onChange={(e) => {
                              if (!e.target.value) return;
                              const col = e.target.value;
                              setManualCollections((prev) => {
                                const currentIds = prev[col] || [];
                                return {
                                  ...prev,
                                  [col]: Array.from(new Set([...currentIds, ...variantIds])),
                                };
                              });
                              e.target.value = "";
                            }}
                          >
                            <option value="">-- Choose Collection --</option>
                            {Object.keys(manualCollections).map((col) => (
                              <option key={col} value={col}>
                                {col}
                              </option>
                            ))}
                          </select>
                          <div className="mb-2 flex gap-1">
                            <input
                              type="text"
                              placeholder="New collection..."
                              id="newManualColInput"
                              className="neo-copy h-7 flex-1 border-2 border-black bg-[#f4ead8] px-2 text-[10px] font-bold outline-none"
                            />
                            <button
                              onClick={() => {
                                const input = document.getElementById(
                                  "newManualColInput",
                                ) as HTMLInputElement;
                                if (!input || !input.value.trim()) return;
                                const col = input.value.trim();
                                setManualCollections((prev) => {
                                  const currentIds = prev[col] || [];
                                  return {
                                    ...prev,
                                    [col]: Array.from(new Set([...currentIds, ...variantIds])),
                                  };
                                });
                                input.value = "";
                              }}
                              className="border-2 border-black bg-black px-2 text-[10px] font-black uppercase text-white hover:bg-[#2c2c2c]"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>

              {isControllerPanelOpen ? (
                <section className="border-b-4 border-black bg-[#efe3cf] p-3 sm:p-4">
                  <ControllerLayoutEditor
                    compact
                    devices={controllerDevices}
                    gameId={enrichedSelectedGame.id}
                    gameTitle={enrichedSelectedGame.title}
                  />
                </section>
              ) : null}

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
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h2 className="text-[15px] font-black uppercase leading-none">Activity</h2>
                      <span className="neo-copy border-2 border-black bg-[#f3e8d7] px-2 py-0.5 text-[10px] font-black uppercase text-[#55504a]">
                        Game Updates
                      </span>
                    </div>

                    <GameUpdateFeed game={enrichedSelectedGame} />
                  </section>

                  {/* Right Column: RICH METADATA & Hardware cards */}
                  <aside className="space-y-4">
                    <section className="border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]">
                      <div className="flex items-center justify-between gap-2 border-b-2 border-black px-3 py-2">
                        <h2 className="text-[15px] font-black uppercase leading-none">
                          Achievements
                        </h2>
                        {achievementBasisSource ? (
                          <span className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-0.5 text-[9px] font-black uppercase text-[#55504a]">
                            Basis: {achievementBasisSource}
                          </span>
                        ) : null}
                        <button
                          className="grid h-8 w-8 place-items-center border-2 border-black bg-[#fbf4e7] text-[#171411] shadow-[2px_2px_0_#171411] disabled:opacity-60"
                          type="button"
                          aria-label="Sync achievements"
                          title="Sync achievements"
                          disabled={isSyncingAchievements}
                          onClick={() => {
                            setStatusMessage("Syncing achievement providers...");
                            void handleSyncAchievements();
                          }}
                        >
                          <Trophy
                            className={`h-4 w-4 ${isSyncingAchievements ? "animate-pulse" : ""}`}
                          />
                        </button>
                        <span className="neo-copy border-2 border-black bg-[#e8c843] px-2 py-0.5 text-[10px] font-black uppercase">
                          {unlockedAchievementCount}/{achievements.length} ·{" "}
                          {achievementProgressPercent}%
                        </span>
                      </div>

                      {achievements.length > 0 ? (
                        <>
                          {achievementProviderStatuses.length > 0 ? (
                            <div className="flex flex-wrap gap-1 border-b-2 border-black bg-[#efe6d4] px-2 py-1.5">
                              {achievementProviderStatuses.map((provider) => (
                                <span
                                  key={provider.source}
                                  className={`neo-copy border-2 border-black px-1.5 py-0.5 text-[8px] font-black uppercase ${
                                    provider.status === "available"
                                      ? "bg-[#087d6d] text-white"
                                      : provider.stability === "unofficial"
                                        ? "bg-[#e8c843] text-[#171411]"
                                        : "bg-[#fbf4e7] text-[#55504a]"
                                  }`}
                                  title={provider.message}
                                >
                                  {provider.source}: {provider.status}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <div className="border-b-2 border-black bg-[#f3e8d7] px-3 py-1.5">
                            <div className="h-2 border border-black bg-[#fbf4e7]">
                              <div
                                className="h-full bg-[#c20b2f]"
                                style={{ width: `${achievementProgressPercent}%` }}
                              />
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 border-b-2 border-black bg-[#f3e8d7] px-2 py-1.5">
                            {[
                              "all",
                              "unlocked",
                              "locked",
                              ...achievementSourceFilters.map((source) => `source:${source}`),
                            ].map((key) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => setAchievementFilter(key)}
                                className={`neo-copy border-2 border-black px-2 py-0.5 text-[9px] font-black uppercase ${
                                  achievementFilter === key
                                    ? "bg-[#087d6d] text-white"
                                    : "bg-[#fbf4e7] text-[#171411] hover:bg-[#efe3cf]"
                                }`}
                              >
                                {key.startsWith("source:") ? key.slice("source:".length) : key}
                              </button>
                            ))}
                            <div className="ml-auto flex items-center gap-1">
                              <span className="neo-copy text-[9px] font-black uppercase text-[#55504a]">
                                Sort
                              </span>
                              <select
                                value={achievementSort}
                                onChange={(e) =>
                                  setAchievementSort(e.target.value as "rarity" | "name" | "date")
                                }
                                className="neo-copy border-2 border-black bg-[#fbf4e7] px-1.5 py-0.5 text-[9px] font-black uppercase"
                              >
                                <option value="rarity">Rarity</option>
                                <option value="name">Name</option>
                                <option value="date">Date</option>
                              </select>
                            </div>
                            {enrichedSelectedGame?.achievementsSyncedAt ? (
                              <span className="neo-copy w-full text-right text-[9px] font-bold uppercase text-[#55504a]">
                                Synced{" "}
                                {formatRelativeTime(enrichedSelectedGame.achievementsSyncedAt)}
                              </span>
                            ) : null}
                          </div>
                          <div className="max-h-[360px] space-y-2 overflow-y-auto p-3">
                            {filterAndSortAchievements(
                              achievements,
                              achievementFilter,
                              achievementSort,
                            ).map((achievement) => {
                              const isUnlocked = Boolean(achievement.unlockedAt);
                              const achievementMeta = achievement as AchievementWithSources;
                              const achievementSources = achievementMeta.sourceLabels ?? [];

                              return (
                                <article
                                  key={achievement.id}
                                  className={`grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-2 border-2 border-black p-2 ${
                                    isUnlocked ? "bg-[#efe3cf]" : "bg-[#f6edd8] opacity-75"
                                  }`}
                                >
                                  <div
                                    className={`grid h-[38px] w-[38px] place-items-center overflow-hidden border-2 border-black ${
                                      isUnlocked
                                        ? "bg-[#169b83] text-white"
                                        : "bg-[#d8cbb7] text-[#171411]"
                                    }`}
                                  >
                                    {achievement.iconUrl ? (
                                      <img
                                        alt=""
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                        src={achievement.iconUrl}
                                      />
                                    ) : (
                                      <Award className="h-5 w-5" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <h3 className="truncate text-[12px] font-black uppercase leading-tight">
                                      {achievement.name}
                                    </h3>
                                    {achievement.description ? (
                                      <p className="mt-1 line-clamp-2 text-[11px] font-bold leading-4 text-[#55504a]">
                                        {achievement.description}
                                      </p>
                                    ) : null}
                                    {typeof achievement.rarity === "number" ? (
                                      <p className="mt-1 text-[10px] font-black uppercase text-[#087d6d]">
                                        {achievement.rarity.toFixed(1)}% of players
                                      </p>
                                    ) : null}
                                    {achievementSources.length > 0 ? (
                                      <div className="mt-1 flex flex-wrap gap-1">
                                        {achievementSources.map((source) => (
                                          <span
                                            key={source}
                                            className="neo-copy border border-black bg-[#fbf4e7] px-1 py-0.5 text-[8px] font-black uppercase text-[#171411]"
                                          >
                                            {source}
                                          </span>
                                        ))}
                                        {achievementMeta.isAdditional ? (
                                          <span className="neo-copy border border-black bg-[#e8c843] px-1 py-0.5 text-[8px] font-black uppercase text-[#171411]">
                                            extra
                                          </span>
                                        ) : null}
                                        {achievementMeta.matchConfidence ? (
                                          <span className="neo-copy border border-black bg-[#171411] px-1 py-0.5 text-[8px] font-black uppercase text-[#fbf4e7]">
                                            {achievementMeta.matchConfidence}
                                          </span>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="flex flex-col items-end gap-1">
                                    {isUnlocked && achievement.unlockedAt ? (
                                      <span className="neo-copy text-[9px] font-bold uppercase text-[#55504a]">
                                        {formatShortDate(achievement.unlockedAt)}
                                      </span>
                                    ) : null}
                                    <div
                                      className="grid h-8 w-8 shrink-0 place-items-center"
                                      title={isUnlocked ? "Unlocked" : "Locked"}
                                    >
                                      {isUnlocked ? (
                                        <LockKeyholeOpen className="h-5 w-5 text-[#169b83]" />
                                      ) : (
                                        <LockKeyhole className="h-5 w-5 text-[#8e877e]" />
                                      )}
                                    </div>
                                  </div>
                                </article>
                              );
                            })}
                            {filterAndSortAchievements(
                              achievements,
                              achievementFilter,
                              achievementSort,
                            ).length === 0 ? (
                              <div className="py-4 text-center text-[11px] font-bold uppercase text-[#55504a]">
                                No achievements match this filter.
                              </div>
                            ) : null}
                          </div>
                        </>
                      ) : (
                        <div className="p-3 text-[12px] font-bold leading-5 text-[#55504a]">
                          No achievements synced yet. Use the trophy button above to sync
                          achievements.
                        </div>
                      )}
                    </section>

                    {/* ENRICHED METADATA INFORMATION CARD */}
                    <section
                      className="border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]"
                      style={{ fontFamily: '"Arial Narrow", Impact, sans-serif' }}
                    >
                      <h2 className="border-b-2 border-black px-3 py-2 text-[15px] font-black uppercase leading-none">
                        Metadaten & Infos
                      </h2>
                      <div className="space-y-2.5 p-3 text-[12px] font-bold">
                        <div className="flex justify-between border-b border-black/10 pb-1">
                          <span className="uppercase text-[#55504a]">Size:</span>
                          <span className="text-right font-black">
                            {enrichedSelectedGame.sizeGb
                              ? `${enrichedSelectedGame.sizeGb.toFixed(1)} GB`
                              : "Unknown"}
                          </span>
                        </div>
                        <div className="flex justify-between border-b border-black/10 pb-1">
                          <span className="uppercase text-[#55504a]">Category:</span>
                          <div className="flex items-center gap-2">
                            {enrichedSelectedGame.id.startsWith("gamepass-") && (
                              <span className="bg-[#139a82] px-1.5 py-0.5 text-[10px] font-black uppercase text-white shadow-[1px_1px_0_#000]">
                                Game Pass
                              </span>
                            )}
                            <span className="font-black capitalize">
                              {enrichedSelectedGame.productCategory || "game"}
                            </span>
                          </div>
                        </div>
                        <div className="flex justify-between border-b border-black/10 pb-1">
                          <span className="uppercase text-[#55504a]">Platform:</span>
                          <button
                            type="button"
                            onClick={() => {
                              setActivePlatformFilter(
                                enrichedSelectedGame.platform as "windows" | "macos" | "linux",
                              );
                              clearCollectionSelection();
                            }}
                            className="flex cursor-pointer select-none items-center gap-1 font-black capitalize hover:text-[#139a82] hover:underline"
                            title={`Filter by ${enrichedSelectedGame.platform}`}
                          >
                            <PlatformIcon
                              platform={enrichedSelectedGame.platform}
                              className="h-3.5 w-3.5"
                            />
                            <span className="underline decoration-dotted">
                              {enrichedSelectedGame.platform}
                            </span>
                          </button>
                        </div>
                        {enrichedSelectedGame.protonCompatible && (
                          <div className="flex justify-between border-b border-black/10 pb-1">
                            <span className="uppercase text-[#55504a]">Proton Support:</span>
                            <span className="font-black uppercase text-[#139a82]">
                              Compatible (via Proton)
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between border-b border-black/10 pb-1">
                          <span className="uppercase text-[#55504a]">Steam Deck:</span>
                          <span
                            className={`border border-black px-1.5 py-0.5 text-[10px] font-black uppercase ${
                              enrichedSelectedGame.steamDeckCompatibility === "verified"
                                ? "bg-[#139a82] text-white shadow-[1px_1px_0_#000]"
                                : enrichedSelectedGame.steamDeckCompatibility === "playable"
                                  ? "bg-[#e8c843] text-black shadow-[1px_1px_0_#000]"
                                  : enrichedSelectedGame.steamDeckCompatibility === "unsupported"
                                    ? "bg-[#b7102a] text-white shadow-[1px_1px_0_#000]"
                                    : "bg-[#efe3cf] text-black"
                            }`}
                          >
                            {enrichedSelectedGame.steamDeckCompatibility || "unknown"}
                          </span>
                        </div>
                        {enrichedSelectedGame.developer && (
                          <div className="flex justify-between border-b border-black/10 pb-1">
                            <span className="uppercase text-[#55504a]">Developer:</span>
                            <span className="text-right font-black">
                              {enrichedSelectedGame.developer}
                            </span>
                          </div>
                        )}
                        {enrichedSelectedGame.publisher && (
                          <div className="flex justify-between border-b border-black/10 pb-1">
                            <span className="uppercase text-[#55504a]">Publisher:</span>
                            <span className="text-right font-black">
                              {enrichedSelectedGame.publisher}
                            </span>
                          </div>
                        )}
                        {enrichedSelectedGame.installPath && (
                          <div className="flex flex-col gap-1 border-b border-black/10 pb-2">
                            <span className="uppercase text-[#55504a]">Install Path:</span>
                            <span className="break-all text-[10px] font-black">
                              {enrichedSelectedGame.installPath}
                            </span>
                            <button
                              onClick={() => {
                                const newPath = prompt(
                                  `Move game.\nCurrent path: ${enrichedSelectedGame.installPath}\n\nEnter the new absolute path:`,
                                );
                                if (newPath && newPath.trim() !== "") {
                                  moveGame({
                                    gameId: enrichedSelectedGame.id,
                                    newPath: newPath.trim(),
                                  })
                                    .then(() => {
                                      alert("Game moved successfully!");
                                      void runAutomaticLibrarySync(true);
                                    })
                                    .catch((err) => {
                                      alert("Failed to move game: " + err);
                                    });
                                }
                              }}
                              className="self-start border-2 border-black bg-[#169b83] px-2 py-0.5 text-[10px] font-black uppercase text-white shadow-[1px_1px_0_#000] transition hover:bg-[#138872]"
                            >
                              Move Folder
                            </button>
                          </div>
                        )}
                        {enrichedSelectedGame.releaseDate && (
                          <div className="flex justify-between border-b border-black/10 pb-1">
                            <span className="uppercase text-[#55504a]">Release:</span>
                            <span className="text-right font-black">
                              {enrichedSelectedGame.releaseDate}
                            </span>
                          </div>
                        )}
                        {enrichedSelectedGame.genres && enrichedSelectedGame.genres.length > 0 && (
                          <div className="border-b border-black/10 pb-1">
                            <span className="mb-1 block uppercase text-[#55504a]">Genres:</span>
                            <div className="flex flex-wrap gap-1">
                              {enrichedSelectedGame.genres.map((g) => (
                                <span
                                  key={g}
                                  className="border border-black bg-[#efe3cf] px-1.5 py-0.5 text-[9px] font-black uppercase"
                                >
                                  {g}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {enrichedSelectedGame.players &&
                          enrichedSelectedGame.players.length > 0 && (
                            <div>
                              <span className="mb-1 block uppercase text-[#55504a]">
                                Player Count:
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {enrichedSelectedGame.players.map((p) => (
                                  <span
                                    key={p}
                                    className="border border-black bg-[#efe3cf] px-1.5 py-0.5 text-[9px] font-black uppercase"
                                  >
                                    {p}
                                  </span>
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
                      <button
                        className="block w-full border-t-2 border-black px-3 py-2 text-right text-[11px] font-black uppercase"
                        type="button"
                      >
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
                        <button
                          className="block w-full pt-2 text-right text-[11px] font-black uppercase"
                          type="button"
                        >
                          View all friends who play
                        </button>
                      </div>
                    </section>

                    {/* Cloud Saves Panel */}
                    {enrichedSelectedGame.status === "installed" ? (
                      <CloudSavesPanel
                        game={enrichedSelectedGame}
                        onStatusMessage={setStatusMessage}
                      />
                    ) : null}
                  </aside>
                </div>
              </section>
            </>
          ) : (
            <section className="grid min-h-[calc(100vh-124px)] place-items-center border-b-4 border-black bg-[#f8f0df] px-4 text-center">
              <div className="max-w-[560px] border-4 border-black bg-[#fbf4e7] p-6 shadow-[4px_4px_0_#171411]">
                <h1 className="text-[clamp(2.4rem,12vw,4rem)] font-black uppercase leading-none">
                  No Games Detected
                </h1>
                <p className="neo-copy mt-4 text-[13px] font-bold uppercase leading-6 text-[#55504a]">
                  {isDiscoveringGames ? "Loading library..." : discoveryMessage}
                </p>
                <p className="neo-copy mt-3 text-[11px] font-bold uppercase leading-5 text-[#55504a]">
                  Auto-sync watches Steam, Epic Games, GOG, Ubisoft, Xbox, Battle.net, and EA App
                  installations on this PC.
                </p>
              </div>
            </section>
          )}
        </main>
        <LibraryCustomScrollbar targetRef={detailScrollRef} />
      </div>
      <ConfirmDialog
        cancelLabel="Keep Installed"
        confirmLabel={isUninstalling ? "Uninstalling..." : "Uninstall"}
        destructive
        message={
          uninstallError
            ? `Failed to start uninstaller: ${uninstallError}`
            : `This will remove ${enrichedSelectedGame?.title ?? "this game"} and any managed install files. This action cannot be undone.`
        }
        open={isUninstallDialogOpen}
        title={uninstallError ? "Uninstall Failed" : "Uninstall Game?"}
        onCancel={() => {
          if (isUninstalling) return;
          setIsUninstallDialogOpen(false);
          setUninstallError(null);
        }}
        onConfirm={handleUninstallConfirm}
      />
    </>
  );
}
