export type BroadcastCaptureSource = "display" | "game" | "none" | "window";
export type BroadcastOverlaySafety = "review" | "safe" | "unsafe";
export type BroadcastProvider = "local" | "twitch" | "unknown" | "youtube";
export type BroadcastReadinessStatus = "blocked" | "ready" | "warning";

export interface BroadcastChannelCandidate {
  captureSource: BroadcastCaptureSource;
  chatRelayReady: boolean;
  id: string;
  label: string;
  linkedAccount: boolean;
  moderationReady: boolean;
  overlaySafety: BroadcastOverlaySafety;
  provider: BroadcastProvider;
  streamKeyVaultReady: boolean;
  targetBitrateKbps: number;
  uploadMbps: number;
  vodPolicyReady: boolean;
}

export interface BroadcastPlannedChannel extends BroadcastChannelCandidate {
  blockers: string[];
  score: number;
  status: BroadcastReadinessStatus;
  uploadHeadroomKbps: number;
  warnings: string[];
}

export interface BroadcastReadinessPlan {
  blockedCount: number;
  channels: BroadcastPlannedChannel[];
  checklist: string[];
  readyCount: number;
  recommended: BroadcastPlannedChannel | null;
  summary: string;
  warningCount: number;
}

export function buildBroadcastReadinessPlan(
  channels: BroadcastChannelCandidate[],
): BroadcastReadinessPlan {
  const planned = channels.map(planChannel).sort(sortChannels);
  const recommended = planned.find((channel) => channel.status !== "blocked") ?? null;
  const readyCount = planned.filter((channel) => channel.status === "ready").length;
  const warningCount = planned.filter((channel) => channel.status === "warning").length;
  const blockedCount = planned.filter((channel) => channel.status === "blocked").length;

  return {
    blockedCount,
    channels: planned,
    checklist: buildChecklist(planned, recommended),
    readyCount,
    recommended,
    summary: buildSummary(planned, recommended),
    warningCount,
  };
}

function planChannel(channel: BroadcastChannelCandidate): BroadcastPlannedChannel {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const targetBitrateKbps = normalizeKbps(channel.targetBitrateKbps);
  const uploadHeadroomKbps = Math.round(Math.max(0, channel.uploadMbps) * 1000 * 0.7);

  if (!channel.linkedAccount) blockers.push("Provider account is not linked");
  if (!channel.streamKeyVaultReady) blockers.push("Stream key is not in the desktop vault");
  if (channel.captureSource === "none") blockers.push("No capture source selected");
  if (targetBitrateKbps <= 0) blockers.push("Target bitrate is not configured");
  if (uploadHeadroomKbps < targetBitrateKbps) {
    blockers.push("Upload headroom is below target bitrate");
  }
  if (channel.overlaySafety === "unsafe") {
    blockers.push("Overlay capture safety is blocked");
  }

  if (channel.provider === "local" || channel.provider === "unknown") {
    warnings.push("Local preview only; provider OAuth is not staged");
  }
  if (channel.overlaySafety === "review") {
    warnings.push("Overlay capture needs a safety review before live use");
  }
  if (!channel.chatRelayReady) warnings.push("Chat relay moderation is not configured");
  if (!channel.moderationReady) warnings.push("Moderator controls are not staged");
  if (!channel.vodPolicyReady) warnings.push("VOD/archive policy is not configured");

  const status = blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready";

  return {
    ...channel,
    blockers,
    score: status === "blocked" ? 0 : scoreChannel(channel, uploadHeadroomKbps, warnings.length),
    status,
    targetBitrateKbps,
    uploadHeadroomKbps,
    warnings,
  };
}

function scoreChannel(
  channel: BroadcastChannelCandidate,
  uploadHeadroomKbps: number,
  warningCount: number,
) {
  const providerScore: Record<BroadcastProvider, number> = {
    local: 8,
    twitch: 35,
    unknown: -6,
    youtube: 35,
  };
  const captureScore: Record<BroadcastCaptureSource, number> = {
    display: 22,
    game: 30,
    none: 0,
    window: 24,
  };

  return Math.round(
    providerScore[channel.provider] +
      captureScore[channel.captureSource] +
      (channel.linkedAccount ? 30 : 0) +
      (channel.streamKeyVaultReady ? 35 : 0) +
      Math.min(uploadHeadroomKbps / 100, 50) +
      (channel.chatRelayReady ? 10 : 0) +
      (channel.moderationReady ? 10 : 0) +
      (channel.vodPolicyReady ? 8 : 0) -
      warningCount * 8,
  );
}

function sortChannels(left: BroadcastPlannedChannel, right: BroadcastPlannedChannel) {
  const statusRank: Record<BroadcastReadinessStatus, number> = {
    ready: 0,
    warning: 0,
    blocked: 2,
  };
  const byStatus = statusRank[left.status] - statusRank[right.status];
  if (byStatus !== 0) return byStatus;

  const byScore = right.score - left.score;
  if (byScore !== 0) return byScore;

  return left.label.localeCompare(right.label);
}

function buildChecklist(
  channels: BroadcastPlannedChannel[],
  recommended: BroadcastPlannedChannel | null,
) {
  if (channels.length === 0) {
    return [
      "No broadcast channels staged",
      "Link a provider account and pick a capture source before live review",
    ];
  }

  const usableCount = channels.filter((channel) => channel.status !== "blocked").length;
  const vaultCount = channels.filter((channel) => channel.streamKeyVaultReady).length;
  const chatCount = channels.filter((channel) => channel.chatRelayReady).length;

  return [
    `${usableCount} usable broadcast lane${usableCount === 1 ? "" : "s"} staged`,
    `${vaultCount} desktop vault stream-key record${vaultCount === 1 ? "" : "s"} present`,
    `${chatCount} chat relay lane${chatCount === 1 ? "" : "s"} configured`,
    recommended
      ? `${recommended.label} is the current broadcast pick`
      : "No broadcast lane can be picked until blockers clear",
  ];
}

function buildSummary(
  channels: BroadcastPlannedChannel[],
  recommended: BroadcastPlannedChannel | null,
) {
  if (channels.length === 0) {
    return "Broadcast Readiness is waiting for provider and capture evidence.";
  }

  if (!recommended) {
    return "Broadcast Readiness found lanes, but every live route is blocked.";
  }

  if (recommended.status === "warning") {
    return `${recommended.label} can be previewed locally, but hosted live checks are still open.`;
  }

  return `${recommended.label} has complete local preflight evidence; hosted live rollout remains disabled.`;
}

function normalizeKbps(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}
