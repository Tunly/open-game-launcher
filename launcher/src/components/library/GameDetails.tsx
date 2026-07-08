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
  Image,
  ImagePlus,
  Loader2,
  RotateCcw,
  FolderOpen,
  Power,
  Tag,
  X,
  ExternalLink,
  FolderCog,
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
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  ManifestTrustStatus,
  PlatformClientHealth,
  PlatformClientLifecycleEvent,
  VerifyGameFilesResponse,
  UnifiedAchievement,
} from "../../lib/types";
import {
  customArtworkHasKind,
  getAutoArtworkCandidates,
  getLocalCommunityArtworkCandidates,
  hasCustomArtwork,
  type CommunityArtworkCandidate,
  type CustomArtworkCandidate,
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
  getSourceDisplayLabel,
} from "../../lib/formatters";
import { getGameAssetUrl, getGameBannerStyle } from "../../lib/assets";
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
  launchPlatformClient,
  listControllers,
  openAchievementCacheFolder,
  openPlatformClientInstaller,
  openPlatformClientUpdater,
  pollPlatformClientHealth,
  previewPlatformClientAutoApply,
  previewPlatformClientInstall,
  repairGameFiles,
  savePlatformClientModificationConfig,
  toClientPlatformId,
  uninstallGame,
  verifyGameFiles,
} from "../../lib/launcher";
import { listScreenshots, useScreenshotCaptured } from "../../lib/overlay";
import { isLiveDownloadItem, useDownloadStore } from "../../stores/downloadStore";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { CrossPlayBadge } from "./CrossPlayBadge";
import { getCrossPlayPlatforms } from "../../lib/supabase/crossplay";
import {
  getMyScreenshotsForGame,
  getScreenshotLikeState,
  setScreenshotLiked,
  updateScreenshotPrivacy,
  uploadScreenshotForGame,
} from "../../lib/supabase/screenshots";
import {
  listHostedCommunityArtworkCandidates,
  reportHostedCommunityArtwork,
  setHostedCommunityArtworkVote,
  uploadCommunityArtworkForGame,
} from "../../lib/supabase/community-artwork";
import type { CrossPlayPlatform } from "../../lib/types/crossplay";
import type { Screenshot, ScreenshotLikeState } from "../../lib/types/screenshots";
import type { ScreenshotMeta } from "../../lib/types/overlay";
import { LibraryContext } from "../../context/LibraryContext";
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
const CloudSavesPanel = React.lazy(() =>
  import("./GameDetails/CloudSavesPanel").then((m) => ({ default: m.CloudSavesPanel })),
);
import { GameUpdateFeed } from "./GameUpdateFeed";
import { ControllerLayoutEditor } from "../controllers/ControllerLayoutEditor";
import type { ControllerDevice } from "../../lib/types/controllers";
import { ArtworkPreviewModal } from "./ArtworkPreviewModal";
import { CommunityArtworkGallery } from "./CommunityArtworkGallery";
import {
  CommunityArtworkUploadPanel,
  type CommunityArtworkUploadDraft,
} from "./CommunityArtworkUploadPanel";
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

type CategoryChipKind = "product" | "category" | "genre" | "tag";

interface CategoryChip {
  key: string;
  label: string;
  value: string;
  kind: CategoryChipKind;
  canApply: boolean;
}

interface GalleryScreenshot {
  id: string;
  cloudId?: string;
  caption: string;
  imageSrc?: string;
  sourceLabel: string;
  privacyLabel?: string;
  isPublic?: boolean;
  isOwned?: boolean;
  createdAt?: string;
  dimensions?: string;
  sizeLabel?: string;
  likeCount?: number;
  likedByMe?: boolean;
  likesAvailable?: boolean;
  canLike?: boolean;
}

const HOSTED_COMMUNITY_ARTWORK_MAX_BYTES = 5 * 1024 * 1024;
const HOSTED_COMMUNITY_ARTWORK_MIME_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
]);

function getArtworkKindLabel(kind: CustomArtworkKind): string {
  return kind === "cover" ? "Cover" : kind === "icon" ? "Icon" : "Logo";
}

function isAllowedHostedArtworkFile(file: File): boolean {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const hasAllowedExtension = ["gif", "jpeg", "jpg", "png", "svg", "webp"].includes(extension);
  return (
    file.size > 0 &&
    file.size <= HOSTED_COMMUNITY_ARTWORK_MAX_BYTES &&
    (HOSTED_COMMUNITY_ARTWORK_MIME_TYPES.has(file.type) || hasAllowedExtension)
  );
}

function getArtworkSourceBadge(sourceLabel: string): string {
  if (sourceLabel.startsWith("Current ")) return "Current";
  if (sourceLabel.startsWith("Launcher ")) return "Launcher";
  return sourceLabel;
}

function getVerificationSummary(result: VerifyGameFilesResponse | null): string {
  if (!result) return "Not checked";
  if (result.status === "verified") {
    return `${result.checkedFiles} files verified`;
  }
  return `${result.missingFiles.length} issue${result.missingFiles.length === 1 ? "" : "s"} found`;
}

const MANIFEST_TRUST_LABELS: Record<ManifestTrustStatus, string> = {
  missing: "No manifest",
  unsigned: "Unsigned manifest",
  signed: "Signed manifest",
  invalid: "Invalid manifest",
};

const MANIFEST_TRUST_CLASSES: Record<ManifestTrustStatus, string> = {
  missing: "bg-[#fbf4e7] text-[#655f58]",
  unsigned: "bg-[#f7d04a] text-[#171411]",
  signed: "bg-[#8cf5e4] text-[#171411]",
  invalid: "bg-[#b7102a] text-white",
};

function getManifestTrustLabel(result: VerifyGameFilesResponse | null): string {
  if (!result) return "Not checked";
  return MANIFEST_TRUST_LABELS[result.manifestTrust];
}

function getManifestTrustClasses(result: VerifyGameFilesResponse | null): string {
  if (!result) return "bg-[#fbf4e7] text-[#655f58]";
  return MANIFEST_TRUST_CLASSES[result.manifestTrust];
}

const PRODUCT_CATEGORY_LABELS: Record<string, string> = {
  game: "Game",
  software: "Software",
  video: "Video",
  dlc: "DLC",
  soundtrack: "Soundtrack",
  demo: "Demo",
  beta: "Beta Access",
};

function chipKey(kind: CategoryChipKind, value: string): string {
  return `${kind}:${value.trim().toLowerCase()}`;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function buildCategoryChips(game: Game, customCategoryLabels: string[]): CategoryChip[] {
  const chips: CategoryChip[] = [];
  const seen = new Set<string>();
  const productCategory = (game.productCategory || "game").trim().toLowerCase();

  function addChip(kind: CategoryChipKind, label: string, canApply: boolean, value = label) {
    const normalizedLabel = label.trim();
    const normalizedValue = value.trim();
    if (!normalizedLabel || !normalizedValue) return;
    const key = chipKey(kind, normalizedValue);
    if (seen.has(key)) return;
    seen.add(key);
    chips.push({
      key,
      kind,
      label: normalizedLabel,
      value: normalizedValue,
      canApply,
    });
  }

  addChip(
    "product",
    PRODUCT_CATEGORY_LABELS[productCategory] ?? productCategory,
    true,
    productCategory,
  );
  customCategoryLabels.forEach((label) => addChip("category", label, true));
  normalizeStringList(game.categories).forEach((label) => addChip("category", label, true));
  normalizeStringList(game.categoryLabels).forEach((label) => addChip("category", label, true));
  normalizeStringList(game.genres).forEach((label) => addChip("genre", label, true));
  normalizeStringList(game.tags).forEach((label) => addChip("tag", label, false));
  normalizeStringList(game.tagLabels).forEach((label) => addChip("tag", label, false));

  return chips;
}

function formatBytes(sizeBytes?: number | null): string | undefined {
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return undefined;
  }
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (sizeBytes >= 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`;
  }
  return `${sizeBytes} B`;
}

function formatScreenshotDate(iso?: string): string | undefined {
  if (!iso) {
    return undefined;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}

function makeDimensions(width?: number | null, height?: number | null): string | undefined {
  if (!width || !height) {
    return undefined;
  }
  return `${width}x${height}`;
}

function screenshotImageFromPath(path?: string | null): string | undefined {
  if (!path) {
    return undefined;
  }
  if (
    /^(https?:|data:|blob:)/i.test(path) ||
    path.startsWith("/") ||
    /^[a-zA-Z]:[\\/]/.test(path)
  ) {
    return getGameAssetUrl(path);
  }
  return undefined;
}

function mapLocalScreenshot(shot: ScreenshotMeta): GalleryScreenshot {
  return {
    id: `local-${shot.id}`,
    caption: shot.file_name || "Local screenshot",
    imageSrc: shot.base64_preview
      ? `data:image/jpeg;base64,${shot.base64_preview}`
      : screenshotImageFromPath(shot.path),
    sourceLabel: "Local",
    privacyLabel: "Device",
    createdAt: shot.created_at,
    dimensions: makeDimensions(shot.width, shot.height),
    sizeLabel: formatBytes(shot.size_bytes),
  };
}

function mapCloudScreenshot(shot: Screenshot): GalleryScreenshot {
  return {
    id: `cloud-${shot.id}`,
    cloudId: shot.id,
    caption: shot.caption || "Cloud screenshot",
    imageSrc:
      shot.thumbnailUrl ??
      shot.publicUrl ??
      screenshotImageFromPath(shot.thumbnailPath) ??
      screenshotImageFromPath(shot.storagePath),
    sourceLabel: "Cloud",
    privacyLabel: shot.isPublic ? "Public" : "Private",
    isPublic: shot.isPublic,
    isOwned: true,
    createdAt: shot.createdAt,
    dimensions: makeDimensions(shot.width, shot.height),
    sizeLabel: formatBytes(shot.sizeBytes),
    likeCount: 0,
    likedByMe: false,
    likesAvailable: false,
    canLike: false,
  };
}

function mapGameScreenshot(
  game: Game,
  entry: string | NonNullable<Game["screenshots"]>[number],
  index: number,
): GalleryScreenshot | null {
  if (typeof entry === "string") {
    return {
      id: `game-${game.id}-${index}`,
      caption: `${game.title} screenshot`,
      imageSrc: screenshotImageFromPath(entry),
      sourceLabel: "Game Art",
    };
  }
  const imageSrc =
    screenshotImageFromPath(entry.thumbnailUrl) ??
    screenshotImageFromPath(entry.imageUrl) ??
    screenshotImageFromPath(entry.url);
  if (!imageSrc) {
    return null;
  }
  return {
    id: `game-${entry.id ?? `${game.id}-${index}`}`,
    caption: entry.caption || `${game.title} screenshot`,
    imageSrc,
    sourceLabel: entry.sourceLabel || entry.source || entry.provider || "Game Art",
    privacyLabel:
      typeof entry.isPublic === "boolean" ? (entry.isPublic ? "Public" : "Private") : undefined,
    createdAt: entry.createdAt ?? undefined,
    dimensions: makeDimensions(entry.width, entry.height),
    sizeLabel: formatBytes(entry.sizeBytes),
  };
}

function getGameScreenshots(game: Game): GalleryScreenshot[] {
  const fromScreenshots = (game.screenshots ?? [])
    .map((entry, index) => mapGameScreenshot(game, entry, index))
    .filter((entry): entry is GalleryScreenshot => Boolean(entry));
  const fromUrls = (game.screenshotUrls ?? [])
    .map((url, index) => mapGameScreenshot(game, url, index + fromScreenshots.length))
    .filter((entry): entry is GalleryScreenshot => Boolean(entry));
  return [...fromScreenshots, ...fromUrls];
}

function dedupeGalleryScreenshots(shots: GalleryScreenshot[]): GalleryScreenshot[] {
  const seen = new Set<string>();
  return shots.filter((shot) => {
    const fingerprint = shot.imageSrc || shot.id;
    if (seen.has(fingerprint)) {
      return false;
    }
    seen.add(fingerprint);
    return true;
  });
}

function applyScreenshotLikeState(
  shots: GalleryScreenshot[],
  likes: Record<string, ScreenshotLikeState>,
  available: boolean,
  canLike: boolean,
): GalleryScreenshot[] {
  return shots.map((shot) => {
    if (!shot.cloudId) {
      return shot;
    }
    const likeState = likes[shot.cloudId] ?? { count: 0, likedByMe: false };
    return {
      ...shot,
      likeCount: likeState.count,
      likedByMe: likeState.likedByMe,
      likesAvailable: available,
      canLike,
    };
  });
}

function mergeUpdatedCloudScreenshot(
  current: GalleryScreenshot,
  updated: Screenshot,
): GalleryScreenshot {
  return {
    ...mapCloudScreenshot(updated),
    likeCount: current.likeCount,
    likedByMe: current.likedByMe,
    likesAvailable: current.likesAvailable,
    canLike: current.canLike,
  };
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

function clientHealthClasses(health: PlatformClientHealth | null, error: string | null) {
  if (error) {
    return {
      chip: "bg-[#b7102a] text-white",
      dot: "bg-[#fff9ed]",
      label: "Unknown",
    };
  }
  if (!health) {
    return {
      chip: "bg-[#fbf4e7] text-[#655f58]",
      dot: "bg-[#655f58]",
      label: "Checking",
    };
  }
  if (health.running) {
    return {
      chip: "bg-[#087d6d] text-white",
      dot: "bg-[#8cf5e4]",
      label: "Running",
    };
  }
  if (!health.installed) {
    return {
      chip: "bg-[#b7102a] text-white",
      dot: "bg-[#fff9ed]",
      label: "Missing",
    };
  }
  return {
    chip: "bg-[#fbf4e7] text-[#171411]",
    dot: "bg-[#e8c843]",
    label: "Available",
  };
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

function clientHealthDetail(health: PlatformClientHealth | null, error: string | null): string {
  if (error) return error;
  if (!health) return "Scanning local processes";
  if (health.running) {
    return runtimeMetadataLabel(health) ?? "Client process is active";
  }
  if (health.installed) {
    return health.installPath ?? "Installed; not running";
  }
  return "Client install not detected";
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

function CategoryChips({
  chips,
  activeChipKeys,
  onApply,
}: {
  chips: CategoryChip[];
  activeChipKeys: Set<string>;
  onApply: (chip: CategoryChip) => void;
}) {
  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 border-t-2 border-black/20 pt-2 xl:col-span-2">
      <span className="neo-copy mr-1 inline-flex items-center gap-1 text-[9px] font-black uppercase text-[#55504a]">
        <Tag className="h-3.5 w-3.5 text-[#b7102a]" />
        Tags
      </span>
      {chips.map((chip) => {
        const isActive = activeChipKeys.has(chip.key);
        const label =
          chip.kind === "product"
            ? `Type: ${chip.label}`
            : chip.kind === "genre"
              ? `Genre: ${chip.label}`
              : chip.kind === "tag"
                ? `Tag: ${chip.label}`
                : chip.label;
        const className = `neo-copy inline-flex h-6 max-w-[160px] items-center border-2 border-black px-2 text-[9px] font-black uppercase shadow-[1px_1px_0_#171411] ${
          isActive
            ? "bg-[#087d6d] text-white"
            : chip.kind === "tag"
              ? "bg-[#f6edd8] text-[#655f58]"
              : chip.kind === "product"
                ? "bg-[#e8c843] text-[#171411] hover:bg-[#8cf5e4]"
                : "bg-[#fbf4e7] text-[#171411] hover:bg-[#8cf5e4]"
        }`;

        if (!chip.canApply) {
          return (
            <span key={chip.key} className={className} title="Metadata tag">
              <span className="truncate">{label}</span>
            </span>
          );
        }

        return (
          <button
            key={chip.key}
            type="button"
            className={className}
            title={`Filter library by ${label}`}
            onClick={() => onApply(chip)}
          >
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
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
        <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-1.5 text-[9px] font-black uppercase leading-4 text-[#171411]">
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
              <span className="neo-copy block text-[8px] font-black uppercase text-[#655f58]">
                {item.label}
              </span>
              <strong className="neo-copy mt-0.5 block truncate text-[9px] font-black uppercase text-[#171411]">
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
                    <p className="truncate text-[11px] font-black uppercase text-[#171411]">
                      {entry.label}
                    </p>
                    <p className="neo-copy mt-1 truncate text-[8px] font-bold uppercase text-[#655f58]">
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
                      <span className="neo-copy truncate text-[8px] font-black uppercase text-[#171411]">
                        {check.label}
                      </span>
                      <span
                        className={`neo-copy border border-black px-1 py-0.5 text-center text-[7px] font-black uppercase ${clientPathOverlayCheckClasses(
                          check.status,
                        )}`}
                      >
                        {check.status}
                      </span>
                      <span className="neo-copy truncate text-[8px] font-bold uppercase text-[#655f58]">
                        {check.detail}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <p className="neo-copy border-2 border-black bg-[#b7102a] px-2 py-1.5 text-[9px] font-black uppercase leading-4 text-white">
          Preflight only. Real path overlay application stays gated until provider-approved mount or
          OS-safe apply support exists.
        </p>
      </div>
    </div>
  );
}

function ScreenshotGallery({
  shots,
  loading,
  error,
  actionMessage,
  isUploading,
  onPreview,
  onUploadClick,
  onTogglePrivacy,
  onToggleLike,
  privacyBusyId,
  likeBusyId,
}: {
  shots: GalleryScreenshot[];
  loading: boolean;
  error: string | null;
  actionMessage: string | null;
  isUploading: boolean;
  onPreview: (shot: GalleryScreenshot) => void;
  onUploadClick: () => void;
  onTogglePrivacy: (shot: GalleryScreenshot) => void;
  onToggleLike: (shot: GalleryScreenshot) => void;
  privacyBusyId: string | null;
  likeBusyId: string | null;
}) {
  return (
    <section className="mt-4 border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]">
      <div className="flex items-center justify-between gap-2 border-b-2 border-black px-3 py-2">
        <h2 className="text-[15px] font-black uppercase leading-none">Screenshots</h2>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="neo-copy inline-flex h-8 items-center gap-1 border-2 border-black bg-[#b7102a] px-2 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411] hover:bg-[#990a20] disabled:opacity-60"
            onClick={onUploadClick}
            disabled={isUploading}
            title="Upload screenshot"
          >
            {isUploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" />
            )}
            Upload
          </button>
          <span className="neo-copy border-2 border-black bg-[#f3e8d7] px-2 py-0.5 text-[10px] font-black uppercase text-[#55504a]">
            {loading ? "Scanning" : `${shots.length} Captures`}
          </span>
        </div>
      </div>

      {error || actionMessage ? (
        <div className="neo-copy border-b-2 border-black bg-[#efe3cf] px-3 py-1 text-[9px] font-black uppercase text-[#655f58]">
          {actionMessage ?? error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid min-h-[190px] place-items-center bg-[#f3e8d7]">
          <Loader2 className="h-6 w-6 animate-spin text-[#b7102a]" />
        </div>
      ) : shots.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 bg-[#f3e8d7] p-3 sm:grid-cols-2 lg:grid-cols-3">
          {shots.map((shot) => {
            const isPrivacyBusy = Boolean(shot.cloudId && privacyBusyId === shot.cloudId);
            const isLikeBusy = Boolean(shot.cloudId && likeBusyId === shot.cloudId);
            const canShowCloudControls = Boolean(shot.cloudId);
            return (
              <article
                key={shot.id}
                className="group min-w-0 border-2 border-black bg-[#fff9ed] text-left shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#171411]"
              >
                <button
                  type="button"
                  className="block w-full min-w-0 text-left"
                  onClick={() => onPreview(shot)}
                >
                  <div className="relative aspect-video overflow-hidden border-b-2 border-black bg-[#d8cbb7]">
                    {shot.imageSrc ? (
                      <img
                        alt={shot.caption}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        src={shot.imageSrc}
                      />
                    ) : (
                      <div className="neo-dots flex h-full items-center justify-center">
                        <Image className="h-8 w-8 text-[#655f58]" />
                      </div>
                    )}
                    <div className="absolute left-1 top-1 flex flex-wrap gap-1">
                      <span className="neo-copy border border-black bg-[#171411] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#fbf4e7]">
                        {shot.sourceLabel}
                      </span>
                      {shot.privacyLabel ? (
                        <span className="neo-copy border border-black bg-[#087d6d] px-1.5 py-0.5 text-[8px] font-black uppercase text-white">
                          {shot.privacyLabel}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="min-w-0 px-2 py-1.5">
                    <p className="truncate text-[11px] font-black uppercase text-[#171411]">
                      {shot.caption}
                    </p>
                    <p className="neo-copy mt-0.5 truncate text-[9px] font-bold uppercase text-[#655f58]">
                      {[formatScreenshotDate(shot.createdAt), shot.dimensions, shot.sizeLabel]
                        .filter(Boolean)
                        .join(" / ") || "No image preview"}
                    </p>
                  </div>
                </button>

                {canShowCloudControls ? (
                  <div className="grid grid-cols-2 gap-1 border-t-2 border-black bg-[#efe3cf] p-1">
                    {shot.isOwned ? (
                      <button
                        type="button"
                        className="neo-copy inline-flex h-8 min-w-0 items-center justify-center gap-1 border-2 border-black bg-[#fbf4e7] px-2 text-[9px] font-black uppercase shadow-[1px_1px_0_#171411] hover:bg-[#8cf5e4] disabled:opacity-60"
                        onClick={() => onTogglePrivacy(shot)}
                        disabled={isPrivacyBusy}
                        title={shot.isPublic ? "Make private" : "Make public"}
                      >
                        {isPrivacyBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : shot.isPublic ? (
                          <LockKeyholeOpen className="h-3.5 w-3.5" />
                        ) : (
                          <LockKeyhole className="h-3.5 w-3.5" />
                        )}
                        {shot.isPublic ? "Public" : "Private"}
                      </button>
                    ) : (
                      <span className="neo-copy inline-flex h-8 items-center justify-center border-2 border-black bg-[#fbf4e7] px-2 text-[9px] font-black uppercase text-[#655f58]">
                        View Only
                      </span>
                    )}
                    <button
                      type="button"
                      className={`neo-copy inline-flex h-8 min-w-0 items-center justify-center gap-1 border-2 border-black px-2 text-[9px] font-black uppercase shadow-[1px_1px_0_#171411] disabled:opacity-60 ${
                        shot.likedByMe ? "bg-[#b7102a] text-white" : "bg-[#fbf4e7] text-[#171411]"
                      }`}
                      onClick={() => onToggleLike(shot)}
                      disabled={!shot.likesAvailable || !shot.canLike || isLikeBusy}
                      title={
                        shot.likesAvailable
                          ? shot.canLike
                            ? shot.likedByMe
                              ? "Unlike screenshot"
                              : "Like screenshot"
                            : "Sign in to like"
                          : "Screenshot likes unavailable"
                      }
                    >
                      {isLikeBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Heart className={`h-3.5 w-3.5 ${shot.likedByMe ? "fill-current" : ""}`} />
                      )}
                      {shot.likeCount ?? 0}
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="neo-dots bg-[#f3e8d7] p-3">
          <div className="border-2 border-dashed border-black bg-[#fff9ed] px-3 py-5 text-center">
            <p className="neo-copy text-[11px] font-black uppercase text-[#655f58]">
              No screenshots found for this game.
            </p>
          </div>
        </div>
      )}
    </section>
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
  seedHostedArtworkUploadPending?: boolean;
  igdbCrossPlayReadinessPlan?: IgdbCrossPlayReadinessPlan;
  shouldShowLibraryLoading: boolean;
  handlePlay: () => void;
  onInstallFromProvider?: () => void;
  hasInstallableVariants?: boolean;
  isGameRunning?: boolean;
  gameRuntime?: GameRuntimeStatus | null;
  handleCaptureScreenshot: () => void | Promise<void>;
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
  onArtworkDrop: (gameId: string, kind: CustomArtworkKind, file: File) => void;
  onApplyCustomArtworkUrl: (
    gameId: string,
    kind: CustomArtworkKind,
    url: string,
    sourceLabel: string,
  ) => void;
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
  gameVariants = [],
  crossStoreSaveMigrationReadiness,
  crossStoreSaveSyncPlan,
  hostedCommunityArtworkReadiness,
  hostedCommunityArtworkModerationConsole,
  seedHostedArtworkUploadPending = false,
  igdbCrossPlayReadinessPlan,
  shouldShowLibraryLoading,
  handlePlay,
  onInstallFromProvider,
  hasInstallableVariants = false,
  isGameRunning = false,
  gameRuntime = null,
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
  onArtworkDrop,
  onApplyCustomArtworkUrl,
  onConfirmArtwork,
  onResetCustomArtwork,
  pendingArtworkFile,
  pendingArtworkKind,
  openArtworkPreview,
  closeArtworkPreview,
}: GameDetailsProps) {
  // Local state that was originally in LibraryPage
  const [isSettingsPopoverOpen, setIsSettingsPopoverOpen] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [isUninstallDialogOpen, setIsUninstallDialogOpen] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [uninstallError, setUninstallError] = useState<string | null>(null);
  const [achievementFilter, setAchievementFilter] = useState("all");
  const [achievementSort, setAchievementSort] = useState<"rarity" | "name" | "date">("rarity");
  const [galleryShots, setGalleryShots] = useState<GalleryScreenshot[]>([]);
  const [isGalleryLoading, setIsGalleryLoading] = useState(false);
  const [isScreenshotUploading, setIsScreenshotUploading] = useState(false);
  const [screenshotPrivacyBusyId, setScreenshotPrivacyBusyId] = useState<string | null>(null);
  const [screenshotLikeBusyId, setScreenshotLikeBusyId] = useState<string | null>(null);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [galleryActionMessage, setGalleryActionMessage] = useState<string | null>(null);
  const [previewScreenshot, setPreviewScreenshot] = useState<GalleryScreenshot | null>(null);
  const [hostedCommunityArtworkCandidates, setHostedCommunityArtworkCandidates] = useState<
    CommunityArtworkCandidate[]
  >([]);
  const [isHostedCommunityArtworkLoading, setIsHostedCommunityArtworkLoading] = useState(false);
  const [hostedCommunityArtworkMessage, setHostedCommunityArtworkMessage] = useState<string | null>(
    null,
  );
  const [communityArtworkBusyId, setCommunityArtworkBusyId] = useState<string | null>(null);
  const [communityArtworkUploadMessage, setCommunityArtworkUploadMessage] = useState<string | null>(
    null,
  );
  const [communityArtworkUploadSubmissions, setCommunityArtworkUploadSubmissions] = useState<
    CommunityArtworkCandidate[]
  >([]);
  const [isCommunityArtworkUploading, setIsCommunityArtworkUploading] = useState(false);
  const [fileIntegrityResult, setFileIntegrityResult] = useState<VerifyGameFilesResponse | null>(
    null,
  );
  const [isVerifyingFiles, setIsVerifyingFiles] = useState(false);
  const [isRepairingFiles, setIsRepairingFiles] = useState(false);
  const libraryContext = useContext(LibraryContext);
  const coverArtworkInputRef = useRef<HTMLInputElement>(null);
  const iconArtworkInputRef = useRef<HTMLInputElement>(null);
  const logoArtworkInputRef = useRef<HTMLInputElement>(null);
  const screenshotUploadInputRef = useRef<HTMLInputElement>(null);
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
  const variantIdKey = variantIds.join("|");
  const primaryArtworkGameId = artworkGameId ?? enrichedSelectedGame?.id;
  const autoArtworkCandidates = useMemo(
    () => (enrichedSelectedGame ? getAutoArtworkCandidates(enrichedSelectedGame).slice(0, 6) : []),
    [enrichedSelectedGame],
  );
  const seededCommunityArtworkUploadSubmissions = useMemo<CommunityArtworkCandidate[]>(() => {
    if (!seedHostedArtworkUploadPending || !enrichedSelectedGame) {
      return [];
    }

    const title = `${enrichedSelectedGame.title} Verify Cover`;
    return [
      {
        artist: "OG Verify",
        description: "Local verification pending upload.",
        downloads: 0,
        hosted: true,
        id: `verify-pending-${enrichedSelectedGame.id}`,
        kind: "cover",
        moderationStatus: "pending",
        sourceLabel: title,
        tags: ["cover", "community-upload", "verify"],
        title,
        url: enrichedSelectedGame.coverUrl ?? "",
        userVote: 0,
        votes: 0,
      },
    ];
  }, [enrichedSelectedGame, seedHostedArtworkUploadPending]);
  const displayedCommunityArtworkUploadSubmissions = useMemo(
    () => [
      ...communityArtworkUploadSubmissions,
      ...seededCommunityArtworkUploadSubmissions.filter(
        (seeded) =>
          !communityArtworkUploadSubmissions.some((submission) => submission.id === seeded.id),
      ),
    ],
    [communityArtworkUploadSubmissions, seededCommunityArtworkUploadSubmissions],
  );
  const localCommunityArtworkCandidates = useMemo(
    () => (enrichedSelectedGame ? getLocalCommunityArtworkCandidates() : []),
    [enrichedSelectedGame],
  );
  const communityArtworkCandidates = useMemo(() => {
    if (!enrichedSelectedGame) return [];
    return [...hostedCommunityArtworkCandidates, ...localCommunityArtworkCandidates];
  }, [enrichedSelectedGame, hostedCommunityArtworkCandidates, localCommunityArtworkCandidates]);
  const isGroupFavorite = variantIds.some((id) => favorites[id] === true);
  const isGroupHidden = variantIds.length > 0 && variantIds.every((id) => hiddenGames[id] === true);
  const groupCategories = useMemo(
    () =>
      Array.from(
        new Set(
          (variantIdKey ? variantIdKey.split("|") : []).flatMap((id) => customCategories[id] || []),
        ),
      ),
    [customCategories, variantIdKey],
  );
  const unlockedAchievementCount = achievements.filter(
    (achievement) => achievement.unlockedAt,
  ).length;
  const achievementProgressPercent =
    achievements.length === 0
      ? 0
      : Math.round((unlockedAchievementCount / achievements.length) * 100);
  const galleryGameIdKey = variantIdKey || enrichedSelectedGame?.id || "";
  const categoryChips = useMemo(
    () => (enrichedSelectedGame ? buildCategoryChips(enrichedSelectedGame, groupCategories) : []),
    [enrichedSelectedGame, groupCategories],
  );
  const activeAdvancedFilters = libraryContext?.filters.advancedFilters;
  const activeCategoryChipKeys = useMemo(() => {
    const filters = activeAdvancedFilters;
    const keys = new Set<string>();
    if (!filters) {
      return keys;
    }
    categoryChips.forEach((chip) => {
      if (
        chip.kind === "product" &&
        filters.productCategories.length === 1 &&
        filters.productCategories[0]?.toLowerCase() === chip.value.toLowerCase()
      ) {
        keys.add(chip.key);
      }
      if (chip.kind === "category" && filters.categories.includes(chip.value)) {
        keys.add(chip.key);
      }
      if (chip.kind === "genre" && filters.genres.includes(chip.value)) {
        keys.add(chip.key);
      }
    });
    return keys;
  }, [activeAdvancedFilters, categoryChips]);
  const handleApplyCategoryChip = useCallback(
    (chip: CategoryChip) => {
      if (!chip.canApply || !libraryContext) {
        return;
      }

      libraryContext.filters.setAdvancedFilters((current) => {
        if (chip.kind === "product") {
          return { ...current, productCategories: [chip.value.toLowerCase()] };
        }
        if (chip.kind === "category") {
          return { ...current, categories: [chip.value] };
        }
        if (chip.kind === "genre") {
          return { ...current, genres: [chip.value] };
        }
        return current;
      });
      clearCollectionSelection();
      setStatusMessage(`Library filter applied: ${chip.label}`);
    },
    [clearCollectionSelection, libraryContext, setStatusMessage],
  );

  const navigate = useNavigate();
  const [crossPlayPlatforms, setCrossPlayPlatforms] = useState<CrossPlayPlatform[]>([]);
  const [isControllerPanelOpen, setIsControllerPanelOpen] = useState(false);
  const [controllerDevices, setControllerDevices] = useState<ControllerDevice[]>([]);
  const [isBannerDragOver, setIsBannerDragOver] = useState(false);
  const [clientHealth, setClientHealth] = useState<PlatformClientHealth | null>(null);
  const [isClientHealthLoading, setIsClientHealthLoading] = useState(false);
  const [clientHealthError, setClientHealthError] = useState<string | null>(null);
  const [isStartingClient, setIsStartingClient] = useState(false);
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
    enrichedSelectedGame ? getGameSource(enrichedSelectedGame) : null,
  );
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
  const selectedClientHealthClasses = clientHealthClasses(clientHealth, clientHealthError);
  const canStartSourceClient = Boolean(
    selectedSourceClientId &&
    clientHealth?.canLaunch &&
    clientHealth.installed &&
    !clientHealth.running,
  );
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
  const loadScreenshotGallery = useCallback(async () => {
    if (!enrichedSelectedGame) {
      setGalleryShots([]);
      setGalleryError(null);
      setIsGalleryLoading(false);
      return;
    }

    setIsGalleryLoading(true);
    setGalleryError(null);

    try {
      const gameIds = galleryGameIdKey ? galleryGameIdKey.split("|").filter(Boolean) : [];
      const gameShots = getGameScreenshots(enrichedSelectedGame);
      const [localResult, cloudResult] = await Promise.allSettled([
        listScreenshots(),
        gameIds.length > 0 ? getMyScreenshotsForGame(gameIds) : Promise.resolve([]),
      ]);

      const nextShots = [...gameShots];
      if (localResult.status === "fulfilled") {
        nextShots.push(...localResult.value.map(mapLocalScreenshot));
      }
      if (cloudResult.status === "fulfilled") {
        nextShots.push(...cloudResult.value.map(mapCloudScreenshot));
      }

      let mergedShots = dedupeGalleryScreenshots(nextShots);
      const cloudIds = mergedShots
        .map((shot) => shot.cloudId)
        .filter((id): id is string => Boolean(id));
      if (cloudIds.length > 0) {
        const likeState = await getScreenshotLikeState(cloudIds);
        mergedShots = applyScreenshotLikeState(
          mergedShots,
          likeState.likes,
          likeState.available,
          likeState.canLike,
        );
      }

      setGalleryShots(mergedShots);
      setGalleryError(
        localResult.status === "rejected" ? "Local screenshot command unavailable." : null,
      );
    } catch (error) {
      setGalleryShots(getGameScreenshots(enrichedSelectedGame));
      setGalleryError(`Screenshot gallery unavailable: ${getErrorMessage(error)}`);
    } finally {
      setIsGalleryLoading(false);
    }
  }, [enrichedSelectedGame, galleryGameIdKey]);
  const loadHostedCommunityArtwork = useCallback(async () => {
    if (!enrichedSelectedGame || !primaryArtworkGameId) {
      setHostedCommunityArtworkCandidates([]);
      setHostedCommunityArtworkMessage(null);
      setIsHostedCommunityArtworkLoading(false);
      return;
    }

    setIsHostedCommunityArtworkLoading(true);
    try {
      const result = await listHostedCommunityArtworkCandidates(primaryArtworkGameId);
      if (!result.ok) {
        setHostedCommunityArtworkCandidates([]);
        setHostedCommunityArtworkMessage(`${result.message} Local deck shown.`);
        return;
      }

      setHostedCommunityArtworkCandidates(result.value);
      setHostedCommunityArtworkMessage(
        result.value.length > 0
          ? "Approved hosted artwork loaded. Votes, reports, and ranking sync through Supabase."
          : "Hosted community artwork is online; no approved art is published for this game yet. Local deck shown.",
      );
    } catch (error) {
      setHostedCommunityArtworkCandidates([]);
      setHostedCommunityArtworkMessage(
        `Hosted community artwork unavailable: ${getErrorMessage(error)}. Local deck shown.`,
      );
    } finally {
      setIsHostedCommunityArtworkLoading(false);
    }
  }, [enrichedSelectedGame, primaryArtworkGameId]);
  const updateHostedCommunityArtworkCandidate = useCallback(
    (
      artworkId: string,
      updater: (candidate: CommunityArtworkCandidate) => CommunityArtworkCandidate,
    ) => {
      setHostedCommunityArtworkCandidates((current) =>
        current.map((candidate) => (candidate.id === artworkId ? updater(candidate) : candidate)),
      );
    },
    [],
  );
  const handleScreenshotCaptured = useCallback((shot: ScreenshotMeta) => {
    setGalleryShots((current) => dedupeGalleryScreenshots([mapLocalScreenshot(shot), ...current]));
  }, []);
  const handleCaptureAndRefresh = useCallback(async () => {
    await handleCaptureScreenshot();
    window.setTimeout(() => {
      void loadScreenshotGallery();
    }, 300);
  }, [handleCaptureScreenshot, loadScreenshotGallery]);
  const updateGalleryCloudShot = useCallback(
    (cloudId: string, updater: (shot: GalleryScreenshot) => GalleryScreenshot) => {
      setGalleryShots((current) =>
        current.map((shot) => (shot.cloudId === cloudId ? updater(shot) : shot)),
      );
      setPreviewScreenshot((current) =>
        current?.cloudId === cloudId ? updater(current) : current,
      );
    },
    [],
  );
  const handleScreenshotUploadClick = useCallback(() => {
    setGalleryActionMessage(null);
    screenshotUploadInputRef.current?.click();
  }, []);
  const handleScreenshotFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }
      if (!enrichedSelectedGame) {
        setGalleryActionMessage("Select a game before uploading a screenshot.");
        return;
      }

      setIsScreenshotUploading(true);
      setGalleryActionMessage(null);
      try {
        const result = await uploadScreenshotForGame({
          file,
          gameId: enrichedSelectedGame.id,
          caption: file.name,
          isPublic: false,
        });

        if (!result.ok) {
          setGalleryActionMessage(result.message);
          return;
        }

        let uploadedShot = mapCloudScreenshot(result.value);
        const likeState = await getScreenshotLikeState([result.value.id]);
        uploadedShot =
          applyScreenshotLikeState(
            [uploadedShot],
            likeState.likes,
            likeState.available,
            likeState.canLike,
          )[0] ?? uploadedShot;
        setGalleryShots((current) => dedupeGalleryScreenshots([uploadedShot, ...current]));
        setGalleryActionMessage("Screenshot uploaded as private cloud capture.");
      } catch (error) {
        setGalleryActionMessage(`Screenshot upload failed: ${getErrorMessage(error)}`);
      } finally {
        setIsScreenshotUploading(false);
      }
    },
    [enrichedSelectedGame],
  );
  const handleToggleScreenshotPrivacy = useCallback(
    async (shot: GalleryScreenshot) => {
      if (!shot.cloudId || !shot.isOwned) {
        setGalleryActionMessage("Only cloud screenshots from this account can change privacy.");
        return;
      }

      setScreenshotPrivacyBusyId(shot.cloudId);
      setGalleryActionMessage(null);
      try {
        const nextIsPublic = !shot.isPublic;
        const result = await updateScreenshotPrivacy(shot.cloudId, nextIsPublic);
        if (!result.ok) {
          setGalleryActionMessage(result.message);
          return;
        }

        updateGalleryCloudShot(shot.cloudId, (current) =>
          mergeUpdatedCloudScreenshot(current, result.value),
        );
        setGalleryActionMessage(
          nextIsPublic ? "Screenshot is now public." : "Screenshot is now private.",
        );
      } catch (error) {
        setGalleryActionMessage(`Screenshot privacy failed: ${getErrorMessage(error)}`);
      } finally {
        setScreenshotPrivacyBusyId(null);
      }
    },
    [updateGalleryCloudShot],
  );
  const handleToggleScreenshotLike = useCallback(
    async (shot: GalleryScreenshot) => {
      if (!shot.cloudId) {
        return;
      }

      setScreenshotLikeBusyId(shot.cloudId);
      setGalleryActionMessage(null);
      try {
        const result = await setScreenshotLiked(shot.cloudId, !shot.likedByMe);
        if (!result.ok) {
          setGalleryActionMessage(result.message);
          return;
        }

        updateGalleryCloudShot(shot.cloudId, (current) => ({
          ...current,
          likeCount: result.value.count,
          likedByMe: result.value.likedByMe,
          likesAvailable: true,
          canLike: true,
        }));
      } catch (error) {
        setGalleryActionMessage(`Screenshot like failed: ${getErrorMessage(error)}`);
      } finally {
        setScreenshotLikeBusyId(null);
      }
    },
    [updateGalleryCloudShot],
  );

  useScreenshotCaptured(handleScreenshotCaptured);

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
      setClientHealthError(null);
      setIsClientHealthLoading(false);
      return;
    }

    let cancelled = false;
    const refreshClientHealth = (maxAgeMs = 5_000) => {
      setIsClientHealthLoading(true);
      pollPlatformClientHealth({ maxAgeMs })
        .then((statuses) => {
          if (cancelled) return;
          setClientHealth(
            statuses.find((status) => status.platformId === selectedSourceClientId) ?? null,
          );
          setClientHealthError(null);
        })
        .catch((error) => {
          if (cancelled) return;
          setClientHealth(null);
          setClientHealthError(getErrorMessage(error));
        })
        .finally(() => {
          if (!cancelled) setIsClientHealthLoading(false);
        });
    };

    refreshClientHealth();
    const interval = window.setInterval(() => refreshClientHealth(0), 30_000);
    const handleClientLifecycleEvent = (event: PlatformClientLifecycleEvent) => {
      if (event.platformId !== selectedSourceClientId) {
        return;
      }
      setClientHealth(event);
      setClientHealthError(null);
      setIsClientHealthLoading(false);
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
  }, [selectedSourceClientId, enrichedSelectedGame?.id]);

  useEffect(() => {
    void loadClientManagerState();
  }, [loadClientManagerState]);

  useEffect(() => {
    void loadScreenshotGallery();
  }, [loadScreenshotGallery]);

  useEffect(() => {
    void loadHostedCommunityArtwork();
  }, [loadHostedCommunityArtwork]);

  useEffect(() => {
    if (!previewScreenshot) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreviewScreenshot(null);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewScreenshot]);

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
    setIsClientManagerOpen(false);
    setClientManagerBusyAction(null);
    setPreviewScreenshot(null);
    setFileIntegrityResult(null);
    setCommunityArtworkUploadMessage(null);
    setCommunityArtworkUploadSubmissions([]);
  }, [selectedGame?.id]);

  const handleOpenAchievementCacheFolder = async () => {
    const provider = achievementBasisSource ?? enrichedSelectedGame?.launcher ?? undefined;
    try {
      const folder = await openAchievementCacheFolder(provider);
      setStatusMessage(`Achievement cache folder opened: ${folder}`);
    } catch (error) {
      setStatusMessage(`Could not open achievement cache folder: ${getErrorMessage(error)}`);
    }
  };

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

  function handleApplyArtworkCandidate(candidate: CustomArtworkCandidate) {
    if (!primaryArtworkGameId) {
      setStatusMessage("Select a game before applying artwork.");
      return;
    }

    onApplyCustomArtworkUrl(
      primaryArtworkGameId,
      candidate.kind,
      candidate.url,
      candidate.sourceLabel,
    );
  }

  function handleApplyCommunityArtwork(candidate: CommunityArtworkCandidate) {
    if (!primaryArtworkGameId) {
      setStatusMessage("Select a game before importing community artwork.");
      return;
    }

    onApplyCustomArtworkUrl(
      primaryArtworkGameId,
      candidate.kind,
      candidate.url,
      candidate.sourceLabel,
    );
  }

  async function handleUploadCommunityArtwork(draft: CommunityArtworkUploadDraft) {
    if (!primaryArtworkGameId || !enrichedSelectedGame) {
      setCommunityArtworkUploadMessage("Select a game before uploading hosted artwork.");
      return false;
    }

    if (!isAllowedHostedArtworkFile(draft.file)) {
      setCommunityArtworkUploadMessage(
        "Hosted artwork accepts PNG, JPEG, WebP, GIF, or SVG images up to 5 MB.",
      );
      return false;
    }

    setIsCommunityArtworkUploading(true);
    setCommunityArtworkUploadMessage(null);
    try {
      const result = await uploadCommunityArtworkForGame({
        artistName: draft.artistName,
        description: draft.description,
        file: draft.file,
        gameId: primaryArtworkGameId,
        kind: draft.kind,
        tags: draft.tags,
        title: draft.title,
      });

      if (!result.ok) {
        setCommunityArtworkUploadMessage(`${result.message} Draft kept for retry.`);
        return false;
      }

      setCommunityArtworkUploadSubmissions((current) => [
        result.value,
        ...current.filter((candidate) => candidate.id !== result.value.id),
      ]);
      setCommunityArtworkUploadMessage(
        result.message ??
          "Submission queued for moderation. Approved art appears in the hosted deck.",
      );
      setHostedCommunityArtworkMessage(
        "Submission queued for moderation. Approved art appears in the hosted deck.",
      );
      void loadHostedCommunityArtwork();
      return true;
    } catch (error) {
      setCommunityArtworkUploadMessage(`Hosted upload failed: ${getErrorMessage(error)}`);
      return false;
    } finally {
      setIsCommunityArtworkUploading(false);
    }
  }

  async function handleVoteCommunityArtwork(
    candidate: CommunityArtworkCandidate,
    vote: -1 | 0 | 1,
  ) {
    if (!candidate.hosted) {
      return;
    }

    setCommunityArtworkBusyId(candidate.id);
    try {
      const result = await setHostedCommunityArtworkVote(candidate.id, vote);
      if (!result.ok) {
        setHostedCommunityArtworkMessage(`${result.message} Local deck remains available.`);
        return;
      }

      updateHostedCommunityArtworkCandidate(candidate.id, (current) => ({
        ...current,
        userVote: result.value.userVote,
        votes: result.value.voteScore,
      }));
      setHostedCommunityArtworkMessage(
        result.value.userVote === 1
          ? `Hosted vote synced for ${candidate.title}.`
          : `Hosted vote removed from ${candidate.title}.`,
      );
    } catch (error) {
      setHostedCommunityArtworkMessage(`Hosted vote failed: ${getErrorMessage(error)}`);
    } finally {
      setCommunityArtworkBusyId(null);
    }
  }

  async function handleReportCommunityArtwork(candidate: CommunityArtworkCandidate) {
    if (!candidate.hosted) {
      return;
    }

    setCommunityArtworkBusyId(candidate.id);
    try {
      const result = await reportHostedCommunityArtwork(
        candidate.id,
        "other",
        "Reported from OG-Launcher Community Art Deck.",
      );
      if (!result.ok) {
        setHostedCommunityArtworkMessage(`${result.message} Local deck remains available.`);
        return;
      }

      updateHostedCommunityArtworkCandidate(candidate.id, (current) => ({
        ...current,
        moderationStatus: result.value.moderationStatus,
        reportCount: result.value.reportCount,
      }));
      setHostedCommunityArtworkMessage(
        `Report queued for ${candidate.title}. Moderation status: ${result.value.moderationStatus}.`,
      );
    } catch (error) {
      setHostedCommunityArtworkMessage(`Hosted report failed: ${getErrorMessage(error)}`);
    } finally {
      setCommunityArtworkBusyId(null);
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
    setClientHealthError(null);
  }

  async function handleStartSourceClient() {
    if (!selectedSourceClientId || !clientHealth?.canLaunch || isStartingClient) {
      return;
    }

    setIsStartingClient(true);
    try {
      await launchPlatformClient(selectedSourceClientId);
      setStatusMessage(`Starting ${selectedSourceClientName} client.`);
      await refreshSelectedClientHealth();
    } catch (error) {
      setStatusMessage(`Could not start ${selectedSourceClientName}: ${getErrorMessage(error)}`);
    } finally {
      setIsStartingClient(false);
    }
  }

  async function handleVerifyGameFiles() {
    if (!enrichedSelectedGame || isVerifyingFiles || isRepairingFiles) {
      return;
    }

    setIsVerifyingFiles(true);
    try {
      const result = await verifyGameFiles(enrichedSelectedGame.id);
      setFileIntegrityResult(result);
      setStatusMessage(
        result.status === "verified"
          ? `${enrichedSelectedGame.title} files verified.`
          : `${enrichedSelectedGame.title} needs repair: ${result.missingFiles.length} issue(s).`,
      );
    } catch (error) {
      setStatusMessage(`Verify failed: ${getErrorMessage(error)}`);
    } finally {
      setIsVerifyingFiles(false);
    }
  }

  async function handleRepairGameFiles() {
    if (!enrichedSelectedGame || isRepairingFiles || isVerifyingFiles) {
      return;
    }

    setIsRepairingFiles(true);
    try {
      const result = await repairGameFiles(enrichedSelectedGame.id);
      const verificationResult = await verifyGameFiles(result.gameId);
      setFileIntegrityResult(verificationResult);
      setStatusMessage(result.message);
      await runAutomaticLibrarySync(true);
    } catch (error) {
      setStatusMessage(`Repair failed: ${getErrorMessage(error)}`);
    } finally {
      setIsRepairingFiles(false);
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
                      role="region"
                      aria-label="Drop zone for cover artwork"
                      className={`${getPlatformBannerClass(enrichedSelectedGame)} relative overflow-hidden bg-[#0f141b] ${getFallbackBannerClass(enrichedSelectedGame)} ${isBannerDragOver ? "ring-4 ring-inset ring-[#169b83]" : ""}`}
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
                          <span className="border-2 border-black bg-[#fbf4e7] px-4 py-2 text-[12px] font-black uppercase text-[#171411] shadow-[3px_3px_0_#171411]">
                            Drop for cover
                          </span>
                        </div>
                      )}
                      {shouldShowTextFallback ? (
                        <h1 className="absolute left-1/2 top-1/2 max-w-[min(62%,720px)] -translate-x-1/2 -translate-y-1/2 text-center text-[2.4rem] font-black uppercase leading-none tracking-normal text-white drop-shadow-[5px_5px_0_#171411] sm:text-[3.5rem] lg:text-[4.5rem] xl:text-[5.4rem]">
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
                        className="flex h-[64px] min-w-0 flex-1 items-center justify-center gap-3 border-4 border-black bg-[#169b83] px-5 text-[22px] font-black uppercase text-white shadow-[3px_3px_0_#171411] transition-colors hover:bg-[#087d6d] disabled:cursor-default disabled:bg-[#087d6d] sm:min-w-[205px] sm:flex-none sm:text-[26px]"
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
                          <span className="block truncate">
                            {isGameRunning ? "Running" : "Play"}
                          </span>
                          {isGameRunning && gameRuntime ? (
                            <span className="neo-copy mt-1 block max-w-[130px] truncate text-[8px] font-black uppercase text-[#d8fff7] sm:max-w-[145px]">
                              {gameRuntimeButtonDetail}
                            </span>
                          ) : null}
                        </span>
                      </button>
                      <button
                        aria-label="Capture screenshot"
                        className="flex h-[64px] w-[64px] shrink-0 items-center justify-center border-4 border-black bg-[#fff9ed] text-[#171411] shadow-[3px_3px_0_#171411] hover:bg-[#f6edd8]"
                        title="Capture screenshot to activity feed"
                        type="button"
                        onClick={() => void handleCaptureAndRefresh()}
                      >
                        <Camera className="h-7 w-7" />
                      </button>
                    </div>
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
                            <span className="neo-copy text-[9px] font-black uppercase text-[#55504a]">
                              Game Runtime
                            </span>
                            <span className="neo-copy truncate text-[11px] font-black uppercase text-[#171411]">
                              {gameRuntime.processName ?? "Process active"}
                            </span>
                            {gameRuntimeSourceBadge ? (
                              <span className="neo-copy border-2 border-black bg-[#e8c843] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411] shadow-[1px_1px_0_#171411]">
                                {gameRuntimeSourceBadge}
                              </span>
                            ) : null}
                            {gameRuntime.windowHandle ? (
                              <span className="neo-copy border-2 border-black bg-[#171411] px-1.5 py-0.5 text-[8px] font-black uppercase text-white shadow-[1px_1px_0_#171411]">
                                HWND {gameRuntime.windowHandle}
                              </span>
                            ) : null}
                          </div>
                          <p className="neo-copy mt-0.5 truncate text-[9px] font-bold uppercase text-[#655f58]">
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
                      <span className="neo-copy shrink-0 border-2 border-black bg-[#087d6d] px-1.5 py-0.5 text-[8px] font-black uppercase text-white shadow-[1px_1px_0_#171411]">
                        Running
                      </span>
                    </div>
                  ) : null}

                  {selectedSourceClientId ? (
                    <div
                      className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-2 border-black bg-[#efe6d4] px-2 py-1.5 shadow-[2px_2px_0_#171411]"
                      title={clientHealthDetail(clientHealth, clientHealthError)}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <PlatformSourceIcon
                          game={enrichedSelectedGame}
                          className="h-4 w-4 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="neo-copy text-[9px] font-black uppercase text-[#55504a]">
                              Source Client
                            </span>
                            <span className="neo-copy truncate text-[11px] font-black uppercase text-[#171411]">
                              {selectedSourceClientName}
                            </span>
                            <span
                              className={`neo-copy inline-flex items-center gap-1 border-2 border-black px-1.5 py-0.5 text-[8px] font-black uppercase shadow-[1px_1px_0_#171411] ${selectedClientHealthClasses.chip}`}
                            >
                              <span
                                className={`h-1.5 w-1.5 border border-black ${selectedClientHealthClasses.dot}`}
                              />
                              {selectedClientHealthClasses.label}
                            </span>
                          </div>
                          <p className="neo-copy mt-0.5 truncate text-[9px] font-bold uppercase text-[#655f58]">
                            {isClientHealthLoading
                              ? "Refreshing client signal"
                              : clientHealth?.running
                                ? clientHealthDetail(clientHealth, clientHealthError)
                                : clientHealth
                                  ? `Checked ${formatRelativeTime(clientHealth.lastCheckedAt)}`
                                  : clientHealthDetail(clientHealth, clientHealthError)}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                        {clientHealth && !clientHealth.installed ? (
                          <button
                            className="neo-copy inline-flex h-8 items-center gap-1.5 border-2 border-black bg-[#b7102a] px-2 text-[9px] font-black uppercase text-white shadow-[2px_2px_0_#171411] transition hover:bg-[#990a20] disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
                            type="button"
                            disabled={isClientManagerBusy}
                            onClick={() => void handleOpenClientInstaller()}
                          >
                            {clientManagerBusyAction === "installer" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                            Install
                          </button>
                        ) : null}
                        {clientHealth?.canLaunch && !clientHealth.running ? (
                          <button
                            className="neo-copy inline-flex h-8 items-center gap-1.5 border-2 border-black bg-[#fbf4e7] px-2 text-[9px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411] transition hover:bg-[#8cf5e4] disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
                            type="button"
                            disabled={!canStartSourceClient || isStartingClient}
                            onClick={() => void handleStartSourceClient()}
                          >
                            {isStartingClient ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Power className="h-3.5 w-3.5" />
                            )}
                            Start
                          </button>
                        ) : null}
                        <button
                          className={`neo-copy inline-flex h-8 items-center gap-1.5 border-2 border-black px-2 text-[9px] font-black uppercase shadow-[2px_2px_0_#171411] transition hover:bg-[#8cf5e4] ${
                            isClientManagerOpen
                              ? "bg-[#087d6d] text-white"
                              : "bg-[#fbf4e7] text-[#171411]"
                          }`}
                          type="button"
                          onClick={() => setIsClientManagerOpen((open) => !open)}
                        >
                          <FolderCog className="h-3.5 w-3.5" />
                          Manager
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {selectedSourceClientId && isClientManagerOpen ? (
                    <section className="neo-dots min-w-0 border-4 border-black bg-[#fbf4e7] shadow-[4px_4px_0_#171411]">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black bg-[#171411] px-3 py-2 text-white">
                        <div className="min-w-0">
                          <h3 className="neo-title text-[17px] uppercase leading-none">
                            Client Manager
                          </h3>
                          <p className="neo-copy mt-1 truncate text-[9px] font-black uppercase text-[#f6edd8]">
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
                              <span className="neo-copy block text-[8px] font-black uppercase text-[#655f58]">
                                Installed
                              </span>
                              <strong className="neo-title mt-1 block truncate text-[16px] uppercase">
                                {clientUpdateStatus?.installed ? "Detected" : "Missing"}
                              </strong>
                            </div>
                            <div className="border-2 border-black bg-[#efe6d4] p-2 shadow-[2px_2px_0_#171411]">
                              <span className="neo-copy block text-[8px] font-black uppercase text-[#655f58]">
                                Version
                              </span>
                              <strong className="neo-title mt-1 block truncate text-[16px] uppercase">
                                {clientUpdateStatus?.installedVersion ?? "Unknown"}
                              </strong>
                            </div>
                            <div className="border-2 border-black bg-[#efe6d4] p-2 shadow-[2px_2px_0_#171411]">
                              <span className="neo-copy block text-[8px] font-black uppercase text-[#655f58]">
                                Latest
                              </span>
                              <strong className="neo-title mt-1 block truncate text-[16px] uppercase">
                                {clientUpdateStatus?.latestKnownVersion ?? "Manual"}
                              </strong>
                            </div>
                            <div className="border-2 border-black bg-[#efe6d4] p-2 shadow-[2px_2px_0_#171411]">
                              <span className="neo-copy block text-[8px] font-black uppercase text-[#655f58]">
                                Scheduler
                              </span>
                              <strong className="neo-title mt-1 block truncate text-[16px] uppercase">
                                {clientUpdateStatus?.schedulerEnabled ? "24h" : "Manual"}
                              </strong>
                              <span className="neo-copy mt-1 block truncate text-[8px] font-black uppercase text-[#655f58]">
                                {clientUpdateStatus?.schedulerEnabled
                                  ? `Next ${formatScheduleTime(clientUpdateStatus.nextScheduledCheckAt)}`
                                  : "Auto check off"}
                              </span>
                            </div>
                          </div>

                          <div className="border-2 border-black bg-[#f6edd8] p-2">
                            <p className="neo-copy text-[10px] font-black uppercase leading-5 text-[#171411]">
                              {isClientManagerLoading
                                ? "Loading client-manager metadata"
                                : (clientUpdateStatus?.detail ??
                                  clientInstallerMetadata?.installNotes ??
                                  "Client-manager metadata is not loaded.")}
                            </p>
                            {clientManagerError ? (
                              <p className="neo-copy mt-2 border-2 border-black bg-[#b7102a] px-2 py-1 text-[9px] font-black uppercase text-white">
                                {clientManagerError}
                              </p>
                            ) : null}
                            {clientUpdateStatus?.schedulerEnabled ? (
                              <p className="neo-copy mt-2 border-2 border-black bg-[#fbf4e7] px-2 py-1 text-[9px] font-black uppercase text-[#655f58]">
                                Scheduled update check: last{" "}
                                {formatRelativeTime(clientUpdateStatus.lastScheduledCheckAt)} / next{" "}
                                {formatScheduleTime(clientUpdateStatus.nextScheduledCheckAt)}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              className="neo-copy inline-flex h-9 items-center gap-1.5 border-2 border-black bg-[#b7102a] px-3 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411] hover:bg-[#990a20] disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
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
                              className="neo-copy inline-flex h-9 items-center gap-1.5 border-2 border-black bg-[#fbf4e7] px-3 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411] hover:bg-[#8cf5e4] disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
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
                              className="neo-copy inline-flex h-9 items-center gap-1.5 border-2 border-black bg-[#e8c843] px-3 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411] hover:bg-[#8cf5e4] disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
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
                                  <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-3 text-[10px] font-black uppercase text-[#655f58]">
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
                                  <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-3 text-[10px] font-black uppercase text-[#655f58]">
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
                              <span className="neo-copy border-2 border-black bg-[#fbf4e7] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411]">
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
                                <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-3 text-[10px] font-black uppercase text-[#655f58]">
                                  No asset caches configured.
                                </p>
                              )}
                            </div>

                            <div className="space-y-2">
                              <div className="border-2 border-black bg-[#f6edd8] px-2 py-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="neo-copy text-[8px] font-black uppercase text-[#655f58]">
                                    Lookup winners
                                  </span>
                                  <span className="neo-copy border border-black bg-[#087d6d] px-1.5 py-0.5 text-[7px] font-black uppercase text-white">
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
                                          <strong className="neo-copy truncate text-[9px] font-black uppercase text-[#171411]">
                                            {entry.cacheKey}
                                          </strong>
                                          <span className="neo-copy shrink-0 text-[8px] font-black uppercase text-[#087d6d]">
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
                                    <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-2 text-[9px] font-black uppercase text-[#655f58]">
                                      No winning cache keys.
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="border-2 border-black bg-[#f6edd8] px-2 py-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="neo-copy text-[8px] font-black uppercase text-[#655f58]">
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
                                        <strong className="neo-copy block truncate text-[9px] font-black uppercase text-[#171411]">
                                          {conflict.cacheKey}
                                        </strong>
                                        <p className="neo-copy mt-0.5 line-clamp-2 text-[8px] font-bold uppercase leading-3 text-[#655f58]">
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
                                    <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-2 text-[9px] font-black uppercase text-[#655f58]">
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
                              <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-1.5 text-[9px] font-black uppercase leading-4 text-[#171411]">
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
                                    <span className="neo-copy block text-[8px] font-black uppercase text-[#655f58]">
                                      {item.label}
                                    </span>
                                    <strong className="neo-copy mt-0.5 block truncate text-[9px] font-black uppercase text-[#171411]">
                                      {item.value}
                                    </strong>
                                  </div>
                                ))}
                              </div>

                              <div className="border-2 border-black bg-[#f6edd8] px-2 py-1.5">
                                <span className="neo-copy block text-[8px] font-black uppercase text-[#655f58]">
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
                                      <p className="neo-copy mt-1 line-clamp-2 text-[8px] font-bold uppercase leading-3 text-[#655f58]">
                                        {check.detail}
                                      </p>
                                    </div>
                                  ))
                                ) : (
                                  <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-3 text-[9px] font-black uppercase text-[#655f58]">
                                    Waiting for staging checks.
                                  </p>
                                )}
                              </div>

                              <p className="neo-copy border-2 border-black bg-[#b7102a] px-2 py-1.5 text-[9px] font-black uppercase leading-4 text-white">
                                No silent download. No auto-apply. OG-Launcher only opens the staged
                                provider source after your click.
                              </p>

                              <button
                                className="neo-copy inline-flex h-9 w-full items-center justify-center gap-1.5 border-2 border-black bg-[#e8c843] px-3 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411] hover:bg-[#8cf5e4] disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
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
                              <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-1.5 text-[9px] font-black uppercase leading-4 text-[#171411]">
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
                                    <span className="neo-copy block text-[8px] font-black uppercase text-[#655f58]">
                                      {item.label}
                                    </span>
                                    <strong className="neo-copy mt-0.5 block truncate text-[9px] font-black uppercase text-[#171411]">
                                      {item.value}
                                    </strong>
                                  </div>
                                ))}
                              </div>

                              <div className="border-2 border-black bg-[#f6edd8] px-2 py-1.5">
                                <span className="neo-copy block text-[8px] font-black uppercase text-[#655f58]">
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
                                      <p className="neo-copy mt-1 line-clamp-2 text-[8px] font-bold uppercase leading-3 text-[#655f58]">
                                        {check.detail}
                                      </p>
                                    </div>
                                  ))
                                ) : (
                                  <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-3 text-[9px] font-black uppercase text-[#655f58]">
                                    Waiting for auto-apply guard checks.
                                  </p>
                                )}
                              </div>

                              <p className="neo-copy border-2 border-black bg-[#b7102a] px-2 py-1.5 text-[9px] font-black uppercase leading-4 text-white">
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
                            <label className="neo-copy mb-2 block text-[9px] font-black uppercase text-[#655f58]">
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
                            <label className="neo-copy mb-2 block text-[9px] font-black uppercase text-[#655f58]">
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
                            <label className="neo-copy mb-2 block text-[9px] font-black uppercase text-[#655f58]">
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
                            <label className="neo-copy mb-2 block text-[9px] font-black uppercase text-[#655f58]">
                              Update policy
                              <select
                                className="mt-1 h-8 w-full border-2 border-black bg-[#f6edd8] px-2 text-[10px] font-black uppercase text-[#171411] outline-none"
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
                              className="neo-copy inline-flex h-9 w-full items-center justify-center gap-1.5 border-2 border-black bg-[#087d6d] px-3 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411] hover:bg-[#00695f] disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
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
                              <p className="neo-copy mt-2 text-[9px] font-black uppercase leading-4 text-[#655f58]">
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
                                        <span className="neo-copy shrink-0 border border-black bg-[#e8c843] px-1.5 py-0.5 text-[7px] font-black uppercase text-[#171411]">
                                          {clientManagerHistoryStatusLabel(item.status)}
                                        </span>
                                      </div>
                                      <span className="neo-copy shrink-0 text-[8px] font-black uppercase text-[#655f58]">
                                        {formatRelativeTime(item.checkedAt)}
                                      </span>
                                    </div>
                                    <p className="neo-copy mt-1 line-clamp-2 text-[9px] font-bold uppercase leading-4 text-[#655f58]">
                                      {item.message}
                                    </p>
                                  </div>
                                ))
                              ) : (
                                <p className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-3 text-[10px] font-black uppercase text-[#655f58]">
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

                        {/* FILE INTEGRITY */}
                        <div className="mb-3 border-b border-black pb-3">
                          <span className="mb-1 block text-[11px] font-black uppercase">
                            File Integrity:
                          </span>
                          <div className="grid grid-cols-2 gap-1">
                            <button
                              type="button"
                              className="flex h-8 items-center justify-center gap-1 border-2 border-black bg-[#ded3c1] px-1 text-[9px] font-black uppercase transition hover:bg-[#8cf5e4] disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={isVerifyingFiles || isRepairingFiles}
                              onClick={handleVerifyGameFiles}
                            >
                              <RefreshCw
                                className={`h-3.5 w-3.5 ${isVerifyingFiles ? "animate-spin" : ""}`}
                              />
                              Verify
                            </button>
                            <button
                              type="button"
                              className="flex h-8 items-center justify-center gap-1 border-2 border-black bg-[#fbf4e7] px-1 text-[9px] font-black uppercase shadow-[1px_1px_0_#000] transition hover:bg-[#f7d04a] disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={isVerifyingFiles || isRepairingFiles}
                              onClick={handleRepairGameFiles}
                            >
                              <RotateCcw
                                className={`h-3.5 w-3.5 ${isRepairingFiles ? "animate-spin" : ""}`}
                              />
                              Repair
                            </button>
                          </div>
                          <div
                            className={`neo-copy mt-2 border-2 border-black px-2 py-1 text-[9px] font-black uppercase shadow-[1px_1px_0_#000] ${
                              fileIntegrityResult?.status === "repair_required"
                                ? "bg-[#b7102a] text-white"
                                : fileIntegrityResult?.status === "verified"
                                  ? "bg-[#8cf5e4] text-[#171411]"
                                  : "bg-[#fbf4e7] text-[#655f58]"
                            }`}
                          >
                            {getVerificationSummary(fileIntegrityResult)}
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2 border-2 border-black bg-[#fbf4e7] px-2 py-1 shadow-[1px_1px_0_#000]">
                            <span className="text-[8px] font-black uppercase text-[#171411]">
                              Manifest
                            </span>
                            <span
                              className={`border-2 border-black px-1.5 py-0.5 text-right text-[8px] font-black uppercase leading-none ${getManifestTrustClasses(fileIntegrityResult)}`}
                            >
                              {getManifestTrustLabel(fileIntegrityResult)}
                            </span>
                          </div>
                          {fileIntegrityResult?.missingFiles.length ? (
                            <div className="mt-1 space-y-1">
                              {fileIntegrityResult.missingFiles.slice(0, 2).map((file) => (
                                <p
                                  key={file}
                                  className="break-words text-[8px] font-bold uppercase leading-3 text-[#b7102a]"
                                  title={file}
                                >
                                  {file}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </div>

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
                          {autoArtworkCandidates.length > 0 && (
                            <div className="mt-2">
                              <span className="neo-copy mb-1 block text-[9px] font-black uppercase text-[#171411]">
                                Auto Artwork
                              </span>
                              <div className="grid grid-cols-2 gap-1">
                                {autoArtworkCandidates.map((candidate) => {
                                  const hasKind = customArtworkHasKind(
                                    customArtwork,
                                    candidate.kind,
                                  );
                                  return (
                                    <button
                                      key={`${candidate.kind}-${candidate.url}`}
                                      type="button"
                                      className="group flex h-[54px] min-w-0 items-center gap-1.5 border-2 border-black bg-[#fbf4e7] p-1 text-left shadow-[2px_2px_0_#000] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
                                      title={`${hasKind ? "Replace" : "Apply"} ${candidate.sourceLabel} ${candidate.kind}`}
                                      onClick={() => handleApplyArtworkCandidate(candidate)}
                                    >
                                      <span className="relative h-10 w-10 shrink-0 overflow-hidden border-2 border-black bg-[#ded3c1]">
                                        <img
                                          src={candidate.url}
                                          alt=""
                                          className="h-full w-full object-cover"
                                          loading="lazy"
                                        />
                                      </span>
                                      <span className="min-w-0">
                                        <span className="block truncate text-[8px] font-black uppercase text-[#b7102a]">
                                          {hasKind ? "Replace" : "Apply"}
                                        </span>
                                        <span className="block truncate text-[9px] font-black uppercase text-[#171411]">
                                          {getArtworkKindLabel(candidate.kind)}
                                        </span>
                                        <span className="block truncate text-[8px] font-black uppercase text-[#655f58]">
                                          {getArtworkSourceBadge(candidate.sourceLabel)}
                                        </span>
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          <CommunityArtworkUploadPanel
                            disabled={!primaryArtworkGameId}
                            gameTitle={enrichedSelectedGame?.title ?? "Selected Game"}
                            isUploading={isCommunityArtworkUploading}
                            message={communityArtworkUploadMessage}
                            pendingSubmissions={displayedCommunityArtworkUploadSubmissions}
                            onSubmit={handleUploadCommunityArtwork}
                          />
                          <CommunityArtworkGallery
                            artwork={customArtwork}
                            busyCandidateId={communityArtworkBusyId}
                            candidates={communityArtworkCandidates}
                            hostedStatus={{
                              loading: isHostedCommunityArtworkLoading,
                              message: hostedCommunityArtworkMessage,
                              mode:
                                hostedCommunityArtworkCandidates.length > 0 ? "hosted" : "local",
                            }}
                            onApply={handleApplyCommunityArtwork}
                            onReport={(candidate) => {
                              void handleReportCommunityArtwork(candidate);
                            }}
                            onVote={(candidate, vote) => {
                              void handleVoteCommunityArtwork(candidate, vote);
                            }}
                          />
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
                            <p className="text-[10px] italic text-[#5b403f]">
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
                <CategoryChips
                  chips={categoryChips}
                  activeChipKeys={activeCategoryChipKeys}
                  onApply={handleApplyCategoryChip}
                />
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
                    <input
                      ref={screenshotUploadInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(event) => {
                        void handleScreenshotFileChange(event);
                      }}
                    />
                    <ScreenshotGallery
                      shots={galleryShots}
                      loading={isGalleryLoading}
                      error={galleryError}
                      actionMessage={galleryActionMessage}
                      isUploading={isScreenshotUploading}
                      onPreview={setPreviewScreenshot}
                      onUploadClick={handleScreenshotUploadClick}
                      onTogglePrivacy={(shot) => {
                        void handleToggleScreenshotPrivacy(shot);
                      }}
                      onToggleLike={(shot) => {
                        void handleToggleScreenshotLike(shot);
                      }}
                      privacyBusyId={screenshotPrivacyBusyId}
                      likeBusyId={screenshotLikeBusyId}
                    />
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
                        <h2 className="text-[15px] font-black uppercase leading-none">
                          Achievements
                        </h2>
                        {achievementBasisSource ? (
                          <span className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-0.5 text-[9px] font-black uppercase text-[#55504a]">
                            Basis: {achievementBasisSource}
                          </span>
                        ) : null}
                        <button
                          className="grid h-8 w-8 place-items-center border-2 border-black bg-[#fbf4e7] text-[#171411] shadow-[2px_2px_0_#171411]"
                          type="button"
                          aria-label="Open achievement cache folder"
                          title="Open achievement cache folder"
                          onClick={() => {
                            void handleOpenAchievementCacheFolder();
                          }}
                        >
                          <FolderOpen className="h-4 w-4" />
                        </button>
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

                      {achievements.length > 0 ? (
                        <>
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
                        onClick={() => navigate("/controllers")}
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

                    {/* Platform Cloud Saves Panel */}
                    {enrichedSelectedGame.status === "installed" ? (
                      <React.Suspense fallback={null}>
                        <CloudSavesPanel game={enrichedSelectedGame} />
                      </React.Suspense>
                    ) : null}
                  </aside>
                </div>
              </section>
            </>
          ) : (
            <section className="grid min-h-[calc(100vh-124px)] place-items-center border-b-4 border-black bg-[#f8f0df] px-4 text-center">
              <div className="max-w-[560px] border-4 border-black bg-[#fbf4e7] p-6 shadow-[4px_4px_0_#171411]">
                <h1 className="text-[2.4rem] font-black uppercase leading-none sm:text-[3.25rem] lg:text-[4rem]">
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
      {previewScreenshot ? (
        <div className="neo-dots-ink fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 h-full w-full cursor-default"
            aria-label="Close screenshot preview"
            onClick={() => setPreviewScreenshot(null)}
          />
          <div
            className="relative max-h-[92vh] w-full max-w-[980px] overflow-hidden border-4 border-black bg-[#fbf4e7] shadow-[8px_8px_0_#000]"
            role="dialog"
            aria-modal="true"
            aria-label={previewScreenshot.caption}
          >
            <div className="flex items-center justify-between gap-2 border-b-2 border-black bg-[#f3e8d7] px-3 py-2">
              <div className="min-w-0">
                <h2 className="truncate text-[15px] font-black uppercase leading-none">
                  {previewScreenshot.caption}
                </h2>
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="neo-copy border border-black bg-[#171411] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#fbf4e7]">
                    {previewScreenshot.sourceLabel}
                  </span>
                  {previewScreenshot.privacyLabel ? (
                    <span className="neo-copy border border-black bg-[#087d6d] px-1.5 py-0.5 text-[8px] font-black uppercase text-white">
                      {previewScreenshot.privacyLabel}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {previewScreenshot.cloudId ? (
                  <>
                    {previewScreenshot.isOwned ? (
                      <button
                        type="button"
                        className="neo-copy inline-flex h-8 items-center gap-1 border-2 border-black bg-[#fbf4e7] px-2 text-[9px] font-black uppercase shadow-[2px_2px_0_#171411] hover:bg-[#8cf5e4] disabled:opacity-60"
                        aria-label={
                          previewScreenshot.isPublic
                            ? "Make screenshot private"
                            : "Make screenshot public"
                        }
                        disabled={screenshotPrivacyBusyId === previewScreenshot.cloudId}
                        onClick={() => {
                          void handleToggleScreenshotPrivacy(previewScreenshot);
                        }}
                      >
                        {screenshotPrivacyBusyId === previewScreenshot.cloudId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : previewScreenshot.isPublic ? (
                          <LockKeyholeOpen className="h-3.5 w-3.5" />
                        ) : (
                          <LockKeyhole className="h-3.5 w-3.5" />
                        )}
                        {previewScreenshot.isPublic ? "Public" : "Private"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={`neo-copy inline-flex h-8 items-center gap-1 border-2 border-black px-2 text-[9px] font-black uppercase shadow-[2px_2px_0_#171411] disabled:opacity-60 ${
                        previewScreenshot.likedByMe
                          ? "bg-[#b7102a] text-white"
                          : "bg-[#fbf4e7] text-[#171411]"
                      }`}
                      aria-label={
                        previewScreenshot.likedByMe ? "Unlike screenshot" : "Like screenshot"
                      }
                      disabled={
                        !previewScreenshot.likesAvailable ||
                        !previewScreenshot.canLike ||
                        screenshotLikeBusyId === previewScreenshot.cloudId
                      }
                      onClick={() => {
                        void handleToggleScreenshotLike(previewScreenshot);
                      }}
                    >
                      {screenshotLikeBusyId === previewScreenshot.cloudId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Heart
                          className={`h-3.5 w-3.5 ${
                            previewScreenshot.likedByMe ? "fill-current" : ""
                          }`}
                        />
                      )}
                      {previewScreenshot.likeCount ?? 0}
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="grid h-8 w-8 shrink-0 place-items-center border-2 border-black bg-[#fbf4e7] shadow-[2px_2px_0_#171411] hover:bg-[#8cf5e4]"
                  aria-label="Close screenshot preview"
                  onClick={() => setPreviewScreenshot(null)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="max-h-[72vh] overflow-auto bg-[#171411] p-2">
              {previewScreenshot.imageSrc ? (
                <img
                  alt={previewScreenshot.caption}
                  className="mx-auto max-h-[68vh] w-auto max-w-full border-2 border-black object-contain"
                  src={previewScreenshot.imageSrc}
                />
              ) : (
                <div className="neo-dots grid min-h-[320px] place-items-center border-2 border-black bg-[#efe3cf]">
                  <Image className="h-12 w-12 text-[#655f58]" />
                </div>
              )}
            </div>
            <div className="neo-copy flex flex-wrap justify-between gap-2 border-t-2 border-black px-3 py-2 text-[9px] font-black uppercase text-[#655f58]">
              <span>
                {[formatScreenshotDate(previewScreenshot.createdAt), previewScreenshot.dimensions]
                  .filter(Boolean)
                  .join(" / ") || "No capture metadata"}
              </span>
              {previewScreenshot.sizeLabel ? <span>{previewScreenshot.sizeLabel}</span> : null}
            </div>
          </div>
        </div>
      ) : null}
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
