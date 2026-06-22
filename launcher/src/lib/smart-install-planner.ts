export type SmartInstallOwnership = "free" | "owned" | "paid" | "unavailable";
export type SmartInstallTrust = "local" | "unknown" | "verified";
export type SmartInstallCandidateStatus = "blocked" | "ready" | "warning";

export interface SmartInstallSourceCandidate {
  diskSpaceReady: boolean;
  estimatedMbps: number;
  id: string;
  installedClient: boolean;
  isLanPeer: boolean;
  label: string;
  notes?: string[];
  ownership: SmartInstallOwnership;
  priceCents: number | null;
  provider: string;
  requiresExternalLauncher: boolean;
  trust?: SmartInstallTrust;
}

export interface SmartInstallPlannedCandidate extends SmartInstallSourceCandidate {
  blockers: string[];
  score: number;
  status: SmartInstallCandidateStatus;
  warnings: string[];
}

export interface SmartInstallPlan {
  blockedCount: number;
  candidates: SmartInstallPlannedCandidate[];
  checklist: string[];
  readyCount: number;
  recommended: SmartInstallPlannedCandidate | null;
  summary: string;
  warningCount: number;
}

export function buildSmartInstallPlan(candidates: SmartInstallSourceCandidate[]): SmartInstallPlan {
  const planned = candidates.map(planCandidate).sort(sortCandidates);
  const recommended = planned.find((candidate) => candidate.status !== "blocked") ?? null;
  const readyCount = planned.filter((candidate) => candidate.status === "ready").length;
  const warningCount = planned.filter((candidate) => candidate.status === "warning").length;
  const blockedCount = planned.filter((candidate) => candidate.status === "blocked").length;

  return {
    blockedCount,
    candidates: planned,
    checklist: buildChecklist(planned, recommended),
    readyCount,
    recommended,
    summary: buildSummary(planned, recommended),
    warningCount,
  };
}

function planCandidate(candidate: SmartInstallSourceCandidate): SmartInstallPlannedCandidate {
  const blockers: string[] = [];
  const warnings: string[] = [...(candidate.notes ?? [])];
  const estimatedMbps = normalizeMbps(candidate.estimatedMbps);

  if (!candidate.diskSpaceReady) blockers.push("Disk space gate is not ready");
  if (candidate.ownership === "unavailable") blockers.push("No entitlement for this source");
  if (candidate.requiresExternalLauncher && !candidate.installedClient) {
    blockers.push(`Install ${candidate.provider} client first`);
  }
  if (estimatedMbps <= 0) blockers.push("No usable bandwidth estimate");

  if (candidate.ownership === "paid" && candidate.priceCents !== null) {
    warnings.push(`Costs ${formatPrice(candidate.priceCents)} before install`);
  }
  if (candidate.trust === "local") {
    warnings.push("Local preview source; verify live availability before launch");
  }
  if (candidate.trust === "unknown") {
    warnings.push("Source has no verified provider telemetry yet");
  }

  const status = blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready";

  return {
    ...candidate,
    blockers,
    estimatedMbps,
    score: status === "blocked" ? 0 : calculateScore(candidate, estimatedMbps, warnings.length),
    status,
    warnings,
  };
}

function calculateScore(
  candidate: SmartInstallSourceCandidate,
  estimatedMbps: number,
  warningCount: number,
) {
  const ownershipScore: Record<SmartInstallOwnership, number> = {
    free: 70,
    owned: 75,
    paid: 35,
    unavailable: 0,
  };
  const trustScore: Record<SmartInstallTrust, number> = {
    local: 5,
    unknown: -5,
    verified: 20,
  };
  const pricePenalty =
    candidate.ownership === "paid" && candidate.priceCents !== null
      ? Math.min(candidate.priceCents / 100, 60)
      : 0;

  return Math.round(
    estimatedMbps * 1.6 +
      ownershipScore[candidate.ownership] +
      (candidate.isLanPeer ? 85 : 0) +
      (candidate.requiresExternalLauncher ? -10 : 0) +
      trustScore[candidate.trust ?? "unknown"] -
      pricePenalty -
      warningCount * 8,
  );
}

function sortCandidates(left: SmartInstallPlannedCandidate, right: SmartInstallPlannedCandidate) {
  const statusRank: Record<SmartInstallCandidateStatus, number> = {
    ready: 0,
    warning: 0,
    blocked: 2,
  };
  const byStatus = statusRank[left.status] - statusRank[right.status];
  if (byStatus !== 0) return byStatus;

  const byScore = right.score - left.score;
  if (byScore !== 0) return byScore;

  const leftPrice = left.priceCents ?? 0;
  const rightPrice = right.priceCents ?? 0;
  const byPrice = leftPrice - rightPrice;
  if (byPrice !== 0) return byPrice;

  const bySpeed = right.estimatedMbps - left.estimatedMbps;
  if (bySpeed !== 0) return bySpeed;

  return left.label.localeCompare(right.label);
}

function buildChecklist(
  candidates: SmartInstallPlannedCandidate[],
  recommended: SmartInstallPlannedCandidate | null,
) {
  if (candidates.length === 0) {
    return [
      "No install sources staged",
      "Connect a store, LAN peer, or provider client before auto-pick",
    ];
  }

  const checklist = [
    `${candidates.filter((candidate) => candidate.status !== "blocked").length} usable source${
      candidates.filter((candidate) => candidate.status !== "blocked").length === 1 ? "" : "s"
    } staged`,
    `${candidates.filter((candidate) => candidate.isLanPeer).length} LAN peer lane${
      candidates.filter((candidate) => candidate.isLanPeer).length === 1 ? "" : "s"
    } checked`,
    `${candidates.filter((candidate) => candidate.requiresExternalLauncher).length} external launcher lane${
      candidates.filter((candidate) => candidate.requiresExternalLauncher).length === 1 ? "" : "s"
    } checked`,
  ];

  checklist.push(
    recommended
      ? `${recommended.label} is the current auto-pick`
      : "No source can be auto-picked until blockers clear",
  );

  return checklist;
}

function buildSummary(
  candidates: SmartInstallPlannedCandidate[],
  recommended: SmartInstallPlannedCandidate | null,
) {
  if (candidates.length === 0) {
    return "Smart Install is waiting for local provider, store, or LAN candidates.";
  }

  if (!recommended) {
    return "Smart Install found candidates, but every source is blocked.";
  }

  if (recommended.status === "warning") {
    return `${recommended.label} is best locally, but still needs a launch-time check.`;
  }

  return `${recommended.label} is the fastest safe local install source.`;
}

function normalizeMbps(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.round(value * 10) / 10 : 0;
}

function formatPrice(priceCents: number) {
  return `$${(priceCents / 100).toFixed(2)}`;
}
