import {
  Play,
  Settings,
  Heart,
  Cloud,
  Clock as Clock3,
  Download,
  PackagePlus,
  CircleHelp,
  Award,
  LockKeyhole,
  LockKeyholeOpen,
  ImagePlus,
  Loader2,
  RotateCcw,
  FolderOpen,
  Power,
  ExternalLink,
  History,
  Layers,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  ClientAssetCacheLookup,
  ClientAutoApplyPlan,
  ClientInstallerMetadata,
  ClientInstallStageCheck,
  ClientInstallStagePlan,
  ClientModificationConfig,
  ClientUpdateStatus,
  Game,
  GameRuntimeStatus,
  PlatformClientHealth,
  PlatformClientLifecycleEvent,
  UnifiedAchievement,
} from "../../lib/types";
import {
  hasCustomArtwork,
  type CustomArtworkKind,
  type GameCustomArtwork,
} from "../../lib/custom-artwork";
import { Metric } from "./Metric";
import { LibraryCustomScrollbar } from "./LibraryCustomScrollbar";
import { PlatformSourceIcon } from "./PlatformIcons";
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
  getSourceDisplayLabel,
} from "../../lib/formatters";
import { getGameAssetUrl, getGameBannerStyle } from "../../lib/assets";
import { getAchievementProviderStatusMessage } from "../../lib/achievement-status";
import { MODS_PAGE_ENABLED } from "../../lib/feature-flags";
import {
  buildClientPathOverlayPreflight,
  type ClientPathOverlayPreflight,
  type ClientPathOverlayPreflightStatus,
} from "../../lib/client-path-overlay-preflight";
import {
  checkPlatformClientUpdate,
  getPlatformClientAssetCacheLookup,
  getPlatformClientInstallerMetadata,
  getPlatformClientModificationConfig,
  getPlatformClientUpdateStatus,
  openPlatformClientInstaller,
  openPlatformClientUpdater,
  openExternalUrl,
  pollPlatformClientHealth,
  previewPlatformClientAutoApply,
  previewPlatformClientInstall,
  getGameActionCapabilities,
  prepareGameActionConfirmation,
  runGameAction,
  savePlatformClientModificationConfig,
  toClientPlatformId,
} from "../../lib/launcher";
import {
  resolveGroupGameActionCapabilities,
  resolveGroupSelectionState,
  resolveOfficialSupportDestination,
  resolveSelectedCopyActionCapabilities,
  type GameAction,
  type GameActionCapability,
  type GameActionOutcome,
  type GameActionResult,
  type GameActionRuntimeContext,
} from "../../lib/game-actions";
import { isLiveDownloadItem, useDownloadStore } from "../../stores/downloadStore";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { CrossPlayBadge } from "./CrossPlayBadge";
import { getCrossPlayPlatforms } from "../../lib/supabase/crossplay";
import type { CrossPlayPlatform } from "../../lib/types/crossplay";
const CrossStoreSaveMigrationReadinessPanel = React.lazy(() =>
  import("./GameDetails/CrossStoreSaveMigrationReadinessPanel").then((m) => ({
    default: m.CrossStoreSaveMigrationReadinessPanel,
  })),
);
const CrossStoreSaveSyncPlanner = React.lazy(() =>
  import("./GameDetails/CrossStoreSaveSyncPlanner").then((m) => ({
    default: m.CrossStoreSaveSyncPlanner,
  })),
);
const HostedCommunityArtworkReadinessPanel = React.lazy(() =>
  import("./GameDetails/HostedCommunityArtworkReadinessPanel").then((m) => ({
    default: m.HostedCommunityArtworkReadinessPanel,
  })),
);
const HostedCommunityArtworkModeratorConsolePanel = React.lazy(() =>
  import("./GameDetails/HostedCommunityArtworkModeratorConsolePanel").then((m) => ({
    default: m.HostedCommunityArtworkModeratorConsolePanel,
  })),
);
const IgdbCrossPlayReadinessPanel = React.lazy(() =>
  import("./GameDetails/IgdbCrossPlayReadinessPanel").then((m) => ({
    default: m.IgdbCrossPlayReadinessPanel,
  })),
);
import { GameUpdateFeed } from "./GameUpdateFeed";
import { ArtworkPreviewModal } from "./ArtworkPreviewModal";
import type { CrossStoreSaveMigrationReadiness } from "../../lib/cross-store-save-migration-readiness";
import type { CrossStoreSaveSyncPlan } from "../../lib/cross-store-save-sync-planner";
import type { HostedCommunityArtworkReadiness } from "../../lib/hosted-community-artwork-readiness";
import type { HostedCommunityArtworkModerationConsole } from "../../lib/hosted-community-artwork-moderation-console";
import type { IgdbCrossPlayReadinessPlan } from "../../lib/igdb-cross-play-readiness";

type AchievementWithSources = UnifiedAchievement & {
  sourceLabels?: string[];
  canonicalSource?: string;
  matchConfidence?: string;
  isAdditional?: boolean;
};

const EMPTY_GAME_VARIANTS: Game[] = [];

type NativeGameActionCapabilities = Partial<Record<GameAction, GameActionCapability>>;

interface PendingGameAction {
  action: GameAction;
  capability: GameActionCapability;
  gameId: string;
  provider: string;
  title: string;
}

type SelectedGameActionBinding = Pick<PendingGameAction, "gameId" | "provider" | "title">;

function unavailableNativeCapability(
  action: GameAction,
  label: string,
  reason: string,
): GameActionCapability {
  return {
    action,
    available: false,
    completionObservable: false,
    destructive:
      action === "repair" ||
      action === "update" ||
      action === "uninstall" ||
      action === "remove_from_library",
    label,
    mode: "not_applicable",
    reason,
    requiresConfirmation: false,
  };
}

function gameActionOutcomeLabel(outcome: GameActionOutcome): string {
  switch (outcome) {
    case "completed":
      return "Completed";
    case "handoff_required":
      return "Handoff required";
    case "not_needed":
      return "Not needed";
    case "blocked":
      return "Blocked";
    case "failed":
      return "Failed";
  }
}

function gameActionOutcomeClasses(outcome: GameActionOutcome): string {
  switch (outcome) {
    case "completed":
      return "bg-[#8cf5e4] text-[#171411]";
    case "handoff_required":
    case "not_needed":
      return "bg-[#e8c843] text-[#171411]";
    case "blocked":
    case "failed":
      return "bg-[#b7102a] text-white";
  }
}

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

function formatScheduleTime(iso: string | null | undefined): string {
  if (!iso) return "not scheduled";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "unknown";
  const diff = then - Date.now();
  if (diff <= 0) return "due now";
  const minutes = Math.ceil(diff / 60_000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.ceil(hours / 24);
  if (days < 30) return `in ${days}d`;
  return new Date(then).toLocaleDateString();
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "2-digit", month: "short", day: "2-digit" });
}

function formatRuntimeDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds < 0) return null;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0 ? `${hours}h ${restMinutes}m` : `${hours}h`;
}

function formatLastInputLabel(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds < 0) return null;
  if (seconds < 10) return "Input active";
  const duration = formatRuntimeDuration(seconds);
  return duration ? `Input ${duration}` : null;
}

function runtimeMetadataLabel(input: {
  pid?: number | null;
  processName?: string | null;
  uptimeSeconds?: number | null;
  windowHandle?: string | null;
  windowTitle?: string | null;
}): string | null {
  const duration = formatRuntimeDuration(input.uptimeSeconds);
  const windowLabel = runtimeWindowLabel(input);
  const parts = [
    input.processName,
    duration,
    input.pid ? `PID ${input.pid}` : null,
    windowLabel,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : null;
}

function runtimeWindowLabel(input: {
  windowHandle?: string | null;
  windowTitle?: string | null;
}): string | null {
  const title = input.windowTitle?.trim();
  const handle = input.windowHandle?.trim();
  if (title && handle) return `Window ${title} (${handle})`;
  if (title) return `Window ${title}`;
  if (handle) return `Window ${handle}`;
  return null;
}

function clientUpdateClasses(updateStatus: ClientUpdateStatus | null) {
  if (!updateStatus) {
    return "bg-[#fbf4e7] text-[#655f58]";
  }
  if (!updateStatus.installed || updateStatus.updateAvailable) {
    return "bg-[#b7102a] text-white";
  }
  if (updateStatus.statusLabel === "Current") {
    return "bg-[#087d6d] text-white";
  }
  return "bg-[#e8c843] text-[#171411]";
}

function clientInstallStageClasses(plan: ClientInstallStagePlan | null) {
  if (!plan) {
    return "bg-[#fbf4e7] text-[#655f58]";
  }
  if (plan.stage === "localInstaller") {
    return "bg-[#087d6d] text-white";
  }
  if (plan.stage === "officialDownload") {
    return "bg-[#e8c843] text-[#171411]";
  }
  return "bg-[#b7102a] text-white";
}

function clientInstallStageLabel(plan: ClientInstallStagePlan | null) {
  if (!plan) return "Loading";
  switch (plan.stage) {
    case "alreadyInstalled":
      return "Detected";
    case "localInstaller":
      return "Local staged";
    case "officialDownload":
      return "Official source";
    case "desktopOnly":
      return "Desktop only";
    default:
      return "Blocked";
  }
}

function clientInstallCheckClasses(status: ClientInstallStageCheck["status"]) {
  switch (status) {
    case "pass":
      return "bg-[#087d6d] text-white";
    case "warning":
      return "bg-[#e8c843] text-[#171411]";
    default:
      return "bg-[#b7102a] text-white";
  }
}

function clientInstallTarget(plan: ClientInstallStagePlan | null) {
  return plan?.targetPath ?? plan?.targetUri ?? "No safe target";
}

function clientAutoApplyClasses(plan: ClientAutoApplyPlan | null) {
  if (!plan) {
    return "bg-[#fbf4e7] text-[#655f58]";
  }
  if (plan.canAutoApply || plan.stage === "ready") {
    return "bg-[#087d6d] text-white";
  }
  if (plan.stage === "noUpdate" || plan.stage === "safeOpenOnly" || plan.stage === "policyOff") {
    return "bg-[#e8c843] text-[#171411]";
  }
  return "bg-[#b7102a] text-white";
}

function clientAutoApplyLabel(plan: ClientAutoApplyPlan | null) {
  if (!plan) return "Loading";
  switch (plan.stage) {
    case "policyOff":
      return "Policy off";
    case "noUpdate":
      return "No update";
    case "safeOpenOnly":
      return "Open only";
    case "ready":
      return "Ready";
    case "desktopOnly":
      return "Desktop only";
    case "unsupported":
      return "Unsupported";
    default:
      return "Blocked";
  }
}

function clientPathOverlayPreflightClasses(status: ClientPathOverlayPreflightStatus): string {
  switch (status) {
    case "ready":
      return "bg-[#087d6d] text-white";
    case "warning":
      return "bg-[#8cf5e4] text-[#171411]";
    case "blocked":
      return "bg-[#b7102a] text-white";
    case "empty":
    default:
      return "bg-[#fbf4e7] text-[#655f58]";
  }
}

function clientPathOverlayPreflightLabel(status: ClientPathOverlayPreflightStatus): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "warning":
      return "Review";
    case "blocked":
      return "Blocked";
    case "empty":
    default:
      return "Empty";
  }
}

function clientPathOverlayCheckClasses(status: "pass" | "warning" | "blocked"): string {
  switch (status) {
    case "pass":
      return "bg-[#087d6d] text-white";
    case "warning":
      return "bg-[#8cf5e4] text-[#171411]";
    case "blocked":
    default:
      return "bg-[#b7102a] text-white";
  }
}

function clientUpdatePolicyLabel(policy: ClientModificationConfig["updatePolicy"] | string | null) {
  switch (policy) {
    case "notifyOnly":
      return "Notify only";
    case "openClient":
      return "Open client";
    case "autoApply":
      return "Auto apply";
    default:
      return "Manual";
  }
}

function clientManagerActionLabel(action: string): string {
  switch (action) {
    case "installer_opened":
      return "Installer";
    case "updater_opened":
      return "Updater";
    case "update_checked":
      return "Check";
    case "scheduled_update_checked":
      return "Scheduled Check";
    default:
      return action.replace(/_/g, " ");
  }
}

function clientManagerHistoryStatusLabel(status: string): string {
  switch (status) {
    case "auto_opened":
      return "Auto-opened";
    case "auto_open_failed":
      return "Auto-open failed";
    case "auto_apply_blocked":
      return "Auto-apply blocked";
    case "auto_applied":
      return "Auto-applied";
    default:
      return status;
  }
}

function clientDraftEntryId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeEmptyPathOverlay(index: number): ClientModificationConfig["pathOverlays"][number] {
  return {
    enabled: true,
    id: clientDraftEntryId("overlay"),
    label: `Overlay ${index + 1}`,
    notes: "",
    readOnly: true,
    sourcePath: "",
    targetPath: "",
  };
}

function makeEmptyModRoot(index: number): ClientModificationConfig["modRoots"][number] {
  return {
    enabled: true,
    id: clientDraftEntryId("mod-root"),
    kind: "mods",
    label: `Mod Root ${index + 1}`,
    path: "",
  };
}

function makeEmptyAssetCache(index: number): ClientModificationConfig["assetCaches"][number] {
  return {
    cacheKey: "",
    cachePath: "",
    enabled: true,
    id: clientDraftEntryId("asset-cache"),
    label: `Asset Cache ${index + 1}`,
    notes: "",
    priority: 50,
  };
}

function makeEmptyClientConfig(platformId: NonNullable<ReturnType<typeof toClientPlatformId>>) {
  return {
    assetCaches: [],
    displayName: platformId.toUpperCase(),
    latestKnownVersion: null,
    localInstallerPath: "",
    localUpdaterPath: "",
    modRoots: [],
    pathOverlays: [],
    platformId,
    updatePolicy: "manual" as const,
    updatedAt: null,
  };
}

function ClientPathOverlayPreflightPanel({ preflight }: { preflight: ClientPathOverlayPreflight }) {
  const statusClass = clientPathOverlayPreflightClasses(preflight.status);
  const statusLabel = clientPathOverlayPreflightLabel(preflight.status);

  return (
    <div
      aria-label="Path overlay apply preflight"
      className="min-w-0 border-2 border-black bg-[#efe6d4] p-2 shadow-[2px_2px_0_#171411] md:col-span-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black pb-2">
        <h4 className="neo-copy inline-flex items-center gap-1 text-[10px] font-black uppercase">
          <ShieldCheck className="h-4 w-4" />
          Path overlay apply preflight
        </h4>
        <span
          className={`neo-copy border-2 border-black px-2 py-1 text-[8px] font-black uppercase shadow-[1px_1px_0_#171411] ${statusClass}`}
        >
          {statusLabel}
        </span>
      </div>
      <div className="space-y-2 pt-2">
        <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-1.5 text-[9px] leading-4 font-black text-[#171411] uppercase">
          {preflight.message}
        </p>
        <div className="grid gap-1.5 sm:grid-cols-4">
          {[
            { label: "Enabled", value: String(preflight.enabledCount) },
            { label: "Read-only", value: String(preflight.readOnlyCount) },
            { label: "Writable", value: String(preflight.writableCount) },
            { label: "Blocked", value: String(preflight.blockedCount) },
          ].map((item) => (
            <div key={item.label} className="border-2 border-black bg-[#f6edd8] px-2 py-1">
              <span className="neo-copy block text-[8px] font-black text-[#655f58] uppercase">
                {item.label}
              </span>
              <strong className="neo-copy mt-0.5 block truncate text-[9px] font-black text-[#171411] uppercase">
                {item.value}
              </strong>
            </div>
          ))}
        </div>
        {preflight.entries.length > 0 ? (
          <div className="grid gap-2 lg:grid-cols-2">
            {preflight.entries.map((entry) => (
              <div key={entry.id} className="border-2 border-black bg-[#fbf4e7] p-2">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-black text-[#171411] uppercase">
                      {entry.label}
                    </p>
                    <p className="neo-copy mt-1 truncate text-[8px] font-bold text-[#655f58] uppercase">
                      {entry.mode === "readOnly"
                        ? "Read-only"
                        : entry.mode === "writable"
                          ? "Writable"
                          : "Disabled"}{" "}
                      // {entry.sourcePath || "No source"} -&gt; {entry.targetPath || "No target"}
                    </p>
                  </div>
                  <span
                    className={`neo-copy shrink-0 border border-black px-1.5 py-0.5 text-[7px] font-black uppercase ${clientPathOverlayPreflightClasses(
                      entry.status,
                    )}`}
                  >
                    {clientPathOverlayPreflightLabel(entry.status)}
                  </span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {entry.checks.map((check) => (
                    <div
                      className="grid grid-cols-[92px_64px_minmax(0,1fr)] items-center gap-1 border border-black bg-[#f6edd8] px-1.5 py-1"
                      key={`${entry.id}-${check.label}-${check.detail}`}
                    >
                      <span className="neo-copy truncate text-[8px] font-black text-[#171411] uppercase">
                        {check.label}
                      </span>
                      <span
                        className={`neo-copy border border-black px-1 py-0.5 text-center text-[7px] font-black uppercase ${clientPathOverlayCheckClasses(
                          check.status,
                        )}`}
                      >
                        {check.status}
                      </span>
                      <span className="neo-copy truncate text-[8px] font-bold text-[#655f58] uppercase">
                        {check.detail}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <p className="neo-copy border-2 border-black bg-[#b7102a] px-2 py-1.5 text-[9px] leading-4 font-black text-white uppercase">
          Preflight only. Real path overlay application stays gated until provider-approved mount or
          OS-safe apply support exists.
        </p>
      </div>
    </div>
  );
}

export interface GameDetailsProps {
  selectedGame: Game | null;
  enrichedSelectedGame: Game | null;
  gameVariants?: Game[];
  crossStoreSaveMigrationReadiness?: CrossStoreSaveMigrationReadiness;
  crossStoreSaveSyncPlan?: CrossStoreSaveSyncPlan;
  hostedCommunityArtworkReadiness?: HostedCommunityArtworkReadiness;
  hostedCommunityArtworkModerationConsole?: HostedCommunityArtworkModerationConsole;
  igdbCrossPlayReadinessPlan?: IgdbCrossPlayReadinessPlan;
  shouldShowLibraryLoading: boolean;
  handlePlay: () => void;
  onInstallFromProvider?: () => void;
  hasInstallableVariants?: boolean;
  isGameRunning?: boolean;
  runningGameIds?: ReadonlySet<string>;
  gameRuntime?: GameRuntimeStatus | null;
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
  detailScrollRef: React.RefObject<HTMLElement | null>;
  isDiscoveringGames: boolean;
  discoveryMessage: string | null;
  runAutomaticLibrarySync: (force: boolean) => Promise<void>;
  customArtwork: GameCustomArtwork | null;
  customArtworkByGameId?: Record<string, GameCustomArtwork>;
  artworkGameId?: string;
  onSelectCustomArtwork: (gameId: string, kind: CustomArtworkKind, file: File) => void;
  onArtworkDrop: (gameId: string, kind: CustomArtworkKind, file: File) => void;
  onConfirmArtwork: (dataUrl: string, kind: CustomArtworkKind) => void;
  onResetCustomArtwork: (gameId: string, kind?: CustomArtworkKind) => void;
  pendingArtworkFile: File | null;
  pendingArtworkKind: CustomArtworkKind;
  pendingArtworkGameId: string | null;
  openArtworkPreview: (gameId: string, kind: CustomArtworkKind, file: File) => void;
  closeArtworkPreview: () => void;
}

export function GameDetails({
  selectedGame,
  enrichedSelectedGame,
  gameVariants = EMPTY_GAME_VARIANTS,
  crossStoreSaveMigrationReadiness,
  crossStoreSaveSyncPlan,
  hostedCommunityArtworkReadiness,
  hostedCommunityArtworkModerationConsole,
  igdbCrossPlayReadinessPlan,
  shouldShowLibraryLoading,
  handlePlay,
  onInstallFromProvider,
  hasInstallableVariants = false,
  isGameRunning = false,
  runningGameIds,
  gameRuntime = null,
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
  detailScrollRef,
  isDiscoveringGames,
  discoveryMessage,
  runAutomaticLibrarySync,
  customArtwork,
  customArtworkByGameId,
  artworkGameId,
  onArtworkDrop,
  onConfirmArtwork,
  onResetCustomArtwork,
  pendingArtworkFile,
  pendingArtworkKind,
  openArtworkPreview,
  closeArtworkPreview,
}: GameDetailsProps) {
  // Local state that was originally in LibraryPage
  const [isSettingsPopoverOpen, setIsSettingsPopoverOpen] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [newCollectionInput, setNewCollectionInput] = useState("");
  const [renamingCollectionName, setRenamingCollectionName] = useState<string | null>(null);
  const [collectionRenameInput, setCollectionRenameInput] = useState("");
  const [pendingCollectionDelete, setPendingCollectionDelete] = useState<string | null>(null);
  const [achievementFilter, setAchievementFilter] = useState("all");
  const [achievementSort, setAchievementSort] = useState<"rarity" | "name" | "date">("rarity");
  const [nativeGameActionCapabilities, setNativeGameActionCapabilities] =
    useState<NativeGameActionCapabilities | null>(null);
  const [nativeGameActionCapabilitiesGameId, setNativeGameActionCapabilitiesGameId] = useState<
    string | null
  >(null);
  const [isLoadingGameActionCapabilities, setIsLoadingGameActionCapabilities] = useState(false);
  const [gameActionCapabilityError, setGameActionCapabilityError] = useState<string | null>(null);
  const [busyGameAction, setBusyGameAction] = useState<GameAction | null>(null);
  const [gameActionResult, setGameActionResult] = useState<GameActionResult | null>(null);
  const [gameActionError, setGameActionError] = useState<string | null>(null);
  const [pendingGameAction, setPendingGameAction] = useState<PendingGameAction | null>(null);
  const capabilityRequestIdRef = useRef(0);
  const selectedGameActionBindingRef = useRef<SelectedGameActionBinding | null>(null);
  const coverArtworkInputRef = useRef<HTMLInputElement>(null);
  const iconArtworkInputRef = useRef<HTMLInputElement>(null);
  const logoArtworkInputRef = useRef<HTMLInputElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const achievements = enrichedSelectedGame?.achievements ?? [];
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
  const variantsForActions = useMemo(
    () =>
      gameVariants.length > 0 ? gameVariants : enrichedSelectedGame ? [enrichedSelectedGame] : [],
    [enrichedSelectedGame, gameVariants],
  );
  const achievementAttentionStatus = achievementProviderStatuses.find(
    (provider) => provider.status !== "available",
  );
  const achievementAttentionMessage = achievementAttentionStatus
    ? getAchievementProviderStatusMessage(achievementAttentionStatus)
    : undefined;
  const variantIds = useMemo(() => variantsForActions.map((game) => game.id), [variantsForActions]);
  const variantIdKey = variantIds.join("|");
  const selectedVariant =
    variantsForActions.find((game) => game.id === selectedVariantId) ??
    variantsForActions.find((game) => game.id === enrichedSelectedGame?.id) ??
    variantsForActions[0] ??
    enrichedSelectedGame;
  const primaryArtworkGameId = selectedVariant?.id ?? artworkGameId ?? enrichedSelectedGame?.id;
  const selectedVariantArtwork = primaryArtworkGameId
    ? (customArtworkByGameId?.[primaryArtworkGameId] ?? customArtwork)
    : customArtwork;
  const handleToggleGameSettingsPopover = useCallback(() => {
    setIsSettingsPopoverOpen((current) => !current);
  }, []);
  const favoriteVariantCount = variantIds.filter((id) => favorites[id] === true).length;
  const hiddenVariantCount = variantIds.filter((id) => hiddenGames[id] === true).length;
  const favoriteSelectionState = resolveGroupSelectionState(
    variantIds,
    (id) => favorites[id] === true,
  );
  const hiddenSelectionState = resolveGroupSelectionState(
    variantIds,
    (id) => hiddenGames[id] === true,
  );
  const isGroupFavorite = favoriteSelectionState === "all";
  const isGroupHidden = hiddenSelectionState === "all";
  const favoriteScopeLabel =
    favoriteVariantCount === 0
      ? "None"
      : isGroupFavorite
        ? "All copies"
        : `${favoriteVariantCount}/${variantIds.length} copies`;
  const hiddenScopeLabel =
    hiddenVariantCount === 0
      ? "None"
      : isGroupHidden
        ? "All copies"
        : `${hiddenVariantCount}/${variantIds.length} copies`;
  const groupCategories = useMemo(
    () =>
      Array.from(
        new Set(
          (variantIdKey ? variantIdKey.split("|") : []).flatMap((id) => customCategories[id] || []),
        ),
      ),
    [customCategories, variantIdKey],
  );
  const categorySelectionState = resolveGroupSelectionState(
    variantIds,
    (id) => (customCategories[id]?.length ?? 0) > 0,
  );
  const collectionSelectionState = resolveGroupSelectionState(variantIds, (id) =>
    Object.values(manualCollections).some((gameIds) => gameIds.includes(id)),
  );
  const groupActionCapabilities = resolveGroupGameActionCapabilities(variantsForActions, {
    favorite: favoriteSelectionState,
    hidden: hiddenSelectionState,
    categories: categorySelectionState,
    collections: collectionSelectionState,
  });
  const unlockedAchievementCount = achievements.filter(
    (achievement) => achievement.unlockedAt,
  ).length;
  const achievementProgressPercent =
    achievements.length === 0
      ? 0
      : Math.round((unlockedAchievementCount / achievements.length) * 100);

  const navigate = useNavigate();
  const isDesktopRuntime = isTauri();
  const [crossPlayPlatforms, setCrossPlayPlatforms] = useState<CrossPlayPlatform[]>([]);
  const [isBannerDragOver, setIsBannerDragOver] = useState(false);
  const [clientHealth, setClientHealth] = useState<PlatformClientHealth | null>(null);
  const [isClientManagerOpen, setIsClientManagerOpen] = useState(false);
  const [clientInstallerMetadata, setClientInstallerMetadata] =
    useState<ClientInstallerMetadata | null>(null);
  const [clientInstallStagePlan, setClientInstallStagePlan] =
    useState<ClientInstallStagePlan | null>(null);
  const [clientAutoApplyPlan, setClientAutoApplyPlan] = useState<ClientAutoApplyPlan | null>(null);
  const [clientModificationConfig, setClientModificationConfig] =
    useState<ClientModificationConfig | null>(null);
  const [clientAssetCacheLookup, setClientAssetCacheLookup] =
    useState<ClientAssetCacheLookup | null>(null);
  const [clientUpdateStatus, setClientUpdateStatus] = useState<ClientUpdateStatus | null>(null);
  const [isClientManagerLoading, setIsClientManagerLoading] = useState(false);
  const [clientManagerError, setClientManagerError] = useState<string | null>(null);
  const [clientManagerBusyAction, setClientManagerBusyAction] = useState<string | null>(null);
  const selectedSourceClientId = toClientPlatformId(
    selectedVariant ? getGameSource(selectedVariant) : null,
  );
  const isSelectedVariantRunning = selectedVariant
    ? (runningGameIds?.has(selectedVariant.id) ??
      (variantsForActions.length === 1 && isGameRunning))
    : false;
  const selectedActionContext: GameActionRuntimeContext | null = selectedVariant
    ? {
        runtime: isDesktopRuntime ? "desktop" : "browser",
        operatingSystem: selectedVariant.platform,
        clientInstalled: clientHealth?.installed ?? false,
        clientLoggedIn: null,
        clientVersionFingerprint: null,
        providerAutomationAvailable: false,
        gameRunning: isSelectedVariantRunning,
      }
    : null;
  const selectedCopyActionCapabilities =
    selectedVariant && selectedActionContext
      ? resolveSelectedCopyActionCapabilities(selectedVariant, selectedActionContext)
      : null;
  const supportDestination = selectedVariant
    ? resolveOfficialSupportDestination(selectedVariant)
    : null;
  const selectedVariantGameId = selectedVariant?.id ?? null;
  const selectedVariantTitle = selectedVariant?.title ?? null;
  const selectedVariantSource = selectedVariant ? getGameSource(selectedVariant) : "unknown";
  const isOglCatalogOnly =
    enrichedSelectedGame?.status === "not_installed" &&
    selectedVariantSource === "ogl" &&
    !selectedVariant?.downloadUrl;
  const currentNativeCapabilities =
    selectedVariant && nativeGameActionCapabilitiesGameId === selectedVariant.id
      ? nativeGameActionCapabilities
      : null;
  const nativeCapabilityUnavailableReason = isLoadingGameActionCapabilities
    ? "Loading native action capabilities for the selected copy."
    : gameActionCapabilityError
      ? `Native action capabilities are unavailable: ${gameActionCapabilityError}`
      : "The desktop backend did not report this action for the selected copy.";
  const applySelectedCopySafetyGuards = (
    capability: GameActionCapability,
  ): GameActionCapability => {
    if (!capability.available) return capability;
    const requiresInstalledCopy = ["verify", "repair", "update", "uninstall"].includes(
      capability.action,
    );
    if (requiresInstalledCopy && selectedVariant?.status === "not_installed") {
      return {
        ...capability,
        available: false,
        reason: "Install this selected copy before running maintenance actions.",
        requiresConfirmation: false,
      };
    }
    if (requiresInstalledCopy && isSelectedVariantRunning) {
      return {
        ...capability,
        available: false,
        reason: "Close this selected copy before running maintenance actions.",
        requiresConfirmation: false,
      };
    }
    return capability;
  };
  const resolveDisplayedNativeCapability = (action: GameAction, label: string) =>
    applySelectedCopySafetyGuards(
      currentNativeCapabilities?.[action] ??
        unavailableNativeCapability(action, label, nativeCapabilityUnavailableReason),
    );
  const nativeRemoveCapability = currentNativeCapabilities?.remove_from_library
    ? applySelectedCopySafetyGuards(currentNativeCapabilities.remove_from_library)
    : undefined;
  const nativeUninstallCapability = currentNativeCapabilities?.uninstall
    ? applySelectedCopySafetyGuards(currentNativeCapabilities.uninstall)
    : undefined;
  const browserDestructiveCapability = (
    selectedVariantSource === "manual"
      ? selectedCopyActionCapabilities?.remove_from_library
      : selectedCopyActionCapabilities?.uninstall
  ) as GameActionCapability | undefined;
  const displayedDestructiveCapability: GameActionCapability = isDesktopRuntime
    ? nativeRemoveCapability?.available
      ? nativeRemoveCapability
      : nativeUninstallCapability?.available
        ? nativeUninstallCapability
        : selectedVariantSource === "manual"
          ? (nativeRemoveCapability ??
            resolveDisplayedNativeCapability("remove_from_library", "Remove from Library"))
          : (nativeUninstallCapability ??
            resolveDisplayedNativeCapability("uninstall", "Uninstall Selected Copy"))
    : (browserDestructiveCapability ??
      unavailableNativeCapability(
        selectedVariantSource === "manual" ? "remove_from_library" : "uninstall",
        selectedVariantSource === "manual" ? "Remove from Library" : "Uninstall Selected Copy",
        "No selected copy is available.",
      ));
  const gameActionCapabilities = selectedCopyActionCapabilities
    ? {
        support: selectedCopyActionCapabilities.support,
        update: isDesktopRuntime
          ? resolveDisplayedNativeCapability("update", "Update Selected Copy")
          : selectedCopyActionCapabilities.update,
        verify: isDesktopRuntime
          ? resolveDisplayedNativeCapability("verify", "Verify Selected Copy")
          : selectedCopyActionCapabilities.verify,
        repair: isDesktopRuntime
          ? resolveDisplayedNativeCapability("repair", "Repair Selected Copy")
          : selectedCopyActionCapabilities.repair,
        uninstall: displayedDestructiveCapability,
        clientManager: selectedCopyActionCapabilities.client_manager,
      }
    : null;
  const loadNativeGameActionCapabilities = useCallback(async (gameId: string) => {
    const requestId = ++capabilityRequestIdRef.current;
    setIsLoadingGameActionCapabilities(true);
    setGameActionCapabilityError(null);

    try {
      const capabilities = await getGameActionCapabilities(gameId);
      if (
        requestId !== capabilityRequestIdRef.current ||
        selectedGameActionBindingRef.current?.gameId !== gameId
      ) {
        return;
      }
      setNativeGameActionCapabilities(
        Object.fromEntries(
          capabilities.map((capability) => [capability.action, capability]),
        ) as NativeGameActionCapabilities,
      );
      setNativeGameActionCapabilitiesGameId(gameId);
    } catch (error) {
      if (
        requestId !== capabilityRequestIdRef.current ||
        selectedGameActionBindingRef.current?.gameId !== gameId
      ) {
        return;
      }
      setNativeGameActionCapabilities(null);
      setNativeGameActionCapabilitiesGameId(null);
      setGameActionCapabilityError(getErrorMessage(error));
    } finally {
      if (
        requestId === capabilityRequestIdRef.current &&
        selectedGameActionBindingRef.current?.gameId === gameId
      ) {
        setIsLoadingGameActionCapabilities(false);
      }
    }
  }, []);
  const gameRuntimeSourceLabel = gameRuntime?.launcher
    ? getSourceDisplayLabel(gameRuntime.launcher)
    : null;
  const isCrossSourceRuntime = Boolean(
    gameRuntimeSourceLabel &&
    gameVariants.length > 1 &&
    !gameVariants.every(
      (variant) => getSourceDisplayLabel(getGameSource(variant)) === gameRuntimeSourceLabel,
    ),
  );
  const gameRuntimeSourceBadge = gameRuntimeSourceLabel
    ? `${isCrossSourceRuntime ? "Via " : ""}${gameRuntimeSourceLabel}`
    : null;
  const gameRuntimeMetadata = gameRuntime ? runtimeMetadataLabel(gameRuntime) : null;
  const gameRuntimeInputLabel = gameRuntime
    ? formatLastInputLabel(gameRuntime.lastInputSeconds)
    : null;
  const gameRuntimeWindowLabel = gameRuntime ? runtimeWindowLabel(gameRuntime) : null;
  const gameRuntimeButtonDetail = gameRuntime
    ? [isCrossSourceRuntime ? gameRuntimeSourceBadge : null, gameRuntimeMetadata]
        .filter(Boolean)
        .join(" / ") || "Process active"
    : null;
  const selectedSourceClientName =
    clientHealth?.displayName ?? selectedSourceClientId?.toUpperCase() ?? "Source client";
  const clientUpdateHistory = clientUpdateStatus?.history ?? [];
  const clientManagerStatusClass = clientUpdateClasses(clientUpdateStatus);
  const clientInstallStageClass = clientInstallStageClasses(clientInstallStagePlan);
  const clientInstallStageStatusLabel = clientInstallStageLabel(clientInstallStagePlan);
  const clientInstallTargetValue = clientInstallTarget(clientInstallStagePlan);
  const clientAutoApplyClass = clientAutoApplyClasses(clientAutoApplyPlan);
  const clientAutoApplyStatusLabel = clientAutoApplyLabel(clientAutoApplyPlan);
  const clientAutoApplySafeTarget = clientAutoApplyPlan?.safeTargetLabel ?? "No safe apply target";
  const clientInstallActionLabel =
    clientInstallerMetadata?.installActionLabel ??
    (clientHealth?.installed ? "Open download" : "Open official download");
  const clientUpdateActionLabel = clientInstallerMetadata?.updateActionLabel ?? "Open updater";
  const selectedClientAssetCacheEntries =
    clientAssetCacheLookup?.entries.filter(
      (entry) => entry.ownerPlatformId === selectedSourceClientId,
    ) ?? [];
  const selectedClientAssetCacheConflicts =
    clientAssetCacheLookup?.conflicts.filter((conflict) =>
      conflict.entries.some((entry) => entry.ownerPlatformId === selectedSourceClientId),
    ) ?? [];
  const clientPathOverlayPreflight = useMemo(
    () => buildClientPathOverlayPreflight(clientModificationConfig),
    [clientModificationConfig],
  );
  const isClientManagerBusy = clientManagerBusyAction !== null;
  const loadClientManagerState = useCallback(async () => {
    if (!selectedSourceClientId) {
      setClientInstallerMetadata(null);
      setClientInstallStagePlan(null);
      setClientAutoApplyPlan(null);
      setClientModificationConfig(null);
      setClientAssetCacheLookup(null);
      setClientUpdateStatus(null);
      setClientManagerError(null);
      setIsClientManagerLoading(false);
      return;
    }

    setIsClientManagerLoading(true);
    setClientManagerError(null);
    try {
      const [metadata, installStagePlan, autoApplyPlan, config, updateStatus, assetLookup] =
        await Promise.all([
          getPlatformClientInstallerMetadata(selectedSourceClientId),
          previewPlatformClientInstall(selectedSourceClientId),
          previewPlatformClientAutoApply(selectedSourceClientId),
          getPlatformClientModificationConfig(selectedSourceClientId),
          getPlatformClientUpdateStatus(selectedSourceClientId),
          getPlatformClientAssetCacheLookup(),
        ]);
      setClientInstallerMetadata(metadata);
      setClientInstallStagePlan(installStagePlan);
      setClientAutoApplyPlan(autoApplyPlan);
      setClientModificationConfig(config);
      setClientUpdateStatus(updateStatus);
      setClientAssetCacheLookup(assetLookup);
    } catch (error) {
      setClientManagerError(getErrorMessage(error));
      setClientInstallerMetadata(null);
      setClientInstallStagePlan(null);
      setClientAutoApplyPlan(null);
      setClientModificationConfig(makeEmptyClientConfig(selectedSourceClientId));
      setClientAssetCacheLookup(null);
      setClientUpdateStatus(null);
    } finally {
      setIsClientManagerLoading(false);
    }
  }, [selectedSourceClientId]);
  function handleBannerDragOver(event: React.DragEvent) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsBannerDragOver(true);
  }

  function handleBannerDragLeave() {
    setIsBannerDragOver(false);
  }

  function handleBannerDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsBannerDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file && primaryArtworkGameId) {
      onArtworkDrop(primaryArtworkGameId, "cover", file);
    }
  }

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

  useEffect(() => {
    if (!selectedSourceClientId) {
      setClientHealth(null);
      return;
    }

    let cancelled = false;
    const refreshClientHealth = (maxAgeMs = 5_000) => {
      pollPlatformClientHealth({ maxAgeMs })
        .then((statuses) => {
          if (cancelled) return;
          setClientHealth(
            statuses.find((status) => status.platformId === selectedSourceClientId) ?? null,
          );
        })
        .catch(() => {
          if (cancelled) return;
          setClientHealth(null);
        });
    };

    refreshClientHealth();
    const interval = window.setInterval(() => refreshClientHealth(0), 30_000);
    const handleClientLifecycleEvent = (event: PlatformClientLifecycleEvent) => {
      if (event.platformId !== selectedSourceClientId) {
        return;
      }
      setClientHealth(event);
    };
    const unlistenClientStarted = isTauri()
      ? listen<PlatformClientLifecycleEvent>("client_started", (event) => {
          if (!cancelled) handleClientLifecycleEvent(event.payload);
        })
      : null;
    const unlistenClientStopped = isTauri()
      ? listen<PlatformClientLifecycleEvent>("client_stopped", (event) => {
          if (!cancelled) handleClientLifecycleEvent(event.payload);
        })
      : null;
    const unlistenClientWindowUpdated = isTauri()
      ? listen<PlatformClientLifecycleEvent>("client_window_updated", (event) => {
          if (!cancelled) handleClientLifecycleEvent(event.payload);
        })
      : null;
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      void unlistenClientStarted?.then((unlisten) => unlisten());
      void unlistenClientStopped?.then((unlisten) => unlisten());
      void unlistenClientWindowUpdated?.then((unlisten) => unlisten());
    };
  }, [selectedSourceClientId, selectedVariant?.id]);

  useEffect(() => {
    void loadClientManagerState();
  }, [loadClientManagerState]);

  useEffect(() => {
    if (!isSettingsPopoverOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSettingsPopoverOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSettingsPopoverOpen]);

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
    setNewCollectionInput("");
    setRenamingCollectionName(null);
    setCollectionRenameInput("");
    setPendingCollectionDelete(null);
    setPendingGameAction(null);
    setBusyGameAction(null);
    setGameActionResult(null);
    setGameActionError(null);
    setAchievementFilter("all");
    setAchievementSort("rarity");
    setIsClientManagerOpen(false);
    setClientManagerBusyAction(null);
  }, [selectedGame?.id]);

  useEffect(() => {
    const defaultVariantId =
      variantsForActions.find((game) => game.id === enrichedSelectedGame?.id)?.id ??
      variantsForActions[0]?.id ??
      null;
    setSelectedVariantId((current) =>
      current && variantsForActions.some((game) => game.id === current)
        ? current
        : defaultVariantId,
    );
  }, [enrichedSelectedGame?.id, variantIds, variantsForActions]);

  useEffect(() => {
    setIsClientManagerOpen(false);
    setClientManagerBusyAction(null);
    setPendingGameAction(null);
    setGameActionResult(null);
    setGameActionError(null);
  }, [selectedVariant?.id]);

  useEffect(() => {
    selectedGameActionBindingRef.current =
      selectedVariantGameId && selectedVariantTitle
        ? {
            gameId: selectedVariantGameId,
            provider: selectedVariantSource,
            title: selectedVariantTitle,
          }
        : null;
  }, [selectedVariantGameId, selectedVariantSource, selectedVariantTitle]);

  useEffect(() => {
    capabilityRequestIdRef.current += 1;
    setNativeGameActionCapabilities(null);
    setNativeGameActionCapabilitiesGameId(null);
    setGameActionCapabilityError(null);

    if (!isDesktopRuntime || !selectedVariant?.id) {
      setIsLoadingGameActionCapabilities(false);
      return;
    }

    void loadNativeGameActionCapabilities(selectedVariant.id);
  }, [isDesktopRuntime, loadNativeGameActionCapabilities, selectedVariant?.id]);

  function handleArtworkFileChange(kind: CustomArtworkKind, fileList: FileList | null) {
    const file = fileList?.[0];
    if (!primaryArtworkGameId || !file) {
      return;
    }

    openArtworkPreview(primaryArtworkGameId, kind, file);
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

  async function handleOpenSelectedSupport() {
    if (!supportDestination || !gameActionCapabilities?.support.available) return;

    try {
      const destination = new URL(supportDestination.url);
      if (destination.protocol !== "https:") {
        throw new Error("Support destinations must use HTTPS.");
      }
      if (isTauri()) {
        await openExternalUrl(destination.toString());
      } else {
        window.open(destination.toString(), "_blank", "noopener,noreferrer");
      }
      setStatusMessage(`${supportDestination.label} opened for the selected copy.`);
    } catch (error) {
      setStatusMessage(`Support could not be opened: ${getErrorMessage(error)}`);
    }
  }

  async function refreshSelectedClientHealth() {
    if (!selectedSourceClientId) {
      return;
    }
    const statuses = await pollPlatformClientHealth({ maxAgeMs: 0 });
    setClientHealth(
      statuses.find((status) => status.platformId === selectedSourceClientId) ?? null,
    );
  }

  function selectionMatchesGameAction(snapshot: PendingGameAction): boolean {
    const current = selectedGameActionBindingRef.current;
    return Boolean(
      current &&
      current.gameId === snapshot.gameId &&
      current.title === snapshot.title &&
      current.provider === snapshot.provider,
    );
  }

  async function executeBoundGameAction(snapshot: PendingGameAction, confirmationToken?: string) {
    if (!selectionMatchesGameAction(snapshot)) {
      throw new Error(
        "The selected copy changed before the action could run. Nothing was started.",
      );
    }

    const result = await runGameAction({
      action: snapshot.action,
      gameId: snapshot.gameId,
      expectedProvider: snapshot.provider,
      expectedTitle: snapshot.title,
      ...(confirmationToken ? { confirmationToken } : {}),
    });

    if (result.gameId !== snapshot.gameId || result.action !== snapshot.action) {
      throw new Error("The desktop backend returned a result for a different game action.");
    }

    let displayedResult = result;
    let librarySyncWarning: string | null = null;
    if (result.libraryChanged || result.rescanRecommended) {
      try {
        await runAutomaticLibrarySync(true);
      } catch (error) {
        librarySyncWarning = `Library sync failed: ${getErrorMessage(error)}`;
        displayedResult = {
          ...result,
          details: [...result.details, librarySyncWarning],
        };
      }
    }

    if (!selectionMatchesGameAction(snapshot)) {
      setStatusMessage(
        `${gameActionOutcomeLabel(result.outcome)} for ${snapshot.title}: ${result.message}${librarySyncWarning ? ` ${librarySyncWarning}` : ""}`,
      );
      return;
    }

    setGameActionResult(displayedResult);
    setGameActionError(null);
    setStatusMessage(
      `${gameActionOutcomeLabel(result.outcome)}: ${result.message}${librarySyncWarning ? ` ${librarySyncWarning}` : ""}`,
    );
    if (isDesktopRuntime) {
      await loadNativeGameActionCapabilities(snapshot.gameId);
    }
  }

  async function runRequestedGameAction(snapshot: PendingGameAction) {
    if (busyGameAction) return;

    setBusyGameAction(snapshot.action);
    try {
      await executeBoundGameAction(snapshot);
    } catch (error) {
      const message = getErrorMessage(error);
      setGameActionError(message);
      setStatusMessage(`Action failed: ${message}`);
    } finally {
      setBusyGameAction(null);
    }
  }

  function handleRequestGameAction(action: GameAction, capability: GameActionCapability) {
    if (!selectedVariant || !capability.available || busyGameAction) return;

    const snapshot: PendingGameAction = {
      action,
      capability: { ...capability, action },
      gameId: selectedVariant.id,
      provider: getGameSource(selectedVariant),
      title: selectedVariant.title,
    };
    setGameActionResult(null);
    setGameActionError(null);

    if (capability.requiresConfirmation) {
      setPendingGameAction(snapshot);
      return;
    }

    void runRequestedGameAction(snapshot);
  }

  async function handleConfirmGameAction() {
    const snapshot = pendingGameAction;
    if (!snapshot || busyGameAction) return;

    if (!selectionMatchesGameAction(snapshot)) {
      setPendingGameAction(null);
      const message = "The selected copy changed before confirmation. Nothing was started.";
      setGameActionError(message);
      setStatusMessage(`Action blocked: ${message}`);
      return;
    }

    setBusyGameAction(snapshot.action);
    setGameActionError(null);
    try {
      const grant = await prepareGameActionConfirmation({
        action: snapshot.action,
        gameId: snapshot.gameId,
        expectedProvider: snapshot.provider,
        expectedTitle: snapshot.title,
      });

      if (!selectionMatchesGameAction(snapshot)) {
        throw new Error(
          "The selected copy changed while confirmation was prepared. Nothing was started.",
        );
      }
      if (
        grant.gameId !== snapshot.gameId ||
        grant.action !== snapshot.action ||
        !grant.confirmationToken.trim()
      ) {
        throw new Error("The desktop backend returned an invalid confirmation grant.");
      }

      setPendingGameAction(null);
      await executeBoundGameAction(snapshot, grant.confirmationToken);
    } catch (error) {
      const message = getErrorMessage(error);
      setGameActionError(message);
      setStatusMessage(`Action failed: ${message}`);
    } finally {
      setBusyGameAction(null);
    }
  }

  function patchClientConfigDraft(patch: Partial<ClientModificationConfig>) {
    setClientModificationConfig((current) => {
      const base =
        current ??
        (selectedSourceClientId
          ? (makeEmptyClientConfig(selectedSourceClientId) as ClientModificationConfig)
          : null);
      return base ? { ...base, ...patch } : base;
    });
  }

  function updateClientConfigDraft(
    updater: (current: ClientModificationConfig) => ClientModificationConfig,
  ) {
    setClientModificationConfig((current) => {
      const base =
        current ??
        (selectedSourceClientId
          ? (makeEmptyClientConfig(selectedSourceClientId) as ClientModificationConfig)
          : null);
      return base ? updater(base) : base;
    });
  }

  function updateClientPathOverlay(
    id: string,
    patch: Partial<ClientModificationConfig["pathOverlays"][number]>,
  ) {
    updateClientConfigDraft((current) => ({
      ...current,
      pathOverlays: current.pathOverlays.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    }));
  }

  function updateClientModRoot(
    id: string,
    patch: Partial<ClientModificationConfig["modRoots"][number]>,
  ) {
    updateClientConfigDraft((current) => ({
      ...current,
      modRoots: current.modRoots.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    }));
  }

  function updateClientAssetCache(
    id: string,
    patch: Partial<ClientModificationConfig["assetCaches"][number]>,
  ) {
    updateClientConfigDraft((current) => ({
      ...current,
      assetCaches: current.assetCaches.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    }));
  }

  async function handleOpenClientInstaller() {
    if (!selectedSourceClientId || isClientManagerBusy) {
      return;
    }
    setClientManagerBusyAction("installer");
    setClientManagerError(null);
    try {
      const result = await openPlatformClientInstaller(selectedSourceClientId);
      setStatusMessage(result.message);
      await Promise.all([loadClientManagerState(), refreshSelectedClientHealth()]);
    } catch (error) {
      const message = getErrorMessage(error);
      setClientManagerError(message);
      setStatusMessage(`Client installer action failed: ${message}`);
    } finally {
      setClientManagerBusyAction(null);
    }
  }

  async function handleOpenClientUpdater() {
    if (!selectedSourceClientId || isClientManagerBusy) {
      return;
    }
    setClientManagerBusyAction("updater");
    setClientManagerError(null);
    try {
      const result = await openPlatformClientUpdater(selectedSourceClientId);
      setStatusMessage(result.message);
      await Promise.all([loadClientManagerState(), refreshSelectedClientHealth()]);
    } catch (error) {
      const message = getErrorMessage(error);
      setClientManagerError(message);
      setStatusMessage(`Client updater action failed: ${message}`);
    } finally {
      setClientManagerBusyAction(null);
    }
  }

  async function handleCheckClientUpdate() {
    if (!selectedSourceClientId || isClientManagerBusy) {
      return;
    }
    setClientManagerBusyAction("check_update");
    setClientManagerError(null);
    try {
      const updateStatus = await checkPlatformClientUpdate(selectedSourceClientId);
      setClientUpdateStatus(updateStatus);
      setStatusMessage(`${updateStatus.displayName}: ${updateStatus.detail}`);
    } catch (error) {
      const message = getErrorMessage(error);
      setClientManagerError(message);
      setStatusMessage(`Client update check failed: ${message}`);
    } finally {
      setClientManagerBusyAction(null);
    }
  }

  async function handleSaveClientConfig() {
    if (!clientModificationConfig || isClientManagerBusy) {
      return;
    }
    setClientManagerBusyAction("save_config");
    setClientManagerError(null);
    try {
      const saved = await savePlatformClientModificationConfig(clientModificationConfig);
      setClientModificationConfig(saved);
      setStatusMessage(`${saved.displayName} client-manager config saved.`);
      await loadClientManagerState();
    } catch (error) {
      const message = getErrorMessage(error);
      setClientManagerError(message);
      setStatusMessage(`Client-manager config save failed: ${message}`);
    } finally {
      setClientManagerBusyAction(null);
    }
  }

  return (
    <>
      <div className="library-scroll-frame relative z-10 min-h-0 min-w-0">
        <main
          ref={detailScrollRef}
          className="library-detail-scroll h-full min-h-0 min-w-0 overflow-x-hidden overflow-y-auto"
        >
          {shouldShowLibraryLoading ? (
            <section
              className="grid min-h-[calc(100vh-124px)] place-items-center border-b-4 border-black bg-[#efe3cf] px-4 text-center"
              style={{ fontFamily: '"Arial Narrow", Impact, sans-serif' }}
            >
              <div className="max-w-[560px] border-4 border-black bg-[#fbf4e7] p-8 shadow-[8px_8px_0_#171411]">
                <Settings className="mx-auto mb-4 h-10 w-10 animate-[spin_4s_linear_infinite] text-[#087d6d]" />
                <h2 className="neo-title mb-2 text-3xl text-[#171411] uppercase">
                  LOADING LIBRARY
                </h2>
                <div className="neo-dots mx-auto mb-4 h-1.5 w-12 bg-black" />
                <p className="neo-copy text-[14px] font-black text-[#6c675e] uppercase">
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
                const shouldHideHeroOverlay =
                  gameSource === "battlenet" && Boolean(enrichedSelectedGame.coverUrl);
                const logoSrc = shouldHideHeroOverlay
                  ? undefined
                  : getGameAssetUrl(logoCandidates[logoCandidateIndex]);
                const hasUbisoftBanner =
                  gameSource === "ubisoft" && Boolean(enrichedSelectedGame.coverUrl);
                const hasEpicBanner =
                  gameSource === "epic" && Boolean(enrichedSelectedGame.coverUrl);
                const shouldShowTextFallback =
                  !shouldHideHeroOverlay &&
                  !hasUbisoftBanner &&
                  !hasEpicBanner &&
                  (!logoSrc || !loadedLogoUrls.has(logoSrc));
                const logoPositionClass = getLogoPositionClass(enrichedSelectedGame);
                const logoPlacementStyle = getLogoPlacementStyle(enrichedSelectedGame);

                return (
                  <section className="border-b-4 border-black bg-[#171411]">
                    <div
                      role="region"
                      aria-label="Drop zone for cover artwork"
                      className={`${getPlatformBannerClass(enrichedSelectedGame)} relative overflow-hidden bg-[#0f141b] ${getFallbackBannerClass(enrichedSelectedGame)} ${isBannerDragOver ? "ring-4 ring-[#169b83] ring-inset" : ""}`}
                      style={getGameBannerStyle(enrichedSelectedGame.coverUrl, {
                        backgroundPosition: gameSource === "epic" ? "center 24%" : undefined,
                      })}
                      onDragOver={handleBannerDragOver}
                      onDragLeave={handleBannerDragLeave}
                      onDrop={handleBannerDrop}
                    >
                      <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[length:9px_9px]" />
                      {isBannerDragOver && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#087d6d]/85 bg-[radial-gradient(circle,rgba(255,249,237,0.18)_1px,transparent_1px)] bg-[length:8px_8px]">
                          <span className="border-2 border-black bg-[#fbf4e7] px-4 py-2 text-[12px] font-black text-[#171411] uppercase shadow-[3px_3px_0_#171411]">
                            Drop for cover
                          </span>
                        </div>
                      )}
                      {shouldShowTextFallback ? (
                        <h1 className="absolute top-1/2 left-1/2 max-w-[min(62%,720px)] -translate-x-1/2 -translate-y-1/2 text-center text-[2.4rem] leading-none font-black tracking-normal text-white uppercase drop-shadow-[5px_5px_0_#171411] sm:text-[3.5rem] lg:text-[4.5rem] xl:text-[5.4rem]">
                          {enrichedSelectedGame.title}
                        </h1>
                      ) : null}
                      {crossPlayPlatforms.length > 0 && (
                        <div className="absolute top-[calc(50%+3.4rem)] left-1/2 z-10 -translate-x-1/2">
                          <CrossPlayBadge platforms={crossPlayPlatforms} />
                        </div>
                      )}
                      {logoSrc ? (
                        <img
                          alt=""
                          aria-hidden="true"
                          className={`absolute ${logoPositionClass} object-contain drop-shadow-[5px_5px_0_#171411]`}
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
              <section className="grid items-start gap-3 border-b-4 border-black bg-[#f3e8d7] p-3 xl:grid-cols-[minmax(205px,auto)_minmax(0,1fr)]">
                <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2 xl:flex-none">
                  {activeDownload ? (
                    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:min-w-[205px] sm:flex-none">
                      <div className="flex items-center justify-between gap-2">
                        <span className="neo-copy text-[10px] font-bold text-[#55504a] uppercase">
                          Downloading {activeDownload.progress}%
                        </span>
                        <span className="neo-copy text-[10px] font-bold text-[#c20b2f] uppercase">
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
                        className="neo-copy h-9 border-2 border-black bg-[#171411] px-3 text-[10px] font-bold text-white uppercase transition-colors hover:bg-[#333]"
                        type="button"
                        onClick={() => navigate("/downloads")}
                      >
                        View in Downloads
                      </button>
                    </div>
                  ) : isOglCatalogOnly ? (
                    <button
                      className="flex h-[64px] min-w-[205px] flex-1 cursor-not-allowed items-center justify-center gap-3 border-4 border-black bg-[#efe6d4] px-5 text-[18px] font-black text-[#655f58] uppercase shadow-[3px_3px_0_#171411] sm:flex-none"
                      title="This OG Launcher catalog game does not have an installable build yet."
                      type="button"
                      disabled
                    >
                      <Award className="h-7 w-7" />
                      OG Catalog
                    </button>
                  ) : enrichedSelectedGame.status === "not_installed" ? (
                    <button
                      className="flex h-[64px] min-w-[205px] flex-1 items-center justify-center gap-3 border-4 border-black bg-[#b7102a] px-5 text-[22px] font-black text-white uppercase shadow-[3px_3px_0_#171411] transition-colors hover:bg-[#990a20] sm:flex-none xl:text-[26px]"
                      type="button"
                      onClick={() => void handlePlay()}
                    >
                      <Download className="h-7 w-7" />
                      Install
                    </button>
                  ) : (
                    <button
                      className="flex h-[64px] min-w-[205px] flex-1 items-center justify-center gap-3 border-4 border-black bg-[#169b83] px-5 text-[22px] font-black text-white uppercase shadow-[3px_3px_0_#171411] transition-colors hover:bg-[#087d6d] disabled:cursor-default disabled:bg-[#087d6d] sm:flex-none sm:text-[26px]"
                      type="button"
                      disabled={isGameRunning}
                      onClick={() => void handlePlay()}
                    >
                      {isGameRunning ? (
                        <Power className="h-7 w-7 fill-current" />
                      ) : (
                        <Play className="h-7 w-7 fill-current" />
                      )}
                      <span className="min-w-0 leading-none">
                        <span className="block truncate">{isGameRunning ? "Running" : "Play"}</span>
                        {isGameRunning && gameRuntime ? (
                          <span className="neo-copy mt-1 block max-w-[130px] truncate text-[8px] font-black text-[#d8fff7] uppercase sm:max-w-[145px]">
                            {gameRuntimeButtonDetail}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  )}
                  <button
                    ref={settingsButtonRef}
                    aria-expanded={isSettingsPopoverOpen}
                    aria-label="Game Settings"
                    className={`grid h-[64px] w-[64px] shrink-0 place-items-center border-4 border-black text-[#171411] shadow-[3px_3px_0_#171411] transition-colors ${
                      isSettingsPopoverOpen ? "bg-[#efe3cf]" : "bg-[#fbf4e7] hover:bg-[#efe3cf]"
                    }`}
                    title="Game Settings"
                    type="button"
                    onClick={handleToggleGameSettingsPopover}
                  >
                    <Settings className="h-7 w-7" />
                  </button>
                  {MODS_PAGE_ENABLED && enrichedSelectedGame.status !== "not_installed" ? (
                    <button
                      className="flex h-[64px] min-w-0 flex-1 items-center justify-center gap-2 border-4 border-black bg-[#fbf4e7] px-3 text-[18px] font-black text-[#171411] uppercase shadow-[3px_3px_0_#171411] transition-colors hover:bg-[#8cf5e4]"
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
                      className="flex h-[64px] min-w-0 flex-1 items-center justify-center gap-2 border-4 border-black bg-[#e8c843] px-3 text-[16px] font-black text-[#171411] uppercase shadow-[3px_3px_0_#171411] transition-colors hover:bg-[#f0d95a]"
                      type="button"
                      onClick={() => void onInstallFromProvider()}
                    >
                      <Download className="h-6 w-6" />
                      Install from...
                    </button>
                  ) : null}
                </div>

                <div className="min-w-0 space-y-2">
                  {isGameRunning && gameRuntime ? (
                    <div
                      className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-2 border-black bg-[#fbf4e7] px-2 py-1.5 shadow-[2px_2px_0_#171411]"
                      title={gameRuntimeButtonDetail || "Game process is active"}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <Power className="h-4 w-4 shrink-0 text-[#087d6d]" />
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="neo-copy text-[9px] font-black text-[#55504a] uppercase">
                              Game Runtime
                            </span>
                            <span className="neo-copy truncate text-[11px] font-black text-[#171411] uppercase">
                              {gameRuntime.processName ?? "Process active"}
                            </span>
                            {gameRuntimeSourceBadge ? (
                              <span className="neo-copy border-2 border-black bg-[#e8c843] px-1.5 py-0.5 text-[8px] font-black text-[#171411] uppercase shadow-[1px_1px_0_#171411]">
                                {gameRuntimeSourceBadge}
                              </span>
                            ) : null}
                            {gameRuntime.windowHandle ? (
                              <span className="neo-copy border-2 border-black bg-[#171411] px-1.5 py-0.5 text-[8px] font-black text-white uppercase shadow-[1px_1px_0_#171411]">
                                HWND {gameRuntime.windowHandle}
                              </span>
                            ) : null}
                          </div>
                          <p className="neo-copy mt-0.5 truncate text-[9px] font-bold text-[#655f58] uppercase">
                            {[
                              gameRuntime.pid ? `PID ${gameRuntime.pid}` : null,
                              formatRuntimeDuration(gameRuntime.uptimeSeconds)
                                ? `Uptime ${formatRuntimeDuration(gameRuntime.uptimeSeconds)}`
                                : null,
                              gameRuntimeInputLabel,
                              gameRuntimeWindowLabel,
                            ]
                              .filter(Boolean)
                              .join(" / ") || "Runtime signal active"}
                          </p>
                        </div>
                      </div>
                      <span className="neo-copy shrink-0 border-2 border-black bg-[#087d6d] px-1.5 py-0.5 text-[8px] font-black text-white uppercase shadow-[1px_1px_0_#171411]">
                        Running
                      </span>
                    </div>
                  ) : null}

                  {selectedSourceClientId && isClientManagerOpen ? (
                    <section className="neo-dots min-w-0 border-4 border-black bg-[#fbf4e7] shadow-[4px_4px_0_#171411]">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black bg-[#171411] px-3 py-2 text-white">
                        <div className="min-w-0">
                          <h3 className="neo-title text-[17px] leading-none uppercase">
                            Client Manager
                          </h3>
                          <p className="neo-copy mt-1 truncate text-[9px] font-black text-[#f6edd8] uppercase">
                            {selectedSourceClientName} / local install signal / safe updater path
                          </p>
                        </div>
                        <span
                          className={`neo-copy border-2 border-black px-2 py-1 text-[9px] font-black uppercase shadow-[2px_2px_0_#000] ${clientManagerStatusClass}`}
                        >
                          {clientUpdateStatus?.statusLabel ?? "Loading"}
                        </span>
                      </div>

                      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
                        <div className="min-w-0 space-y-3">
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="border-2 border-black bg-[#efe6d4] p-2 shadow-[2px_2px_0_#171411]">
                              <span className="neo-copy block text-[8px] font-black text-[#655f58] uppercase">
                                Installed
                              </span>
                              <strong className="neo-title mt-1 block truncate text-[16px] uppercase">
                                {clientUpdateStatus?.installed ? "Detected" : "Missing"}
                              </strong>
                            </div>
                            <div className="border-2 border-black bg-[#efe6d4] p-2 shadow-[2px_2px_0_#171411]">
                              <span className="neo-copy block text-[8px] font-black text-[#655f58] uppercase">
                                Version
                              </span>
                              <strong className="neo-title mt-1 block truncate text-[16px] uppercase">
                                {clientUpdateStatus?.installedVersion ?? "Unknown"}
                              </strong>
                            </div>
                            <div className="border-2 border-black bg-[#efe6d4] p-2 shadow-[2px_2px_0_#171411]">
                              <span className="neo-copy block text-[8px] font-black text-[#655f58] uppercase">
                                Latest
                              </span>
                              <strong className="neo-title mt-1 block truncate text-[16px] uppercase">
                                {clientUpdateStatus?.latestKnownVersion ?? "Manual"}
                              </strong>
                            </div>
                            <div className="border-2 border-black bg-[#efe6d4] p-2 shadow-[2px_2px_0_#171411]">
                              <span className="neo-copy block text-[8px] font-black text-[#655f58] uppercase">
                                Scheduler
                              </span>
                              <strong className="neo-title mt-1 block truncate text-[16px] uppercase">
                                {clientUpdateStatus?.schedulerEnabled ? "24h" : "Manual"}
                              </strong>
                              <span className="neo-copy mt-1 block truncate text-[8px] font-black text-[#655f58] uppercase">
                                {clientUpdateStatus?.schedulerEnabled
                                  ? `Next ${formatScheduleTime(clientUpdateStatus.nextScheduledCheckAt)}`
                                  : "Auto check off"}
                              </span>
                            </div>
                          </div>

                          <div className="border-2 border-black bg-[#f6edd8] p-2">
                            <p className="neo-copy text-[10px] leading-5 font-black text-[#171411] uppercase">
                              {isClientManagerLoading
                                ? "Loading client-manager metadata"
                                : (clientUpdateStatus?.detail ??
                                  clientInstallerMetadata?.installNotes ??
                                  "Client-manager metadata is not loaded.")}
                            </p>
                            {clientManagerError ? (
                              <p className="neo-copy mt-2 border-2 border-black bg-[#b7102a] px-2 py-1 text-[9px] font-black text-white uppercase">
                                {clientManagerError}
                              </p>
                            ) : null}
                            {clientUpdateStatus?.schedulerEnabled ? (
                              <p className="neo-copy mt-2 border-2 border-black bg-[#fbf4e7] px-2 py-1 text-[9px] font-black text-[#655f58] uppercase">
                                Scheduled update check: last{" "}
                                {formatRelativeTime(clientUpdateStatus.lastScheduledCheckAt)} / next{" "}
                                {formatScheduleTime(clientUpdateStatus.nextScheduledCheckAt)}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              className="neo-copy inline-flex h-9 items-center gap-1.5 border-2 border-black bg-[#b7102a] px-3 text-[10px] font-black text-white uppercase shadow-[2px_2px_0_#171411] hover:bg-[#990a20] disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
                              type="button"
                              disabled={isClientManagerBusy}
                              onClick={() => void handleOpenClientInstaller()}
                            >
                              {clientManagerBusyAction === "installer" ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : clientInstallerMetadata?.canOpenLocalInstaller ? (
                                <Power className="h-4 w-4" />
                              ) : (
                                <ExternalLink className="h-4 w-4" />
                              )}
                              {clientInstallActionLabel}
                            </button>
                            <button
                              className="neo-copy inline-flex h-9 items-center gap-1.5 border-2 border-black bg-[#fbf4e7] px-3 text-[10px] font-black text-[#171411] uppercase shadow-[2px_2px_0_#171411] hover:bg-[#8cf5e4] disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
                              type="button"
                              disabled={isClientManagerBusy || !clientUpdateStatus?.canOpenUpdater}
                              onClick={() => void handleOpenClientUpdater()}
                            >
                              {clientManagerBusyAction === "updater" ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <ExternalLink className="h-4 w-4" />
                              )}
                              {clientUpdateActionLabel}
                            </button>
                            <button
                              className="neo-copy inline-flex h-9 items-center gap-1.5 border-2 border-black bg-[#e8c843] px-3 text-[10px] font-black text-[#171411] uppercase shadow-[2px_2px_0_#171411] hover:bg-[#8cf5e4] disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
                              type="button"
                              disabled={isClientManagerBusy}
                              onClick={() => void handleCheckClientUpdate()}
                            >
                              {clientManagerBusyAction === "check_update" ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                              Check
                            </button>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="min-w-0 border-2 border-black bg-[#efe6d4]">
                              <div className="flex items-center justify-between gap-2 border-b-2 border-black px-2 py-1.5">
                                <h4 className="neo-copy inline-flex items-center gap-1 text-[10px] font-black uppercase">
                                  <Layers className="h-4 w-4" />
                                  Path overlays
                                </h4>
                                <button
                                  className="grid h-7 w-7 place-items-center border-2 border-black bg-[#fbf4e7] shadow-[1px_1px_0_#171411] hover:bg-[#8cf5e4]"
                                  type="button"
                                  aria-label="Add path overlay"
                                  onClick={() =>
                                    updateClientConfigDraft((current) => ({
                                      ...current,
                                      pathOverlays: [
                                        ...current.pathOverlays,
                                        makeEmptyPathOverlay(current.pathOverlays.length),
                                      ],
                                    }))
                                  }
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              </div>
                              <div className="max-h-[280px] space-y-2 overflow-y-auto p-2">
                                {clientModificationConfig?.pathOverlays.length ? (
                                  clientModificationConfig.pathOverlays.map((overlay) => (
                                    <div
                                      key={overlay.id}
                                      className="space-y-1.5 border-2 border-black bg-[#fbf4e7] p-2"
                                    >
                                      <div className="flex items-center gap-2">
                                        <input
                                          className="neo-copy h-8 min-w-0 flex-1 border-2 border-black bg-[#f6edd8] px-2 text-[10px] font-black uppercase outline-none"
                                          value={overlay.label}
                                          aria-label="Path overlay label"
                                          onChange={(event) =>
                                            updateClientPathOverlay(overlay.id, {
                                              label: event.currentTarget.value,
                                            })
                                          }
                                        />
                                        <button
                                          className="grid h-8 w-8 shrink-0 place-items-center border-2 border-black bg-[#fbf4e7] text-[#b7102a] hover:bg-[#f6edd8]"
                                          type="button"
                                          aria-label="Remove path overlay"
                                          onClick={() =>
                                            updateClientConfigDraft((current) => ({
                                              ...current,
                                              pathOverlays: current.pathOverlays.filter(
                                                (entry) => entry.id !== overlay.id,
                                              ),
                                            }))
                                          }
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </div>
                                      <input
                                        className="neo-copy h-8 w-full border-2 border-black bg-[#f6edd8] px-2 text-[10px] font-bold outline-none"
                                        value={overlay.sourcePath}
                                        aria-label="Overlay source path"
                                        placeholder="Source path"
                                        onChange={(event) =>
                                          updateClientPathOverlay(overlay.id, {
                                            sourcePath: event.currentTarget.value,
                                          })
                                        }
                                      />
                                      <input
                                        className="neo-copy h-8 w-full border-2 border-black bg-[#f6edd8] px-2 text-[10px] font-bold outline-none"
                                        value={overlay.targetPath}
                                        aria-label="Overlay target path"
                                        placeholder="Target path"
                                        onChange={(event) =>
                                          updateClientPathOverlay(overlay.id, {
                                            targetPath: event.currentTarget.value,
                                          })
                                        }
                                      />
                                      <div className="flex flex-wrap gap-3">
                                        <label className="neo-copy flex items-center gap-1 text-[9px] font-black uppercase">
                                          <input
                                            type="checkbox"
                                            checked={overlay.enabled}
                                            onChange={(event) =>
                                              updateClientPathOverlay(overlay.id, {
                                                enabled: event.currentTarget.checked,
                                              })
                                            }
                                          />
                                          Enabled
                                        </label>
                                        <label className="neo-copy flex items-center gap-1 text-[9px] font-black uppercase">
                                          <input
                                            type="checkbox"
                                            checked={overlay.readOnly}
                                            onChange={(event) =>
                                              updateClientPathOverlay(overlay.id, {
                                                readOnly: event.currentTarget.checked,
                                              })
                                            }
                                          />
                                          Read only
                                        </label>
                                      </div>
                                      <input
                                        className="neo-copy h-8 w-full border-2 border-black bg-[#f6edd8] px-2 text-[10px] font-bold outline-none"
                                        value={overlay.notes ?? ""}
                                        aria-label="Overlay notes"
                                        placeholder="Notes"
                                        onChange={(event) =>
                                          updateClientPathOverlay(overlay.id, {
                                            notes: event.currentTarget.value,
                                          })
                                        }
                                      />
                                    </div>
                                  ))
                                ) : (
                                  <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-3 text-[10px] font-black text-[#655f58] uppercase">
                                    No path overlays configured.
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="min-w-0 border-2 border-black bg-[#efe6d4]">
                              <div className="flex items-center justify-between gap-2 border-b-2 border-black px-2 py-1.5">
                                <h4 className="neo-copy inline-flex items-center gap-1 text-[10px] font-black uppercase">
                                  <FolderOpen className="h-4 w-4" />
                                  Mod roots
                                </h4>
                                <button
                                  className="grid h-7 w-7 place-items-center border-2 border-black bg-[#fbf4e7] shadow-[1px_1px_0_#171411] hover:bg-[#8cf5e4]"
                                  type="button"
                                  aria-label="Add mod root"
                                  onClick={() =>
                                    updateClientConfigDraft((current) => ({
                                      ...current,
                                      modRoots: [
                                        ...current.modRoots,
                                        makeEmptyModRoot(current.modRoots.length),
                                      ],
                                    }))
                                  }
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              </div>
                              <div className="max-h-[280px] space-y-2 overflow-y-auto p-2">
                                {clientModificationConfig?.modRoots.length ? (
                                  clientModificationConfig.modRoots.map((root) => (
                                    <div
                                      key={root.id}
                                      className="space-y-1.5 border-2 border-black bg-[#fbf4e7] p-2"
                                    >
                                      <div className="flex items-center gap-2">
                                        <input
                                          className="neo-copy h-8 min-w-0 flex-1 border-2 border-black bg-[#f6edd8] px-2 text-[10px] font-black uppercase outline-none"
                                          value={root.label}
                                          aria-label="Mod root label"
                                          onChange={(event) =>
                                            updateClientModRoot(root.id, {
                                              label: event.currentTarget.value,
                                            })
                                          }
                                        />
                                        <button
                                          className="grid h-8 w-8 shrink-0 place-items-center border-2 border-black bg-[#fbf4e7] text-[#b7102a] hover:bg-[#f6edd8]"
                                          type="button"
                                          aria-label="Remove mod root"
                                          onClick={() =>
                                            updateClientConfigDraft((current) => ({
                                              ...current,
                                              modRoots: current.modRoots.filter(
                                                (entry) => entry.id !== root.id,
                                              ),
                                            }))
                                          }
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </div>
                                      <input
                                        className="neo-copy h-8 w-full border-2 border-black bg-[#f6edd8] px-2 text-[10px] font-bold outline-none"
                                        value={root.path}
                                        aria-label="Mod root path"
                                        placeholder="Mod root path"
                                        onChange={(event) =>
                                          updateClientModRoot(root.id, {
                                            path: event.currentTarget.value,
                                          })
                                        }
                                      />
                                      <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto]">
                                        <input
                                          className="neo-copy h-8 min-w-0 border-2 border-black bg-[#f6edd8] px-2 text-[10px] font-bold outline-none"
                                          value={root.kind}
                                          aria-label="Mod root kind"
                                          placeholder="Kind"
                                          onChange={(event) =>
                                            updateClientModRoot(root.id, {
                                              kind: event.currentTarget.value,
                                            })
                                          }
                                        />
                                        <label className="neo-copy flex h-8 items-center gap-1 border-2 border-black bg-[#efe6d4] px-2 text-[9px] font-black uppercase">
                                          <input
                                            type="checkbox"
                                            checked={root.enabled}
                                            onChange={(event) =>
                                              updateClientModRoot(root.id, {
                                                enabled: event.currentTarget.checked,
                                              })
                                            }
                                          />
                                          Enabled
                                        </label>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-3 text-[10px] font-black text-[#655f58] uppercase">
                                    No mod roots configured.
                                  </p>
                                )}
                              </div>
                            </div>

                            <ClientPathOverlayPreflightPanel
                              preflight={clientPathOverlayPreflight}
                            />
                          </div>
                        </div>

                        <div className="border-2 border-black bg-[#efe6d4] shadow-[2px_2px_0_#171411]">
                          <div className="flex items-center justify-between gap-2 border-b-2 border-black px-2 py-1.5">
                            <h4 className="neo-copy inline-flex items-center gap-1 text-[10px] font-black uppercase">
                              <PackagePlus className="h-4 w-4" />
                              Asset cache lookup
                            </h4>
                            <div className="flex items-center gap-1.5">
                              <span className="neo-copy border-2 border-black bg-[#fbf4e7] px-1.5 py-0.5 text-[8px] font-black text-[#171411] uppercase">
                                {selectedClientAssetCacheEntries.length} keys
                              </span>
                              <button
                                className="grid h-7 w-7 place-items-center border-2 border-black bg-[#fbf4e7] shadow-[1px_1px_0_#171411] hover:bg-[#8cf5e4]"
                                type="button"
                                aria-label="Add asset cache"
                                onClick={() =>
                                  updateClientConfigDraft((current) => ({
                                    ...current,
                                    assetCaches: [
                                      ...current.assetCaches,
                                      makeEmptyAssetCache(current.assetCaches.length),
                                    ],
                                  }))
                                }
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          <div className="grid gap-2 p-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(220px,0.8fr)]">
                            <div className="max-h-[320px] space-y-2 overflow-y-auto">
                              {clientModificationConfig?.assetCaches.length ? (
                                clientModificationConfig.assetCaches.map((entry) => (
                                  <div
                                    key={entry.id}
                                    className="space-y-1.5 border-2 border-black bg-[#fbf4e7] p-2"
                                  >
                                    <div className="flex items-center gap-2">
                                      <input
                                        className="neo-copy h-8 min-w-0 flex-1 border-2 border-black bg-[#f6edd8] px-2 text-[10px] font-black uppercase outline-none"
                                        value={entry.label}
                                        aria-label="Asset cache label"
                                        onChange={(event) =>
                                          updateClientAssetCache(entry.id, {
                                            label: event.currentTarget.value,
                                          })
                                        }
                                      />
                                      <button
                                        className="grid h-8 w-8 shrink-0 place-items-center border-2 border-black bg-[#fbf4e7] text-[#b7102a] hover:bg-[#f6edd8]"
                                        type="button"
                                        aria-label="Remove asset cache"
                                        onClick={() =>
                                          updateClientConfigDraft((current) => ({
                                            ...current,
                                            assetCaches: current.assetCaches.filter(
                                              (cache) => cache.id !== entry.id,
                                            ),
                                          }))
                                        }
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                    <div className="grid gap-1.5 sm:grid-cols-2">
                                      <input
                                        className="neo-copy h-8 min-w-0 border-2 border-black bg-[#f6edd8] px-2 text-[10px] font-bold outline-none"
                                        value={entry.cacheKey}
                                        aria-label="Asset cache key"
                                        placeholder="Cache key"
                                        onChange={(event) =>
                                          updateClientAssetCache(entry.id, {
                                            cacheKey: event.currentTarget.value,
                                          })
                                        }
                                      />
                                      <input
                                        className="neo-copy h-8 min-w-0 border-2 border-black bg-[#f6edd8] px-2 text-[10px] font-bold outline-none"
                                        value={entry.cachePath}
                                        aria-label="Asset cache path"
                                        placeholder="Cache path"
                                        onChange={(event) =>
                                          updateClientAssetCache(entry.id, {
                                            cachePath: event.currentTarget.value,
                                          })
                                        }
                                      />
                                    </div>
                                    <div className="grid gap-1.5 sm:grid-cols-[auto_96px_minmax(0,1fr)]">
                                      <label className="neo-copy flex h-8 items-center gap-1 border-2 border-black bg-[#efe6d4] px-2 text-[9px] font-black uppercase">
                                        <input
                                          type="checkbox"
                                          checked={entry.enabled}
                                          onChange={(event) =>
                                            updateClientAssetCache(entry.id, {
                                              enabled: event.currentTarget.checked,
                                            })
                                          }
                                        />
                                        Enabled
                                      </label>
                                      <input
                                        className="neo-copy h-8 border-2 border-black bg-[#f6edd8] px-2 text-[10px] font-bold outline-none"
                                        value={entry.priority}
                                        type="number"
                                        min={0}
                                        max={999}
                                        aria-label="Asset cache priority"
                                        onChange={(event) =>
                                          updateClientAssetCache(entry.id, {
                                            priority: Number(event.currentTarget.value || 0),
                                          })
                                        }
                                      />
                                      <input
                                        className="neo-copy h-8 min-w-0 border-2 border-black bg-[#f6edd8] px-2 text-[10px] font-bold outline-none"
                                        value={entry.notes ?? ""}
                                        aria-label="Asset cache notes"
                                        placeholder="Notes"
                                        onChange={(event) =>
                                          updateClientAssetCache(entry.id, {
                                            notes: event.currentTarget.value,
                                          })
                                        }
                                      />
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-3 text-[10px] font-black text-[#655f58] uppercase">
                                  No asset caches configured.
                                </p>
                              )}
                            </div>

                            <div className="space-y-2">
                              <div className="border-2 border-black bg-[#f6edd8] px-2 py-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="neo-copy text-[8px] font-black text-[#655f58] uppercase">
                                    Lookup winners
                                  </span>
                                  <span className="neo-copy border border-black bg-[#087d6d] px-1.5 py-0.5 text-[7px] font-black text-white uppercase">
                                    {clientAssetCacheLookup ? "Ready" : "Local"}
                                  </span>
                                </div>
                                <div className="mt-1.5 max-h-[120px] space-y-1 overflow-y-auto">
                                  {selectedClientAssetCacheEntries.length ? (
                                    selectedClientAssetCacheEntries.map((entry) => (
                                      <div
                                        key={`${entry.cacheKey}-${entry.entryId}`}
                                        className="border-2 border-black bg-[#fbf4e7] px-2 py-1"
                                      >
                                        <div className="flex min-w-0 items-center justify-between gap-2">
                                          <strong className="neo-copy truncate text-[9px] font-black text-[#171411] uppercase">
                                            {entry.cacheKey}
                                          </strong>
                                          <span className="neo-copy shrink-0 text-[8px] font-black text-[#087d6d] uppercase">
                                            P{entry.priority}
                                          </span>
                                        </div>
                                        <p
                                          className="neo-copy mt-0.5 truncate text-[8px] font-bold text-[#655f58]"
                                          title={entry.cachePath}
                                        >
                                          {entry.cachePath}
                                        </p>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-2 text-[9px] font-black text-[#655f58] uppercase">
                                      No winning cache keys.
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="border-2 border-black bg-[#f6edd8] px-2 py-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="neo-copy text-[8px] font-black text-[#655f58] uppercase">
                                    Conflicts
                                  </span>
                                  <span
                                    className={`neo-copy border border-black px-1.5 py-0.5 text-[7px] font-black uppercase ${
                                      selectedClientAssetCacheConflicts.length
                                        ? "bg-[#b7102a] text-white"
                                        : "bg-[#087d6d] text-white"
                                    }`}
                                  >
                                    {selectedClientAssetCacheConflicts.length}
                                  </span>
                                </div>
                                <div className="mt-1.5 max-h-[120px] space-y-1 overflow-y-auto">
                                  {selectedClientAssetCacheConflicts.length ? (
                                    selectedClientAssetCacheConflicts.map((conflict) => (
                                      <div
                                        key={conflict.cacheKey}
                                        className="border-2 border-black bg-[#fbf4e7] px-2 py-1"
                                      >
                                        <strong className="neo-copy block truncate text-[9px] font-black text-[#171411] uppercase">
                                          {conflict.cacheKey}
                                        </strong>
                                        <p className="neo-copy mt-0.5 line-clamp-2 text-[8px] leading-3 font-bold text-[#655f58] uppercase">
                                          {conflict.entries
                                            .map(
                                              (entry) =>
                                                `${entry.ownerDisplayName} P${entry.priority}`,
                                            )
                                            .join(" / ")}
                                        </p>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-2 text-[9px] font-black text-[#655f58] uppercase">
                                      No cache conflicts.
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="min-w-0 space-y-3">
                          <div className="border-2 border-black bg-[#efe6d4] p-2 shadow-[2px_2px_0_#171411]">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black pb-2">
                              <h4 className="neo-copy inline-flex items-center gap-1 text-[10px] font-black uppercase">
                                <PackagePlus className="h-4 w-4" />
                                Silent install staging
                              </h4>
                              <span
                                className={`neo-copy border-2 border-black px-2 py-1 text-[8px] font-black uppercase shadow-[1px_1px_0_#171411] ${clientInstallStageClass}`}
                              >
                                {clientInstallStageStatusLabel}
                              </span>
                            </div>
                            <div className="space-y-2 pt-2">
                              <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-1.5 text-[9px] leading-4 font-black text-[#171411] uppercase">
                                {clientInstallStagePlan?.message ??
                                  "Resolving safe platform-client install staging plan."}
                              </p>

                              <div className="grid gap-1.5 sm:grid-cols-2">
                                {[
                                  {
                                    label: "Target",
                                    value: clientInstallStagePlan?.targetLabel ?? "Resolving",
                                  },
                                  {
                                    label: "Consent",
                                    value: clientInstallStagePlan?.requiresUserConsent
                                      ? "User click"
                                      : "Not required",
                                  },
                                  {
                                    label: "License",
                                    value: clientInstallStagePlan?.requiresLicenseReview
                                      ? "Review"
                                      : "Clear",
                                  },
                                  {
                                    label: "Admin",
                                    value: clientInstallStagePlan?.requiresAdminReview
                                      ? "May prompt"
                                      : "No auto elevation",
                                  },
                                ].map((item) => (
                                  <div
                                    key={item.label}
                                    className="border-2 border-black bg-[#f6edd8] px-2 py-1"
                                  >
                                    <span className="neo-copy block text-[8px] font-black text-[#655f58] uppercase">
                                      {item.label}
                                    </span>
                                    <strong className="neo-copy mt-0.5 block truncate text-[9px] font-black text-[#171411] uppercase">
                                      {item.value}
                                    </strong>
                                  </div>
                                ))}
                              </div>

                              <div className="border-2 border-black bg-[#f6edd8] px-2 py-1.5">
                                <span className="neo-copy block text-[8px] font-black text-[#655f58] uppercase">
                                  Staged target
                                </span>
                                <p
                                  className="neo-copy mt-1 truncate text-[9px] font-bold text-[#171411]"
                                  title={clientInstallTargetValue}
                                >
                                  {clientInstallTargetValue}
                                </p>
                              </div>

                              <div className="space-y-1.5">
                                {clientInstallStagePlan?.checks.length ? (
                                  clientInstallStagePlan.checks.map((check) => (
                                    <div
                                      key={`${check.label}-${check.detail}`}
                                      className="border-2 border-black bg-[#fbf4e7] px-2 py-1.5"
                                    >
                                      <div className="flex min-w-0 items-center justify-between gap-2">
                                        <span className="neo-copy truncate text-[9px] font-black uppercase">
                                          {check.label}
                                        </span>
                                        <span
                                          className={`neo-copy shrink-0 border border-black px-1.5 py-0.5 text-[7px] font-black uppercase ${clientInstallCheckClasses(
                                            check.status,
                                          )}`}
                                        >
                                          {check.status}
                                        </span>
                                      </div>
                                      <p className="neo-copy mt-1 line-clamp-2 text-[8px] leading-3 font-bold text-[#655f58] uppercase">
                                        {check.detail}
                                      </p>
                                    </div>
                                  ))
                                ) : (
                                  <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-3 text-[9px] font-black text-[#655f58] uppercase">
                                    Waiting for staging checks.
                                  </p>
                                )}
                              </div>

                              <p className="neo-copy border-2 border-black bg-[#b7102a] px-2 py-1.5 text-[9px] leading-4 font-black text-white uppercase">
                                No silent download. No auto-apply. OG-Launcher only opens the staged
                                provider source after your click.
                              </p>

                              <button
                                className="neo-copy inline-flex h-9 w-full items-center justify-center gap-1.5 border-2 border-black bg-[#e8c843] px-3 text-[10px] font-black text-[#171411] uppercase shadow-[2px_2px_0_#171411] hover:bg-[#8cf5e4] disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
                                type="button"
                                disabled={
                                  !clientInstallStagePlan?.canProceed || isClientManagerBusy
                                }
                                onClick={() => void handleOpenClientInstaller()}
                              >
                                {clientManagerBusyAction === "installer" ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : clientInstallStagePlan?.stage === "localInstaller" ? (
                                  <Power className="h-4 w-4" />
                                ) : (
                                  <ExternalLink className="h-4 w-4" />
                                )}
                                Open staged target
                              </button>
                            </div>
                          </div>

                          <div className="border-2 border-black bg-[#efe6d4] p-2 shadow-[2px_2px_0_#171411]">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black pb-2">
                              <h4 className="neo-copy inline-flex items-center gap-1 text-[10px] font-black uppercase">
                                <RefreshCw className="h-4 w-4" />
                                Auto-apply guard
                              </h4>
                              <span
                                className={`neo-copy border-2 border-black px-2 py-1 text-[8px] font-black uppercase shadow-[1px_1px_0_#171411] ${clientAutoApplyClass}`}
                              >
                                {clientAutoApplyStatusLabel}
                              </span>
                            </div>
                            <div className="space-y-2 pt-2">
                              <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-1.5 text-[9px] leading-4 font-black text-[#171411] uppercase">
                                {clientAutoApplyPlan?.message ??
                                  "Resolving guarded auto-apply readiness."}
                              </p>

                              <div className="grid gap-1.5 sm:grid-cols-2">
                                {[
                                  {
                                    label: "Policy",
                                    value: clientUpdatePolicyLabel(
                                      clientAutoApplyPlan?.policy ??
                                        clientModificationConfig?.updatePolicy ??
                                        "manual",
                                    ),
                                  },
                                  {
                                    label: "Auto apply",
                                    value: clientAutoApplyPlan?.canAutoApply ? "Ready" : "Blocked",
                                  },
                                  {
                                    label: "Provider",
                                    value: clientAutoApplyPlan?.requiresProviderMechanism
                                      ? "Required"
                                      : "Ready",
                                  },
                                  {
                                    label: "Silent exec",
                                    value: clientAutoApplyPlan?.allowsSilentExecution
                                      ? "Allowed"
                                      : "Never",
                                  },
                                ].map((item) => (
                                  <div
                                    key={item.label}
                                    className="border-2 border-black bg-[#f6edd8] px-2 py-1"
                                  >
                                    <span className="neo-copy block text-[8px] font-black text-[#655f58] uppercase">
                                      {item.label}
                                    </span>
                                    <strong className="neo-copy mt-0.5 block truncate text-[9px] font-black text-[#171411] uppercase">
                                      {item.value}
                                    </strong>
                                  </div>
                                ))}
                              </div>

                              <div className="border-2 border-black bg-[#f6edd8] px-2 py-1.5">
                                <span className="neo-copy block text-[8px] font-black text-[#655f58] uppercase">
                                  Safe fallback target
                                </span>
                                <p
                                  className="neo-copy mt-1 truncate text-[9px] font-bold text-[#171411]"
                                  title={clientAutoApplySafeTarget}
                                >
                                  {clientAutoApplySafeTarget}
                                </p>
                              </div>

                              <div className="space-y-1.5">
                                {clientAutoApplyPlan?.checks.length ? (
                                  clientAutoApplyPlan.checks.map((check) => (
                                    <div
                                      key={`${check.label}-${check.detail}`}
                                      className="border-2 border-black bg-[#fbf4e7] px-2 py-1.5"
                                    >
                                      <div className="flex min-w-0 items-center justify-between gap-2">
                                        <span className="neo-copy truncate text-[9px] font-black uppercase">
                                          {check.label}
                                        </span>
                                        <span
                                          className={`neo-copy shrink-0 border border-black px-1.5 py-0.5 text-[7px] font-black uppercase ${clientInstallCheckClasses(
                                            check.status,
                                          )}`}
                                        >
                                          {check.status}
                                        </span>
                                      </div>
                                      <p className="neo-copy mt-1 line-clamp-2 text-[8px] leading-3 font-bold text-[#655f58] uppercase">
                                        {check.detail}
                                      </p>
                                    </div>
                                  ))
                                ) : (
                                  <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-3 text-[9px] font-black text-[#655f58] uppercase">
                                    Waiting for auto-apply guard checks.
                                  </p>
                                )}
                              </div>

                              <p className="neo-copy border-2 border-black bg-[#b7102a] px-2 py-1.5 text-[9px] leading-4 font-black text-white uppercase">
                                Auto-apply never uses download pages, local installer paths, silent
                                flags, or background elevation. Provider-approved update mechanisms
                                only.
                              </p>
                            </div>
                          </div>

                          <div className="border-2 border-black bg-[#efe6d4] p-2 shadow-[2px_2px_0_#171411]">
                            <h4 className="neo-copy mb-2 text-[10px] font-black uppercase">
                              Update metadata
                            </h4>
                            <label className="neo-copy mb-2 block text-[9px] font-black text-[#655f58] uppercase">
                              Latest known version
                              <input
                                className="mt-1 h-8 w-full border-2 border-black bg-[#f6edd8] px-2 text-[10px] font-bold text-[#171411] outline-none"
                                value={clientModificationConfig?.latestKnownVersion ?? ""}
                                onChange={(event) =>
                                  patchClientConfigDraft({
                                    latestKnownVersion: event.currentTarget.value,
                                  })
                                }
                              />
                            </label>
                            <label className="neo-copy mb-2 block text-[9px] font-black text-[#655f58] uppercase">
                              Local installer path
                              <input
                                className="mt-1 h-8 w-full border-2 border-black bg-[#f6edd8] px-2 text-[10px] font-bold text-[#171411] outline-none"
                                value={clientModificationConfig?.localInstallerPath ?? ""}
                                onChange={(event) =>
                                  patchClientConfigDraft({
                                    localInstallerPath: event.currentTarget.value,
                                  })
                                }
                              />
                            </label>
                            <label className="neo-copy mb-2 block text-[9px] font-black text-[#655f58] uppercase">
                              Local updater path
                              <input
                                className="mt-1 h-8 w-full border-2 border-black bg-[#f6edd8] px-2 text-[10px] font-bold text-[#171411] outline-none"
                                value={clientModificationConfig?.localUpdaterPath ?? ""}
                                onChange={(event) =>
                                  patchClientConfigDraft({
                                    localUpdaterPath: event.currentTarget.value,
                                  })
                                }
                              />
                            </label>
                            <label className="neo-copy mb-2 block text-[9px] font-black text-[#655f58] uppercase">
                              Update policy
                              <select
                                className="mt-1 h-8 w-full border-2 border-black bg-[#f6edd8] px-2 text-[10px] font-black text-[#171411] uppercase outline-none"
                                value={clientModificationConfig?.updatePolicy ?? "manual"}
                                onChange={(event) =>
                                  patchClientConfigDraft({
                                    updatePolicy: event.currentTarget
                                      .value as ClientModificationConfig["updatePolicy"],
                                  })
                                }
                              >
                                <option value="manual">Manual</option>
                                <option value="notifyOnly">Notify only</option>
                                <option value="openClient">Open client</option>
                                <option value="autoApply">Auto apply (guarded)</option>
                              </select>
                            </label>
                            <button
                              className="neo-copy inline-flex h-9 w-full items-center justify-center gap-1.5 border-2 border-black bg-[#087d6d] px-3 text-[10px] font-black text-white uppercase shadow-[2px_2px_0_#171411] hover:bg-[#00695f] disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
                              type="button"
                              disabled={!clientModificationConfig || isClientManagerBusy}
                              onClick={() => void handleSaveClientConfig()}
                            >
                              {clientManagerBusyAction === "save_config" ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                              Save manager config
                            </button>
                            {clientInstallerMetadata ? (
                              <p className="neo-copy mt-2 text-[9px] leading-4 font-black text-[#655f58] uppercase">
                                {clientInstallerMetadata.installNotes}
                              </p>
                            ) : null}
                          </div>

                          <div className="border-2 border-black bg-[#efe6d4] shadow-[2px_2px_0_#171411]">
                            <div className="flex items-center gap-1 border-b-2 border-black px-2 py-1.5">
                              <History className="h-4 w-4" />
                              <h4 className="neo-copy text-[10px] font-black uppercase">
                                Update history
                              </h4>
                            </div>
                            <div className="max-h-[220px] space-y-1.5 overflow-y-auto p-2">
                              {clientUpdateHistory.length > 0 ? (
                                clientUpdateHistory.slice(0, 5).map((item) => (
                                  <div
                                    key={item.id}
                                    className="border-2 border-black bg-[#fbf4e7] px-2 py-1.5"
                                  >
                                    <div className="flex min-w-0 items-center justify-between gap-2">
                                      <div className="flex min-w-0 items-center gap-1.5">
                                        <span className="neo-copy truncate text-[9px] font-black uppercase">
                                          {clientManagerActionLabel(item.action)}
                                        </span>
                                        <span className="neo-copy shrink-0 border border-black bg-[#e8c843] px-1.5 py-0.5 text-[7px] font-black text-[#171411] uppercase">
                                          {clientManagerHistoryStatusLabel(item.status)}
                                        </span>
                                      </div>
                                      <span className="neo-copy shrink-0 text-[8px] font-black text-[#655f58] uppercase">
                                        {formatRelativeTime(item.checkedAt)}
                                      </span>
                                    </div>
                                    <p className="neo-copy mt-1 line-clamp-2 text-[9px] leading-4 font-bold text-[#655f58] uppercase">
                                      {item.message}
                                    </p>
                                  </div>
                                ))
                              ) : (
                                <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-3 text-[10px] font-black text-[#655f58] uppercase">
                                  No update actions recorded.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                  ) : null}

                  <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Metric
                      icon={<Cloud className="h-7 w-7 fill-black text-black" />}
                      title="Save Data"
                      value={
                        enrichedSelectedGame.saveFiles && enrichedSelectedGame.saveFiles.length > 0
                          ? `${enrichedSelectedGame.saveFiles.length} tracked file${
                              enrichedSelectedGame.saveFiles.length === 1 ? "" : "s"
                            }`
                          : "Not detected"
                      }
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

                {isSettingsPopoverOpen && selectedVariant && gameActionCapabilities ? (
                  <>
                    <button
                      aria-label="Close Game Options"
                      className="fixed inset-0 z-40 cursor-default bg-[#171411]/55"
                      type="button"
                      onClick={() => setIsSettingsPopoverOpen(false)}
                    />
                    <section
                      aria-labelledby="game-options-title"
                      aria-modal="true"
                      className="neo-dots fixed inset-x-3 top-[84px] bottom-3 z-50 flex min-w-0 flex-col border-4 border-black bg-[#efe3cf] shadow-[8px_8px_0_#171411] sm:right-4 sm:left-auto sm:w-[500px]"
                      role="dialog"
                    >
                      <header className="flex items-start justify-between gap-3 border-b-4 border-black bg-[#171411] px-4 py-3 text-white">
                        <div className="min-w-0">
                          <span className="neo-copy text-[9px] font-black tracking-[0.18em] text-[#8cf5e4] uppercase">
                            Selected copy dossier
                          </span>
                          <h2
                            id="game-options-title"
                            className="neo-title truncate text-[25px] leading-none uppercase"
                          >
                            Game Options
                          </h2>
                          <p className="neo-copy mt-1 truncate text-[10px] font-black text-[#f6edd8] uppercase">
                            {enrichedSelectedGame.title}
                          </p>
                        </div>
                        <button
                          className="neo-copy border-2 border-white bg-[#fbf4e7] px-2 py-1 text-[9px] font-black text-[#171411] uppercase shadow-[2px_2px_0_#b7102a] hover:bg-[#8cf5e4]"
                          type="button"
                          onClick={() => setIsSettingsPopoverOpen(false)}
                        >
                          Close
                        </button>
                      </header>

                      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
                        <section
                          aria-label="Game copies"
                          className="mb-4 border-4 border-black bg-[#f6edd8] shadow-[4px_4px_0_#171411]"
                        >
                          <div className="flex items-center justify-between gap-2 border-b-2 border-black bg-[#e8c843] px-3 py-2">
                            <h3 className="neo-title text-[16px] leading-none uppercase">
                              Choose Copy
                            </h3>
                            <span className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-0.5 text-[8px] font-black uppercase">
                              {variantsForActions.length}{" "}
                              {variantsForActions.length === 1 ? "copy" : "copies"}
                            </span>
                          </div>
                          <div className="grid gap-2 p-2 sm:grid-cols-2">
                            {variantsForActions.map((variant) => {
                              const sourceLabel = getSourceDisplayLabel(getGameSource(variant));
                              const isSelected = variant.id === selectedVariant.id;
                              return (
                                <button
                                  key={variant.id}
                                  aria-label={`Select ${sourceLabel} copy`}
                                  aria-pressed={isSelected}
                                  className={`flex min-w-0 items-center gap-2 border-2 border-black px-2 py-2 text-left shadow-[2px_2px_0_#171411] transition-colors ${
                                    isSelected
                                      ? "bg-[#169b83] text-white"
                                      : "bg-[#fbf4e7] text-[#171411] hover:bg-[#8cf5e4]"
                                  }`}
                                  type="button"
                                  onClick={() => setSelectedVariantId(variant.id)}
                                >
                                  <PlatformSourceIcon game={variant} className="h-5 w-5 shrink-0" />
                                  <span className="min-w-0 flex-1">
                                    <span className="neo-copy block truncate text-[11px] font-black uppercase">
                                      {sourceLabel}
                                    </span>
                                    <span className="neo-copy block truncate text-[8px] font-black uppercase opacity-80">
                                      {variant.status.replace("_", " ")}
                                    </span>
                                  </span>
                                  {isSelected ? (
                                    <span className="neo-copy border-2 border-black bg-[#fbf4e7] px-1.5 py-0.5 text-[7px] font-black text-[#171411] uppercase">
                                      Selected
                                    </span>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        </section>

                        <section
                          aria-label="Selected copy actions"
                          className="mb-4 border-4 border-black bg-[#fbf4e7] shadow-[4px_4px_0_#171411]"
                        >
                          <div className="flex items-center justify-between gap-2 border-b-2 border-black bg-[#b7102a] px-3 py-2 text-white">
                            <h3 className="neo-title text-[17px] leading-none uppercase">
                              Selected Copy
                            </h3>
                            <span className="neo-copy border-2 border-black bg-[#f6edd8] px-2 py-0.5 text-[8px] font-black text-[#171411] uppercase">
                              {getSourceDisplayLabel(getGameSource(selectedVariant))}
                            </span>
                          </div>
                          <div className="grid gap-2 p-2 sm:grid-cols-2">
                            <button
                              className="min-h-16 border-2 border-black bg-[#ded3c1] px-2 py-2 text-left disabled:cursor-not-allowed disabled:text-[#655f58]"
                              disabled={!gameActionCapabilities.support.available}
                              title={gameActionCapabilities.support.reason}
                              type="button"
                              onClick={() => void handleOpenSelectedSupport()}
                            >
                              <span className="neo-copy flex items-center gap-1 text-[10px] font-black uppercase">
                                <CircleHelp className="h-4 w-4" />
                                {gameActionCapabilities.support.label}
                              </span>
                              <span className="neo-copy mt-1 block text-[8px] leading-3 font-bold uppercase">
                                {gameActionCapabilities.support.reason}
                              </span>
                            </button>
                            <button
                              className="min-h-16 border-2 border-black bg-[#e8c843] px-2 py-2 text-left shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:bg-[#ded3c1] disabled:text-[#655f58] disabled:shadow-none"
                              disabled={
                                !gameActionCapabilities.update.available || busyGameAction !== null
                              }
                              title={gameActionCapabilities.update.reason}
                              type="button"
                              onClick={() =>
                                handleRequestGameAction(
                                  "update",
                                  gameActionCapabilities.update as GameActionCapability,
                                )
                              }
                            >
                              <span className="neo-copy flex items-center gap-1 text-[10px] font-black uppercase">
                                <Download
                                  className={`h-4 w-4 ${busyGameAction === "update" ? "animate-pulse" : ""}`}
                                />
                                {busyGameAction === "update"
                                  ? "Updating..."
                                  : gameActionCapabilities.update.label}
                              </span>
                              <span className="neo-copy mt-1 block text-[8px] leading-3 font-bold uppercase">
                                {gameActionCapabilities.update.reason}
                              </span>
                            </button>
                            <button
                              className="min-h-16 border-2 border-black bg-[#f6edd8] px-2 py-2 text-left shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:bg-[#ded3c1] disabled:text-[#655f58] disabled:shadow-none"
                              disabled={
                                !gameActionCapabilities.verify.available || busyGameAction !== null
                              }
                              title={gameActionCapabilities.verify.reason}
                              type="button"
                              onClick={() =>
                                handleRequestGameAction(
                                  "verify",
                                  gameActionCapabilities.verify as GameActionCapability,
                                )
                              }
                            >
                              <span className="neo-copy flex items-center gap-1 text-[10px] font-black uppercase">
                                <RefreshCw
                                  className={`h-4 w-4 ${busyGameAction === "verify" ? "animate-spin" : ""}`}
                                />
                                {busyGameAction === "verify"
                                  ? "Verifying..."
                                  : gameActionCapabilities.verify.label}
                              </span>
                              <span className="neo-copy mt-1 block text-[8px] leading-3 font-bold uppercase">
                                {gameActionCapabilities.verify.reason}
                              </span>
                            </button>
                            <button
                              className="min-h-16 border-2 border-black bg-[#f6edd8] px-2 py-2 text-left shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:bg-[#ded3c1] disabled:text-[#655f58] disabled:shadow-none"
                              disabled={
                                !gameActionCapabilities.repair.available || busyGameAction !== null
                              }
                              title={gameActionCapabilities.repair.reason}
                              type="button"
                              onClick={() =>
                                handleRequestGameAction(
                                  "repair",
                                  gameActionCapabilities.repair as GameActionCapability,
                                )
                              }
                            >
                              <span className="neo-copy flex items-center gap-1 text-[10px] font-black uppercase">
                                <RotateCcw
                                  className={`h-4 w-4 ${busyGameAction === "repair" ? "animate-spin" : ""}`}
                                />
                                {busyGameAction === "repair"
                                  ? "Repairing..."
                                  : gameActionCapabilities.repair.label}
                              </span>
                              <span className="neo-copy mt-1 block text-[8px] leading-3 font-bold uppercase">
                                {gameActionCapabilities.repair.reason}
                              </span>
                            </button>
                            <button
                              className="min-h-16 border-2 border-black bg-[#b7102a] px-2 py-2 text-left text-white shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:bg-[#ded3c1] disabled:text-[#655f58] disabled:shadow-none"
                              disabled={
                                !gameActionCapabilities.uninstall.available ||
                                busyGameAction !== null
                              }
                              title={gameActionCapabilities.uninstall.reason}
                              type="button"
                              onClick={() =>
                                handleRequestGameAction(
                                  gameActionCapabilities.uninstall.action as GameAction,
                                  gameActionCapabilities.uninstall as GameActionCapability,
                                )
                              }
                            >
                              <span className="neo-copy flex items-center gap-1 text-[10px] font-black uppercase">
                                <Trash2
                                  className={`h-4 w-4 ${busyGameAction === gameActionCapabilities.uninstall.action ? "animate-pulse" : ""}`}
                                />
                                {busyGameAction === gameActionCapabilities.uninstall.action
                                  ? "Working..."
                                  : gameActionCapabilities.uninstall.label}
                              </span>
                              <span className="neo-copy mt-1 block text-[8px] leading-3 font-bold uppercase">
                                {gameActionCapabilities.uninstall.reason}
                              </span>
                            </button>
                            <button
                              className="min-h-16 border-2 border-black bg-[#171411] px-2 py-2 text-left text-white shadow-[2px_2px_0_#b7102a] disabled:cursor-not-allowed disabled:bg-[#ded3c1] disabled:text-[#655f58] disabled:shadow-none"
                              disabled={!gameActionCapabilities.clientManager.available}
                              title={gameActionCapabilities.clientManager.reason}
                              type="button"
                              onClick={() => {
                                setIsSettingsPopoverOpen(false);
                                setIsClientManagerOpen(true);
                              }}
                            >
                              <span className="neo-copy flex items-center gap-1 text-[10px] font-black uppercase">
                                <Settings className="h-4 w-4" />
                                {gameActionCapabilities.clientManager.label}
                              </span>
                              <span className="neo-copy mt-1 block text-[8px] leading-3 font-bold uppercase">
                                {gameActionCapabilities.clientManager.reason}
                              </span>
                            </button>
                          </div>

                          <div
                            aria-live="polite"
                            className="mx-2 mb-2 border-2 border-black bg-[#efe3cf] p-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="neo-copy text-[9px] font-black uppercase">
                                Action status
                              </span>
                              {gameActionResult ? (
                                <span
                                  className={`neo-copy border-2 border-black px-2 py-0.5 text-[8px] font-black uppercase ${gameActionOutcomeClasses(gameActionResult.outcome)}`}
                                >
                                  {gameActionOutcomeLabel(gameActionResult.outcome)}
                                </span>
                              ) : isLoadingGameActionCapabilities ? (
                                <span className="neo-copy flex items-center gap-1 border-2 border-black bg-[#e8c843] px-2 py-0.5 text-[8px] font-black uppercase">
                                  <Loader2 className="h-3 w-3 animate-spin" /> Loading
                                </span>
                              ) : null}
                            </div>
                            <p className="neo-copy mt-1 text-[9px] font-black uppercase">
                              {gameActionError
                                ? `Action failed: ${gameActionError}`
                                : gameActionCapabilityError
                                  ? `Capabilities unavailable: ${gameActionCapabilityError}`
                                  : gameActionResult
                                    ? gameActionResult.message
                                    : isLoadingGameActionCapabilities
                                      ? "Reading native capabilities for this exact selected copy."
                                      : isDesktopRuntime
                                        ? "Choose an available action for this selected copy."
                                        : "Native actions stay disabled in the browser preview."}
                            </p>
                            {gameActionResult?.details.length ? (
                              <ul className="neo-copy mt-1 list-inside list-disc text-[8px] font-bold uppercase">
                                {gameActionResult.details.map((detail) => (
                                  <li key={detail}>{detail}</li>
                                ))}
                              </ul>
                            ) : null}
                          </div>

                          <div className="border-t-2 border-black p-2">
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
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <h4 className="neo-title text-[15px] uppercase">Local Artwork</h4>
                              <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-0.5 text-[8px] font-black uppercase">
                                Selected copy / local only
                              </span>
                            </div>
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
                                  className="flex h-9 items-center justify-center gap-1 border-2 border-black bg-[#ded3c1] px-1 text-[9px] font-black uppercase hover:bg-[#8cf5e4]"
                                  title={`Choose custom ${label.toLowerCase()} artwork`}
                                  onClick={() => openArtworkPicker(kind)}
                                >
                                  <ImagePlus className="h-3.5 w-3.5" />
                                  {label}
                                </button>
                              ))}
                            </div>
                            {hasCustomArtwork(selectedVariantArtwork) ? (
                              <button
                                type="button"
                                className="mt-2 flex h-8 w-full items-center justify-center gap-1 border-2 border-black bg-[#fbf4e7] px-2 text-[9px] font-black uppercase hover:bg-[#e8c843]"
                                onClick={() =>
                                  primaryArtworkGameId && onResetCustomArtwork(primaryArtworkGameId)
                                }
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Reset Selected Copy Artwork
                              </button>
                            ) : (
                              <p className="neo-copy mt-2 text-[9px] font-bold text-[#655f58] uppercase">
                                Uses scanned {getSourceDisplayLabel(getGameSource(selectedVariant))}{" "}
                                artwork.
                              </p>
                            )}
                          </div>
                        </section>

                        <section
                          aria-label="All copies organization"
                          className="border-4 border-black bg-[#f6edd8] shadow-[4px_4px_0_#171411]"
                        >
                          <div className="flex items-center justify-between gap-2 border-b-2 border-black bg-[#169b83] px-3 py-2 text-white">
                            <h3 className="neo-title text-[17px] leading-none uppercase">
                              Library Organization
                            </h3>
                            <span className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-0.5 text-[8px] font-black text-[#171411] uppercase">
                              All copies
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 border-b-2 border-black p-2">
                            <button
                              className={`border-2 border-black px-2 py-2 text-left shadow-[2px_2px_0_#171411] ${
                                isGroupFavorite
                                  ? "bg-[#b7102a] text-white"
                                  : "bg-[#fbf4e7] hover:bg-[#e8c843]"
                              }`}
                              disabled={!groupActionCapabilities.favorite.available}
                              title={groupActionCapabilities.favorite.reason}
                              type="button"
                              onClick={() => {
                                const nextFavorite = !isGroupFavorite;
                                setFavorites((previous) => ({
                                  ...previous,
                                  ...Object.fromEntries(variantIds.map((id) => [id, nextFavorite])),
                                }));
                              }}
                            >
                              <span className="neo-copy flex items-center gap-1 text-[10px] font-black uppercase">
                                <Heart
                                  className={`h-4 w-4 ${isGroupFavorite ? "fill-current" : ""}`}
                                />
                                {groupActionCapabilities.favorite.label}
                              </span>
                              <span className="neo-copy mt-1 block text-[8px] font-black uppercase">
                                {favoriteScopeLabel}
                              </span>
                            </button>
                            <button
                              className={`border-2 border-black px-2 py-2 text-left shadow-[2px_2px_0_#171411] ${
                                isGroupHidden
                                  ? "bg-[#b7102a] text-white"
                                  : "bg-[#fbf4e7] hover:bg-[#e8c843]"
                              }`}
                              disabled={!groupActionCapabilities.hidden.available}
                              title={groupActionCapabilities.hidden.reason}
                              type="button"
                              onClick={() => {
                                const nextHidden = !isGroupHidden;
                                setHiddenGames((previous) => ({
                                  ...previous,
                                  ...Object.fromEntries(variantIds.map((id) => [id, nextHidden])),
                                }));
                              }}
                            >
                              <span className="neo-copy text-[10px] font-black uppercase">
                                {groupActionCapabilities.hidden.label}
                              </span>
                              <span className="neo-copy mt-1 block text-[8px] font-black uppercase">
                                {hiddenScopeLabel}
                              </span>
                            </button>
                          </div>

                          <div className="border-b-2 border-black p-2">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <h4 className="neo-title text-[14px] uppercase">
                                {groupActionCapabilities.categories.label}
                              </h4>
                              <span className="neo-copy text-[8px] font-black uppercase">
                                Applies to all copies
                              </span>
                            </div>
                            <div className="flex gap-1">
                              <input
                                aria-label="New category for all copies"
                                className="neo-copy h-8 min-w-0 flex-1 border-2 border-black bg-[#fbf4e7] px-2 text-[10px] font-bold outline-none"
                                placeholder="e.g. Retro, Co-op"
                                value={newCategoryInput}
                                onChange={(event) => setNewCategoryInput(event.target.value)}
                              />
                              <button
                                className="border-2 border-black bg-[#171411] px-3 text-[10px] font-black text-white uppercase hover:bg-[#087d6d]"
                                type="button"
                                onClick={() => {
                                  const category = newCategoryInput.trim();
                                  if (!category) return;
                                  setCustomCategories((previous) => ({
                                    ...previous,
                                    ...Object.fromEntries(
                                      variantIds.map((id) => [
                                        id,
                                        Array.from(new Set([...(previous[id] ?? []), category])),
                                      ]),
                                    ),
                                  }));
                                  setNewCategoryInput("");
                                }}
                              >
                                Add
                              </button>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {groupCategories.length > 0 ? (
                                groupCategories.map((category) => {
                                  const memberCount = variantIds.filter((id) =>
                                    customCategories[id]?.includes(category),
                                  ).length;
                                  return (
                                    <button
                                      key={category}
                                      className="neo-copy border-2 border-black bg-[#efe3cf] px-2 py-1 text-[8px] font-black uppercase hover:bg-[#b7102a] hover:text-white"
                                      title={`Remove ${category} from all copies`}
                                      type="button"
                                      onClick={() =>
                                        setCustomCategories((previous) => ({
                                          ...previous,
                                          ...Object.fromEntries(
                                            variantIds.map((id) => [
                                              id,
                                              (previous[id] ?? []).filter(
                                                (item) => item !== category,
                                              ),
                                            ]),
                                          ),
                                        }))
                                      }
                                    >
                                      {category} / {memberCount}/{variantIds.length}
                                    </button>
                                  );
                                })
                              ) : (
                                <span className="neo-copy text-[8px] font-bold text-[#655f58] uppercase">
                                  No categories assigned.
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="p-2">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <h4 className="neo-title text-[14px] uppercase">
                                {groupActionCapabilities.collections.label}
                              </h4>
                              <span className="neo-copy text-[8px] font-black uppercase">
                                Applies to all copies
                              </span>
                            </div>
                            <select
                              aria-label="Add all copies to collection"
                              className="neo-copy mb-2 h-8 w-full border-2 border-black bg-[#fbf4e7] px-2 text-[10px] font-bold outline-none"
                              defaultValue=""
                              onChange={(event) => {
                                const collection = event.currentTarget.value;
                                if (!collection) return;
                                setManualCollections((previous) => ({
                                  ...previous,
                                  [collection]: Array.from(
                                    new Set([...(previous[collection] ?? []), ...variantIds]),
                                  ),
                                }));
                                event.currentTarget.value = "";
                              }}
                            >
                              <option value="">Choose collection...</option>
                              {Object.keys(manualCollections).map((collection) => (
                                <option key={collection} value={collection}>
                                  {collection}
                                </option>
                              ))}
                            </select>
                            {Object.keys(manualCollections).length > 0 ? (
                              <div className="mb-2 space-y-1.5">
                                {Object.entries(manualCollections).map(([collection, gameIds]) => {
                                  const memberCount = variantIds.filter((id) =>
                                    gameIds.includes(id),
                                  ).length;
                                  const isRenaming = renamingCollectionName === collection;
                                  const isDeletePending = pendingCollectionDelete === collection;
                                  return (
                                    <div
                                      key={collection}
                                      className="border-2 border-black bg-[#efe3cf] p-1.5"
                                    >
                                      {isRenaming ? (
                                        <div className="mb-1 flex gap-1">
                                          <input
                                            aria-label={`Rename ${collection}`}
                                            className="neo-copy h-7 min-w-0 flex-1 border-2 border-black bg-[#fbf4e7] px-2 text-[9px] font-bold outline-none"
                                            value={collectionRenameInput}
                                            onChange={(event) =>
                                              setCollectionRenameInput(event.target.value)
                                            }
                                          />
                                          <button
                                            className="neo-copy border-2 border-black bg-[#169b83] px-2 text-[8px] font-black text-white uppercase"
                                            type="button"
                                            onClick={() => {
                                              const nextName = collectionRenameInput.trim();
                                              if (!nextName) return;
                                              setManualCollections((previous) => {
                                                const next = { ...previous };
                                                const sourceIds = next[collection] ?? [];
                                                delete next[collection];
                                                next[nextName] = Array.from(
                                                  new Set([
                                                    ...(next[nextName] ?? []),
                                                    ...sourceIds,
                                                  ]),
                                                );
                                                return next;
                                              });
                                              setRenamingCollectionName(null);
                                              setCollectionRenameInput("");
                                            }}
                                          >
                                            Save
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="mb-1 flex items-center justify-between gap-2">
                                          <span className="neo-copy truncate text-[9px] font-black uppercase">
                                            {collection} / {memberCount}/{variantIds.length} copies
                                          </span>
                                          <button
                                            className="neo-copy border-2 border-black bg-[#fbf4e7] px-1.5 py-0.5 text-[7px] font-black uppercase hover:bg-[#8cf5e4]"
                                            type="button"
                                            onClick={() => {
                                              setRenamingCollectionName(collection);
                                              setCollectionRenameInput(collection);
                                              setPendingCollectionDelete(null);
                                            }}
                                          >
                                            Rename local
                                          </button>
                                        </div>
                                      )}
                                      <div className="grid grid-cols-2 gap-1">
                                        <button
                                          className="neo-copy border-2 border-black bg-[#fbf4e7] px-1 py-1 text-[7px] font-black uppercase hover:bg-[#e8c843] disabled:cursor-not-allowed disabled:text-[#8b857c]"
                                          disabled={memberCount === 0}
                                          type="button"
                                          onClick={() =>
                                            setManualCollections((previous) => ({
                                              ...previous,
                                              [collection]: (previous[collection] ?? []).filter(
                                                (id) => !variantIds.includes(id),
                                              ),
                                            }))
                                          }
                                        >
                                          Remove all copies
                                        </button>
                                        <button
                                          className="neo-copy border-2 border-black bg-[#b7102a] px-1 py-1 text-[7px] font-black text-white uppercase hover:bg-[#990a20]"
                                          type="button"
                                          onClick={() => {
                                            if (!isDeletePending) {
                                              setPendingCollectionDelete(collection);
                                              setRenamingCollectionName(null);
                                              return;
                                            }
                                            setManualCollections((previous) => {
                                              const next = { ...previous };
                                              delete next[collection];
                                              return next;
                                            });
                                            setPendingCollectionDelete(null);
                                          }}
                                        >
                                          {isDeletePending
                                            ? "Confirm delete local collection"
                                            : "Delete local collection"}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                            <div className="flex gap-1">
                              <input
                                aria-label="New collection for all copies"
                                className="neo-copy h-8 min-w-0 flex-1 border-2 border-black bg-[#fbf4e7] px-2 text-[10px] font-bold outline-none"
                                placeholder="New collection..."
                                value={newCollectionInput}
                                onChange={(event) => setNewCollectionInput(event.target.value)}
                              />
                              <button
                                className="border-2 border-black bg-[#171411] px-3 text-[10px] font-black text-white uppercase hover:bg-[#087d6d]"
                                type="button"
                                onClick={() => {
                                  const collection = newCollectionInput.trim();
                                  if (!collection) return;
                                  setManualCollections((previous) => ({
                                    ...previous,
                                    [collection]: Array.from(
                                      new Set([...(previous[collection] ?? []), ...variantIds]),
                                    ),
                                  }));
                                  setNewCollectionInput("");
                                }}
                              >
                                Create
                              </button>
                            </div>
                          </div>
                        </section>
                      </div>
                    </section>
                  </>
                ) : null}
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
                    <div className="mb-2">
                      <h2 className="text-[15px] leading-none font-black uppercase">Activity</h2>
                    </div>

                    <GameUpdateFeed game={enrichedSelectedGame} />
                  </section>

                  {/* Right Column: RICH METADATA & Hardware cards */}
                  <aside className="space-y-4">
                    {hostedCommunityArtworkReadiness ? (
                      <React.Suspense fallback={null}>
                        <HostedCommunityArtworkReadinessPanel
                          readiness={hostedCommunityArtworkReadiness}
                        />
                      </React.Suspense>
                    ) : null}

                    {hostedCommunityArtworkModerationConsole ? (
                      <React.Suspense fallback={null}>
                        <HostedCommunityArtworkModeratorConsolePanel
                          initialConsole={hostedCommunityArtworkModerationConsole}
                        />
                      </React.Suspense>
                    ) : null}

                    {igdbCrossPlayReadinessPlan ? (
                      <React.Suspense fallback={null}>
                        <IgdbCrossPlayReadinessPanel plan={igdbCrossPlayReadinessPlan} />
                      </React.Suspense>
                    ) : null}

                    <section className="border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]">
                      <div className="flex items-center justify-between gap-2 border-b-2 border-black px-3 py-2">
                        <h2 className="text-[15px] leading-none font-black uppercase">
                          Achievements
                        </h2>
                        <div className="flex items-center gap-1.5">
                          <span className="neo-copy border-2 border-black bg-[#087d6d] px-2 py-0.5 text-[10px] font-black text-white uppercase">
                            {unlockedAchievementCount}/{achievements.length} ·{" "}
                            {achievementProgressPercent}%
                          </span>
                        </div>
                      </div>

                      {achievementProviderStatuses.length > 0 ? (
                        <div className="flex flex-wrap gap-1 border-b-2 border-black bg-[#efe6d4] px-2 py-1.5">
                          {achievementProviderStatuses.map((provider) => (
                            <span
                              key={provider.source}
                              className={`neo-copy border-2 border-black px-1.5 py-0.5 text-[8px] font-black uppercase ${
                                provider.status === "available"
                                  ? "bg-[#087d6d] text-white"
                                  : provider.status === "failed" || provider.status === "private"
                                    ? "bg-[#b7102a] text-white"
                                    : "bg-[#fbf4e7] text-[#55504a]"
                              }`}
                              title={getAchievementProviderStatusMessage(provider)}
                            >
                              {provider.source}: {provider.status}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {achievements.length > 0 ? (
                        <>
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
                            <div className="flex items-center gap-1">
                              <select
                                aria-label="Sort achievements"
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
                                    <h3 className="truncate text-[12px] leading-tight font-black uppercase">
                                      {achievement.name}
                                    </h3>
                                    {achievement.description ? (
                                      <p className="mt-1 line-clamp-2 text-[11px] leading-4 font-bold text-[#55504a]">
                                        {achievement.description}
                                      </p>
                                    ) : null}
                                    {typeof achievement.rarity === "number" ? (
                                      <p className="mt-1 text-[10px] font-black text-[#087d6d] uppercase">
                                        {achievement.rarity.toFixed(1)}% of players
                                      </p>
                                    ) : null}
                                    {achievementSources.length > 0 ? (
                                      <div className="mt-1 flex flex-wrap gap-1">
                                        {achievementSources.map((source) => (
                                          <span
                                            key={source}
                                            className="neo-copy border border-black bg-[#fbf4e7] px-1 py-0.5 text-[8px] font-black text-[#171411] uppercase"
                                          >
                                            {source}
                                          </span>
                                        ))}
                                        {achievementMeta.isAdditional ? (
                                          <span className="neo-copy border border-black bg-[#e8c843] px-1 py-0.5 text-[8px] font-black text-[#171411] uppercase">
                                            extra
                                          </span>
                                        ) : null}
                                        {achievementMeta.matchConfidence ? (
                                          <span className="neo-copy border border-black bg-[#171411] px-1 py-0.5 text-[8px] font-black text-[#fbf4e7] uppercase">
                                            {achievementMeta.matchConfidence}
                                          </span>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="flex flex-col items-end gap-1">
                                    {isUnlocked && achievement.unlockedAt ? (
                                      <span className="neo-copy text-[9px] font-bold text-[#55504a] uppercase">
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
                              <div className="py-4 text-center text-[11px] font-bold text-[#55504a] uppercase">
                                No achievements match this filter.
                              </div>
                            ) : null}
                          </div>
                        </>
                      ) : (
                        <div className="p-3 text-[12px] leading-5 font-bold text-[#55504a]">
                          {achievementAttentionMessage ??
                            "No achievements synced yet. Achievement auto-sync runs when a supported provider is available."}
                        </div>
                      )}
                    </section>

                    {/* Cross-store save planning */}
                    {crossStoreSaveSyncPlan ? (
                      <React.Suspense fallback={null}>
                        <CrossStoreSaveSyncPlanner plan={crossStoreSaveSyncPlan} />
                      </React.Suspense>
                    ) : null}

                    {crossStoreSaveMigrationReadiness ? (
                      <React.Suspense fallback={null}>
                        <CrossStoreSaveMigrationReadinessPanel
                          readiness={crossStoreSaveMigrationReadiness}
                        />
                      </React.Suspense>
                    ) : null}
                  </aside>
                </div>
              </section>
            </>
          ) : (
            <section className="grid min-h-[calc(100vh-124px)] place-items-center border-b-4 border-black bg-[#f8f0df] px-4 text-center">
              <div className="max-w-[560px] border-4 border-black bg-[#fbf4e7] p-6 shadow-[4px_4px_0_#171411]">
                <h1 className="text-[2.4rem] leading-none font-black uppercase sm:text-[3.25rem] lg:text-[4rem]">
                  No Games Detected
                </h1>
                <p className="neo-copy mt-4 text-[13px] leading-6 font-bold text-[#55504a] uppercase">
                  {isDiscoveringGames ? "Loading library..." : discoveryMessage}
                </p>
                <p className="neo-copy mt-3 text-[11px] leading-5 font-bold text-[#55504a] uppercase">
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
        cancelLabel="Cancel"
        confirmLabel={
          busyGameAction === pendingGameAction?.action
            ? "Working..."
            : (pendingGameAction?.capability.label ?? "Confirm Selected Copy Action")
        }
        destructive={pendingGameAction?.capability.destructive ?? false}
        message={
          gameActionError
            ? `Action could not start: ${gameActionError}`
            : `${pendingGameAction?.capability.reason ?? "This action affects only the selected copy."} Selected ID: ${pendingGameAction?.gameId ?? "unknown"}. Provider: ${pendingGameAction?.provider ?? "unknown"}.`
        }
        open={pendingGameAction !== null}
        title={gameActionError ? "Action Failed" : "Confirm Selected Copy Action"}
        onCancel={() => {
          if (busyGameAction) return;
          setPendingGameAction(null);
          setGameActionError(null);
        }}
        onConfirm={() => void handleConfirmGameAction()}
      />
      <ArtworkPreviewModal
        isOpen={pendingArtworkFile !== null}
        file={pendingArtworkFile}
        initialKind={pendingArtworkKind}
        onClose={closeArtworkPreview}
        onConfirm={onConfirmArtwork}
      />
    </>
  );
}
