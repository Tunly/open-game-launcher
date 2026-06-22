import type { ClientPlatformId, ClientUpdateStatus, PlatformClientHealth } from "../../lib/types";

export interface PlatformHealthTarget {
  id: ClientPlatformId;
  label: string;
  detail: string;
}

export interface PlatformHealthCard {
  id: ClientPlatformId;
  label: string;
  detail: string;
  score: number;
  tone: "good" | "warning" | "missing";
  statusLabel: string;
  detailLine: string;
  badges: string[];
}

export type PlatformLoginStatuses = Partial<Record<ClientPlatformId, boolean>>;

export interface PlatformHealthSummary {
  score: number;
  tone: "good" | "warning" | "missing";
  detectedCount: number;
  totalPlatforms: number;
  loginConnectedCount: number;
  loginPlatformCount: number;
  updateCurrentCount: number;
  updateCheckedCount: number;
  cards: PlatformHealthCard[];
}

export const PLATFORM_HEALTH_TARGETS: PlatformHealthTarget[] = [
  { id: "steam", label: "Steam", detail: "Local scan & cloud sync" },
  { id: "epic", label: "Epic Games", detail: "Local manifest scan" },
  { id: "gog", label: "GOG Galaxy", detail: "Local manifest scan" },
  { id: "ubisoft", label: "Ubisoft Connect", detail: "Path scan & launcher launch" },
  { id: "ea", label: "EA App", detail: "Local scan + cloud library" },
  { id: "battlenet", label: "Battle.net", detail: "Installed title scan" },
  { id: "xbox", label: "Xbox", detail: "Windows/MS app library scan" },
];

const LOGIN_PLATFORM_IDS: ClientPlatformId[] = ["steam", "gog", "epic", "ea", "xbox", "battlenet"];

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function runtimeDetail(health: PlatformClientHealth): string | null {
  const windowTitle = health.windowTitle?.trim();
  const windowHandle = health.windowHandle?.trim();
  const windowDetail =
    windowTitle && windowHandle
      ? `Window ${windowTitle} (${windowHandle})`
      : windowTitle
        ? `Window ${windowTitle}`
        : windowHandle
          ? `Window ${windowHandle}`
          : null;
  const parts = [
    health.processName,
    health.pid ? `PID ${health.pid}` : null,
    windowDetail,
    health.installPath,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : null;
}

function updateBadge(update: ClientUpdateStatus | null | undefined): string | null {
  if (!update) return null;
  if (update.updateAvailable) return "Update available";
  if (update.statusLabel === "Current") return "Current";
  return update.statusLabel || null;
}

function scorePlatform(
  health: PlatformClientHealth | null | undefined,
  update: ClientUpdateStatus | null | undefined,
): number {
  if (!health) return 0;
  const detected = Boolean(health.installed || health.running);
  let score = 0;
  if (health.installed) score += 30;
  if (health.running) score += 25;
  if (health.canLaunch) score += 15;
  if (health.pid || health.processName) score += 10;
  if (detected && update) score += 10;
  if (detected && update && !update.updateAvailable && update.statusLabel !== "Desktop only") {
    score += 10;
  }
  if (detected && update?.updateAvailable) score -= 10;
  return clampScore(score);
}

export function buildPlatformHealthCards(
  healthStatuses: PlatformClientHealth[],
  updateStatuses: Partial<Record<ClientPlatformId, ClientUpdateStatus | null>>,
  loginStatuses: PlatformLoginStatuses = {},
): PlatformHealthCard[] {
  return PLATFORM_HEALTH_TARGETS.map((target) => {
    const health = healthStatuses.find((status) => status.platformId === target.id) ?? null;
    const update = updateStatuses[target.id] ?? null;
    const score = scorePlatform(health, update);
    const updateText = updateBadge(update);
    const badges = Array.from(
      new Set(
        [
          health?.installed ? "Installed" : "Missing",
          health?.running ? "Running" : null,
          health?.canLaunch ? "Launchable" : null,
          LOGIN_PLATFORM_IDS.includes(target.id) && loginStatuses[target.id] ? "Linked" : null,
          updateText,
        ].filter((badge): badge is string => Boolean(badge)),
      ),
    );
    const tone: PlatformHealthCard["tone"] =
      !health?.installed || health.statusLabel === "Desktop only"
        ? "missing"
        : update?.updateAvailable
          ? "warning"
          : "good";
    const statusLabel = update?.updateAvailable
      ? "Update needed"
      : health?.statusLabel || "Not scanned";
    const detailLine =
      (health ? runtimeDetail(health) : null) ??
      update?.detail ??
      (health?.installed ? "Installed; process not running" : "Client not detected");

    return {
      id: target.id,
      label: target.label,
      detail: target.detail,
      score,
      tone,
      statusLabel,
      detailLine,
      badges,
    };
  });
}

export function buildPlatformHealthSummary(input: {
  healthStatuses: PlatformClientHealth[];
  updateStatuses: Partial<Record<ClientPlatformId, ClientUpdateStatus | null>>;
  loginStatuses?: PlatformLoginStatuses;
}): PlatformHealthSummary {
  const loginStatuses = input.loginStatuses ?? {};
  const cards = buildPlatformHealthCards(input.healthStatuses, input.updateStatuses, loginStatuses);
  const detectedCount = PLATFORM_HEALTH_TARGETS.filter((target) => {
    const health = input.healthStatuses.find((status) => status.platformId === target.id);
    return Boolean(health?.installed || health?.running);
  }).length;
  const loginConnectedCount = LOGIN_PLATFORM_IDS.filter(
    (platformId) => loginStatuses[platformId],
  ).length;
  const checkedUpdates = PLATFORM_HEALTH_TARGETS.map((target) => input.updateStatuses[target.id])
    .filter((status): status is ClientUpdateStatus => Boolean(status))
    .filter((status) => status.installed || status.updateAvailable);
  const updateCurrentCount = checkedUpdates.filter((status) => !status.updateAvailable).length;
  const detectionScore = (detectedCount / PLATFORM_HEALTH_TARGETS.length) * 45;
  const loginScore = (loginConnectedCount / LOGIN_PLATFORM_IDS.length) * 25;
  const updateScore =
    checkedUpdates.length > 0 ? (updateCurrentCount / checkedUpdates.length) * 30 : 0;
  const score = clampScore(detectionScore + loginScore + updateScore);
  const tone: PlatformHealthSummary["tone"] =
    score >= 70 ? "good" : score >= 40 ? "warning" : "missing";

  return {
    cards,
    detectedCount,
    loginConnectedCount,
    loginPlatformCount: LOGIN_PLATFORM_IDS.length,
    score,
    tone,
    totalPlatforms: PLATFORM_HEALTH_TARGETS.length,
    updateCheckedCount: checkedUpdates.length,
    updateCurrentCount,
  };
}
