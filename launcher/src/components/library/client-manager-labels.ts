import type {
  ClientAutoApplyPlan,
  ClientInstallStageCheck,
  ClientInstallStagePlan,
  ClientModificationConfig,
  ClientUpdateStatus,
} from "../../lib/types";
import type { ClientPathOverlayPreflightStatus } from "../../lib/client-path-overlay-preflight";
import type { GameAction, GameActionCapability, GameActionOutcome } from "../../lib/game-actions";
import { toClientPlatformId } from "../../lib/launcher";

/**
 * Pure formatting and classification helpers for the Client Manager UI.
 * Extracted from GameDetails so the label policy is testable without
 * rendering the 4000-line component.
 */

export function unavailableNativeCapability(
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

export function gameActionOutcomeLabel(outcome: GameActionOutcome): string {
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

export function gameActionOutcomeClasses(outcome: GameActionOutcome): string {
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

export function formatRelativeTime(iso: string | null | undefined): string {
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

export function formatScheduleTime(iso: string | null | undefined): string {
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

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "2-digit", month: "short", day: "2-digit" });
}

export function formatRuntimeDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds < 0) return null;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0 ? `${hours}h ${restMinutes}m` : `${hours}h`;
}

export function runtimeMetadataLabel(input: {
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

export function runtimeWindowLabel(input: {
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

export function clientUpdateClasses(updateStatus: ClientUpdateStatus | null) {
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

export function clientInstallStageClasses(plan: ClientInstallStagePlan | null) {
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

export function clientInstallStageLabel(plan: ClientInstallStagePlan | null) {
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

export function clientInstallCheckClasses(status: ClientInstallStageCheck["status"]) {
  switch (status) {
    case "pass":
      return "bg-[#087d6d] text-white";
    case "warning":
      return "bg-[#e8c843] text-[#171411]";
    default:
      return "bg-[#b7102a] text-white";
  }
}

export function clientInstallTarget(plan: ClientInstallStagePlan | null) {
  return plan?.targetPath ?? plan?.targetUri ?? "No safe target";
}

export function clientAutoApplyClasses(plan: ClientAutoApplyPlan | null) {
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

export function clientAutoApplyLabel(plan: ClientAutoApplyPlan | null) {
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

export function clientPathOverlayPreflightClasses(
  status: ClientPathOverlayPreflightStatus,
): string {
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

export function clientPathOverlayPreflightLabel(status: ClientPathOverlayPreflightStatus): string {
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

export function clientPathOverlayCheckClasses(status: "pass" | "warning" | "blocked"): string {
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

export function clientUpdatePolicyLabel(
  policy: ClientModificationConfig["updatePolicy"] | string | null,
) {
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

export function clientManagerActionLabel(action: string): string {
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

export function clientManagerHistoryStatusLabel(status: string): string {
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

export function clientDraftEntryId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function makeEmptyPathOverlay(
  index: number,
): ClientModificationConfig["pathOverlays"][number] {
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

export function makeEmptyAssetCache(
  index: number,
): ClientModificationConfig["assetCaches"][number] {
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

export function makeEmptyClientConfig(
  platformId: NonNullable<ReturnType<typeof toClientPlatformId>>,
) {
  return {
    assetCaches: [],
    displayName: platformId.toUpperCase(),
    latestKnownVersion: null,
    localInstallerPath: "",
    localUpdaterPath: "",
    pathOverlays: [],
    platformId,
    updatePolicy: "manual" as const,
    updatedAt: null,
  };
}
