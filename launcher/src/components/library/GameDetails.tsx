import {
  Play,
  Settings,
  Heart,
  Cloud,
  Clock as Clock3,
  Download,
  Gamepad2,
  CircleHelp,
  Award,
  LockKeyhole,
  LockKeyholeOpen
} from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Game } from "../../lib/types";
import { Metric } from "./Metric";
import { LibraryCustomScrollbar } from "./LibraryCustomScrollbar";
import { PlatformIcon } from "./PlatformIcons";
import {
  formatAchievementProgress,
  formatPlayTime,
  formatLastPlayed,
  getFallbackBannerClass,
  getGameLogoCandidates,
  getGameSource,
  getLogoPositionClass,
  getLogoPlacementStyle,
} from "../../lib/formatters";
import { getGameAssetUrl, getGameBannerStyle } from "../../lib/assets";
import { uninstallGame } from "../../lib/launcher";
import { useDownloadStore } from "../../stores/downloadStore";

export interface GameDetailsProps {
  selectedGame: Game | null;
  enrichedSelectedGame: Game | null;
  shouldShowLibraryLoading: boolean;
  handlePlay: () => void;
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
  detailScrollRef: React.RefObject<HTMLElement>;
  isDiscoveringGames: boolean;
  discoveryMessage: string | null;
  moveGame: (opts: { gameId: string, newPath: string }) => Promise<void>;
  runAutomaticLibrarySync: (force: boolean) => Promise<void>;
}

export function GameDetails({
  selectedGame,
  enrichedSelectedGame,
  shouldShowLibraryLoading,
  handlePlay,
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
  runAutomaticLibrarySync
}: GameDetailsProps) {

  // Local state that was originally in LibraryPage
  const [isSettingsPopoverOpen, setIsSettingsPopoverOpen] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const achievements = enrichedSelectedGame?.achievements ?? [];
  const unlockedAchievementCount = achievements.filter((achievement) => achievement.unlockedAt).length;

  const navigate = useNavigate();
  const downloadItems = useDownloadStore((s) => s.items);
  const activeDownload = enrichedSelectedGame
    ? downloadItems.find(
        (d) => d.gameId === enrichedSelectedGame.id && (d.status === "downloading" || d.status === "paused"),
      )
    : null;

  // Close popovers on game switch
  useEffect(() => {
    setIsSettingsPopoverOpen(false);
    setNewCategoryInput("");
  }, [selectedGame?.id]);

  return (
    <div className="library-scroll-frame relative z-10 min-h-0 min-w-0">
          <main ref={detailScrollRef} className="library-detail-scroll h-full min-h-0 min-w-0 overflow-x-hidden overflow-y-auto">
          {shouldShowLibraryLoading ? (
            <section className="grid min-h-[calc(100vh-124px)] place-items-center border-b-4 border-black bg-[#efe3cf] px-4 text-center" style={{ fontFamily: '"Arial Narrow", Impact, sans-serif' }}>
              <div className="max-w-[560px] border-4 border-black bg-[#fbf4e7] p-8 shadow-[8px_8px_0_#171411]">
                <Settings className="mx-auto mb-4 h-10 w-10 animate-[spin_4s_linear_infinite] text-[#087d6d]" />
                <h2 className="neo-title text-3xl mb-2 uppercase text-[#171411]">LOADING LIBRARY</h2>
                <div className="neo-dots h-1.5 w-12 bg-black mx-auto mb-4" />
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
                        className="neo-copy h-9 border-2 border-black bg-[#171411] px-3 text-[10px] font-bold uppercase text-white hover:bg-[#333] transition-colors"
                        type="button"
                        onClick={() => navigate("/downloads")}
                      >
                        View in Downloads
                      </button>
                    </div>
                  ) : enrichedSelectedGame.status === "not_installed" ? (
                    <button
                      className="flex h-[64px] min-w-0 flex-1 items-center justify-center gap-3 border-4 border-black bg-[#b7102a] px-5 text-[22px] font-black uppercase text-white shadow-[3px_3px_0_#171411] sm:min-w-[205px] sm:flex-none sm:text-[26px] hover:bg-[#990a20] transition-colors"
                      type="button"
                      onClick={() => void handlePlay()}
                    >
                      <Download className="h-7 w-7" />
                      Install
                    </button>
                  ) : (
                    <button
                      className="flex h-[64px] min-w-0 flex-1 items-center justify-center gap-3 border-4 border-black bg-[#169b83] px-5 text-[22px] font-black uppercase text-white shadow-[3px_3px_0_#171411] sm:min-w-[205px] sm:flex-none sm:text-[26px]"
                      type="button"
                      onClick={() => void handlePlay()}
                    >
                      <Play className="h-7 w-7 fill-current" />
                      Play
                    </button>
                  )}
                  {enrichedSelectedGame.cloudGamingUrl && (
                    <a
                      href={enrichedSelectedGame.cloudGamingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-[64px] min-w-0 flex-1 items-center justify-center gap-2 border-4 border-black bg-[#0d8544] px-3 text-[18px] font-black uppercase text-white shadow-[3px_3px_0_#171411] hover:bg-[#0a6634] transition-colors"
                    >
                      <Cloud className="h-6 w-6" />
                      Play via Cloud
                    </a>
                  )}
                </div>

                <div className="grid min-w-[260px] flex-[999_1_420px] gap-3 sm:grid-cols-2 2xl:grid-cols-[repeat(4,minmax(130px,1fr))]">
                  <Metric icon={<Cloud className="h-7 w-7 fill-black text-black" />} title="Cloud" value="Up to date" />
                  <Metric icon={<Clock3 className="h-7 w-7" />} title="Last Played" value={formatLastPlayed(enrichedSelectedGame.lastPlayed ?? enrichedSelectedGame.lastPlayedAt)} />
                  <Metric icon={<Clock3 className="h-7 w-7" />} title="Play Time" value={formatPlayTime(enrichedSelectedGame.playtimeMinutes)} />
                  <Metric icon={<Award className="h-7 w-7 fill-black text-black" />} title="Achievements" value={formatAchievementProgress(enrichedSelectedGame)} />
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
                      <Settings className="h-6 w-6" />
                    </button>

                    {isSettingsPopoverOpen ? (
                      <div className="absolute left-0 top-12 z-50 w-64 border-4 border-black bg-[#fbf4e7] p-3 shadow-[5px_5px_0_#171411]" style={{ fontFamily: '"Arial Narrow", Impact, sans-serif' }}>
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
                            {hiddenGames[enrichedSelectedGame.id] === true ? "Hidden" : "Hide Game"}
                          </button>
                        </div>

                        {/* UNINSTALL GAME */}
                        {enrichedSelectedGame.status === "installed" && (
                          <div className="mb-3 border-b border-black pb-3">
                            <button
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to uninstall ${enrichedSelectedGame.title}?`)) {
                                  uninstallGame(enrichedSelectedGame.id)
                                    .then(() => {
                                      setStatusMessage("Uninstall process started. Library will sync automatically.");
                                      void runAutomaticLibrarySync(true);
                                    })
                                    .catch(err => alert("Failed to start uninstaller: " + err));
                                }
                              }}
                              className="w-full border-2 border-black bg-[#b7102a] text-white py-1 text-[10px] font-black uppercase hover:bg-[#990a20] transition shadow-[1px_1px_0_#000]"
                            >
                              Uninstall Game
                            </button>
                          </div>
                        )}

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
                                    x
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] italic text-gray-500">Keine Kategorien zugewiesen.</p>
                          )}
                        </div>

                        {/* ADD TO MANUAL COLLECTION */}
                        <div className="mt-3 border-t border-black pt-2">
                          <label className="block text-[11px] font-black uppercase mb-1">
                            Add to collection:
                          </label>
                          <select
                            className="neo-copy w-full border-2 border-black bg-[#f4ead8] p-1 text-[10px] font-bold outline-none mb-1"
                            onChange={(e) => {
                              if (!e.target.value) return;
                              const col = e.target.value;
                              setManualCollections(prev => {
                                const currentIds = prev[col] || [];
                                if (!currentIds.includes(enrichedSelectedGame.id)) {
                                  return { ...prev, [col]: [...currentIds, enrichedSelectedGame.id] };
                                }
                                return prev;
                              });
                              e.target.value = "";
                            }}
                          >
                            <option value="">-- Choose Collection --</option>
                            {Object.keys(manualCollections).map(col => (
                              <option key={col} value={col}>{col}</option>
                            ))}
                          </select>
                          <div className="flex gap-1 mb-2">
                            <input
                              type="text"
                              placeholder="New collection..."
                              id="newManualColInput"
                              className="neo-copy h-7 flex-1 border-2 border-black bg-[#f4ead8] px-2 text-[10px] font-bold outline-none"
                            />
                            <button
                              onClick={() => {
                                const input = document.getElementById("newManualColInput") as HTMLInputElement;
                                if (!input || !input.value.trim()) return;
                                const col = input.value.trim();
                                setManualCollections(prev => {
                                  const currentIds = prev[col] || [];
                                  if (!currentIds.includes(enrichedSelectedGame.id)) {
                                    return { ...prev, [col]: [...currentIds, enrichedSelectedGame.id] };
                                  }
                                  return prev;
                                });
                                input.value = "";
                              }}
                              className="border-2 border-black bg-black text-white hover:bg-[#2c2c2c] px-2 text-[10px] font-black uppercase"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <button
                    className="grid h-10 w-10 place-items-center border-4 border-black bg-[#fbf4e7] hover:bg-[#efe3cf] transition disabled:cursor-not-allowed disabled:opacity-55"
                    type="button"
                    aria-label="Sync achievements"
                    title="Sync achievements"
                    disabled={isSyncingAchievements}
                    onClick={() => {
                      setStatusMessage("Syncing Steam achievements...");
                      void handleSyncAchievements();
                    }}
                  >
                    <Award className={`h-6 w-6 ${isSyncingAchievements ? "animate-pulse" : ""}`} />
                  </button>

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
                    onClick={() => alert(`Support: Visit the support page for ${enrichedSelectedGame.title}.`)}
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
                    <section className="border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]">
                      <div className="flex items-center justify-between gap-2 border-b-2 border-black px-3 py-2">
                        <h2 className="text-[15px] font-black uppercase leading-none">
                          Achievements
                        </h2>
                        <span className="neo-copy border-2 border-black bg-[#e8c843] px-2 py-0.5 text-[10px] font-black uppercase">
                          {unlockedAchievementCount}/{achievements.length}
                        </span>
                      </div>

                      {achievements.length > 0 ? (
                        <div className="max-h-[360px] space-y-2 overflow-y-auto p-3">
                          {achievements.map((achievement) => {
                            const isUnlocked = Boolean(achievement.unlockedAt);

                            return (
                              <article
                                key={achievement.id}
                                className={`grid grid-cols-[38px_minmax(0,1fr)_32px] items-center gap-2 border-2 border-black p-2 ${
                                  isUnlocked ? "bg-[#efe3cf]" : "bg-[#f6edd8] opacity-75"
                                }`}
                              >
                                <div className={`grid h-[38px] w-[38px] place-items-center overflow-hidden border-2 border-black ${
                                  isUnlocked ? "bg-[#169b83] text-white" : "bg-[#d8cbb7] text-[#171411]"
                                }`}>
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
                                </div>
                                <div className="grid h-8 w-8 place-items-center shrink-0" title={isUnlocked ? "Unlocked" : "Locked"}>
                                  {isUnlocked ? (
                                    <LockKeyholeOpen className="h-5 w-5 text-[#169b83]" />
                                  ) : (
                                    <LockKeyhole className="h-5 w-5 text-[#8e877e]" />
                                  )}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-3 text-[12px] font-bold leading-5 text-[#55504a]">
                          No achievements synced yet. Use the trophy button above to sync Steam achievements.
                        </div>
                      )}
                    </section>

                    {/* ENRICHED METADATA INFORMATION CARD */}
                    <section className="border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]" style={{ fontFamily: '"Arial Narrow", Impact, sans-serif' }}>
                      <h2 className="border-b-2 border-black px-3 py-2 text-[15px] font-black uppercase leading-none">
                        Metadaten & Infos
                      </h2>
                      <div className="p-3 space-y-2.5 text-[12px] font-bold">
                        <div className="flex justify-between border-b border-black/10 pb-1">
                          <span className="text-[#55504a] uppercase">Size:</span>
                          <span className="font-black text-right">{enrichedSelectedGame.sizeGb ? `${enrichedSelectedGame.sizeGb.toFixed(1)} GB` : "Unbekannt"}</span>
                        </div>
                        <div className="flex justify-between border-b border-black/10 pb-1">
                          <span className="text-[#55504a] uppercase">Kategorie:</span>
                          <div className="flex items-center gap-2">
                            {enrichedSelectedGame.id.startsWith("gamepass-") && (
                              <span className="bg-[#139a82] text-white px-1.5 py-0.5 text-[10px] font-black uppercase shadow-[1px_1px_0_#000]">
                                Game Pass
                              </span>
                            )}
                            <span className="font-black capitalize">{enrichedSelectedGame.productCategory || "game"}</span>
                          </div>
                        </div>
                        <div className="flex justify-between border-b border-black/10 pb-1">
                          <span className="text-[#55504a] uppercase">Plattform:</span>
                          <button
                            type="button"
                            onClick={() => {
                              setActivePlatformFilter(enrichedSelectedGame.platform as "windows" | "macos" | "linux");
                              clearCollectionSelection();
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
                        {enrichedSelectedGame.developer && (
                          <div className="flex justify-between border-b border-black/10 pb-1">
                            <span className="text-[#55504a] uppercase">Developer:</span>
                            <span className="font-black text-right">{enrichedSelectedGame.developer}</span>
                          </div>
                        )}
                        {enrichedSelectedGame.publisher && (
                          <div className="flex justify-between border-b border-black/10 pb-1">
                            <span className="text-[#55504a] uppercase">Publisher:</span>
                            <span className="font-black text-right">{enrichedSelectedGame.publisher}</span>
                          </div>
                        )}
                        {enrichedSelectedGame.installPath && (
                          <div className="flex flex-col gap-1 border-b border-black/10 pb-2">
                            <span className="text-[#55504a] uppercase">Install Path:</span>
                            <span className="font-black break-all text-[10px]">{enrichedSelectedGame.installPath}</span>
                            <button
                              onClick={() => {
                                const newPath = prompt(`Move game.\nCurrent path: ${enrichedSelectedGame.installPath}\n\nEnter the new absolute path:`);
                                if (newPath && newPath.trim() !== "") {
                                  moveGame({ gameId: enrichedSelectedGame.id, newPath: newPath.trim() })
                                    .then(() => {
                                      alert("Game moved successfully!");
                                      void runAutomaticLibrarySync(true);
                                    })
                                    .catch((err) => {
                                      alert("Failed to move game: " + err);
                                    });
                                }
                              }}
                              className="self-start border-2 border-black bg-[#169b83] text-white px-2 py-0.5 text-[10px] font-black uppercase hover:bg-[#138872] transition shadow-[1px_1px_0_#000]"
                            >
                              Move Folder
                            </button>
                          </div>
                        )}
                        {enrichedSelectedGame.releaseDate && (
                          <div className="flex justify-between border-b border-black/10 pb-1">
                            <span className="text-[#55504a] uppercase">Release:</span>
                            <span className="font-black text-right">{enrichedSelectedGame.releaseDate}</span>
                          </div>
                        )}
                        {enrichedSelectedGame.genres && enrichedSelectedGame.genres.length > 0 && (
                          <div className="border-b border-black/10 pb-1">
                            <span className="text-[#55504a] uppercase block mb-1">Sizenres:</span>
                            <div className="flex flex-wrap gap-1">
                              {enrichedSelectedGame.genres.map(g => (
                                <span key={g} className="bg-[#efe3cf] border border-black px-1.5 py-0.5 text-[9px] uppercase font-black">{g}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {enrichedSelectedGame.players && enrichedSelectedGame.players.length > 0 && (
                          <div>
                            <span className="text-[#55504a] uppercase block mb-1">Player Count:</span>
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
                  No Games Detected
                </h1>
                <p className="neo-copy mt-4 text-[13px] font-bold uppercase leading-6 text-[#55504a]">
                  {isDiscoveringGames
                    ? "Loading library..."
                    : discoveryMessage}
                </p>
                <p className="neo-copy mt-3 text-[11px] font-bold uppercase leading-5 text-[#55504a]">
                  Auto-sync watches Steam, Epic Games, GOG, Ubisoft, Xbox, Battle.net, and EA App installations on this PC.
                </p>
              </div>
            </section>
          )}
          </main>
          <LibraryCustomScrollbar targetRef={detailScrollRef} />
        </div>
  );
}
