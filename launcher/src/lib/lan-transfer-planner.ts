export type LanTransferPeerTrust = "local" | "paired" | "unknown";
export type LanTransferPeerStatus = "blocked" | "ready" | "warning";

export interface LanTransferPeerCandidate {
  availableGameCount: number;
  diskSpaceReady: boolean;
  estimatedMbps: number;
  id: string;
  label: string;
  lastSeenMinutes: number | null;
  libraryShareEnabled: boolean;
  paired: boolean;
  platform: "linux" | "macos" | "windows" | "unknown";
  sameNetwork: boolean;
  trust?: LanTransferPeerTrust;
}

export interface LanTransferPlannedPeer extends LanTransferPeerCandidate {
  blockers: string[];
  score: number;
  status: LanTransferPeerStatus;
  warnings: string[];
}

export interface LanTransferPlan {
  blockedCount: number;
  checklist: string[];
  peers: LanTransferPlannedPeer[];
  readyCount: number;
  recommended: LanTransferPlannedPeer | null;
  summary: string;
  warningCount: number;
}

export function buildLanTransferPlan(peers: LanTransferPeerCandidate[]): LanTransferPlan {
  const planned = peers.map(planPeer).sort(sortPeers);
  const recommended = planned.find((peer) => peer.status !== "blocked") ?? null;
  const readyCount = planned.filter((peer) => peer.status === "ready").length;
  const warningCount = planned.filter((peer) => peer.status === "warning").length;
  const blockedCount = planned.filter((peer) => peer.status === "blocked").length;

  return {
    blockedCount,
    checklist: buildChecklist(planned, recommended),
    peers: planned,
    readyCount,
    recommended,
    summary: buildSummary(planned, recommended),
    warningCount,
  };
}

function planPeer(peer: LanTransferPeerCandidate): LanTransferPlannedPeer {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const estimatedMbps = normalizeMbps(peer.estimatedMbps);

  if (!peer.sameNetwork) blockers.push("Peer is not on the local network");
  if (!peer.libraryShareEnabled) blockers.push("Library sharing is disabled");
  if (!peer.diskSpaceReady) blockers.push("Target disk space gate is not ready");
  if (peer.availableGameCount <= 0) blockers.push("No transferable games advertised");
  if (estimatedMbps <= 0) blockers.push("No usable LAN throughput estimate");

  if (!peer.paired) warnings.push("Pair this device before copying game data");
  if (peer.lastSeenMinutes === null) {
    warnings.push("Peer heartbeat has not been seen this session");
  } else if (peer.lastSeenMinutes > 15) {
    warnings.push(`Peer heartbeat is ${peer.lastSeenMinutes} minutes old`);
  }
  if (peer.trust === "local" || peer.trust === "unknown") {
    warnings.push("Local preview evidence; verify the peer before transfer");
  }

  const status = blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready";

  return {
    ...peer,
    blockers,
    estimatedMbps,
    score: status === "blocked" ? 0 : scorePeer(peer, estimatedMbps, warnings.length),
    status,
    warnings,
  };
}

function scorePeer(peer: LanTransferPeerCandidate, estimatedMbps: number, warningCount: number) {
  const trustScore: Record<LanTransferPeerTrust, number> = {
    local: 8,
    paired: 35,
    unknown: -8,
  };
  const heartbeatScore =
    peer.lastSeenMinutes === null ? 0 : Math.max(0, 25 - Math.min(peer.lastSeenMinutes, 25));

  return Math.round(
    estimatedMbps * 1.4 +
      peer.availableGameCount * 3 +
      (peer.paired ? 45 : 0) +
      heartbeatScore +
      trustScore[peer.trust ?? "unknown"] -
      warningCount * 8,
  );
}

function sortPeers(left: LanTransferPlannedPeer, right: LanTransferPlannedPeer) {
  const statusRank: Record<LanTransferPeerStatus, number> = {
    ready: 0,
    warning: 0,
    blocked: 2,
  };
  const byStatus = statusRank[left.status] - statusRank[right.status];
  if (byStatus !== 0) return byStatus;

  const byScore = right.score - left.score;
  if (byScore !== 0) return byScore;

  const byGames = right.availableGameCount - left.availableGameCount;
  if (byGames !== 0) return byGames;

  return left.label.localeCompare(right.label);
}

function buildChecklist(
  peers: LanTransferPlannedPeer[],
  recommended: LanTransferPlannedPeer | null,
) {
  if (peers.length === 0) {
    return ["No LAN peers staged", "Open OG-Launcher on another PC to stage a transfer lane"];
  }

  const usableCount = peers.filter((peer) => peer.status !== "blocked").length;
  const pairedCount = peers.filter((peer) => peer.paired).length;
  const gameCount = peers.reduce((sum, peer) => sum + Math.max(0, peer.availableGameCount), 0);

  return [
    `${usableCount} usable peer lane${usableCount === 1 ? "" : "s"} staged`,
    `${pairedCount} paired device${pairedCount === 1 ? "" : "s"} checked`,
    `${gameCount} transferable game record${gameCount === 1 ? "" : "s"} advertised`,
    recommended
      ? `${recommended.label} is the current LAN transfer pick`
      : "No LAN transfer peer can be picked until blockers clear",
  ];
}

function buildSummary(peers: LanTransferPlannedPeer[], recommended: LanTransferPlannedPeer | null) {
  if (peers.length === 0) {
    return "LAN Transfer is waiting for a second OG-Launcher device.";
  }

  if (!recommended) {
    return "LAN Transfer found peers, but every copy lane is blocked.";
  }

  if (recommended.status === "warning") {
    return `${recommended.label} is the best local peer, but pairing evidence is still incomplete.`;
  }

  return `${recommended.label} can seed game files over the local network.`;
}

function normalizeMbps(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.round(value * 10) / 10 : 0;
}
