import { buildSmartInstallPlan, type SmartInstallSourceCandidate } from "./smart-install-planner";

export interface SmartInstallLocalMirrorAuditSampleInput {
  bytesDownloaded: number;
  cacheAgeMinutes: number;
  candidate: SmartInstallSourceCandidate;
  elapsedMs: number;
  sourceUrl: string;
}

export interface SmartInstallLocalMirrorAuditInput {
  generatedAt: string;
  samples: SmartInstallLocalMirrorAuditSampleInput[];
  ttlMinutes: number;
}

export interface SmartInstallLocalMirrorAuditSample {
  cacheAgeMinutes: number;
  candidateId: string;
  elapsedMs: number;
  label: string;
  observedMbps: number;
  provider: string;
  redactedSource: string;
  status: "fresh" | "stale";
}

export interface SmartInstallLocalMirrorRankDiff {
  afterRank: number;
  afterScore: number;
  beforeRank: number;
  beforeScore: number;
  candidateId: string;
  label: string;
  scoreDelta: number;
  speedDeltaMbps: number;
}

export interface SmartInstallLocalMirrorAuditPacket {
  fastestCandidateId: string | null;
  generatedAt: string;
  liveCalls: "none";
  mode: "Local fixture audit";
  rankDiff: SmartInstallLocalMirrorRankDiff[];
  recommendedAfter: string | null;
  recommendedBefore: string | null;
  reviewSteps: string[];
  samples: SmartInstallLocalMirrorAuditSample[];
  staleCount: number;
  title: string;
  ttlMinutes: number;
  writes: "none";
}

export function buildSmartInstallLocalMirrorAuditPacket(
  input: SmartInstallLocalMirrorAuditInput,
): SmartInstallLocalMirrorAuditPacket {
  const samples = input.samples.map((sample) => toAuditSample(sample, input.ttlMinutes));
  const beforePlan = buildSmartInstallPlan(input.samples.map((sample) => sample.candidate));
  const measuredCandidates = input.samples.map((sample, index) => ({
    ...sample.candidate,
    estimatedMbps: samples[index]?.observedMbps ?? 0,
    notes: [
      ...(sample.candidate.notes ?? []),
      "Local mirror audit sample; no provider call or download start",
    ],
  }));
  const afterPlan = buildSmartInstallPlan(measuredCandidates);
  const beforeRanks = buildRankLookup(beforePlan.candidates);
  const afterRanks = buildRankLookup(afterPlan.candidates);
  const rankDiff = afterPlan.candidates.map((candidate) => {
    const before = beforeRanks[candidate.id];
    const after = afterRanks[candidate.id];

    return {
      afterRank: after?.rank ?? 0,
      afterScore: after?.score ?? 0,
      beforeRank: before?.rank ?? 0,
      beforeScore: before?.score ?? 0,
      candidateId: candidate.id,
      label: candidate.label,
      scoreDelta: (after?.score ?? 0) - (before?.score ?? 0),
      speedDeltaMbps: roundMbps(candidate.estimatedMbps - (before?.estimatedMbps ?? 0)),
    };
  });
  const fastest = [...samples].sort((left, right) => right.observedMbps - left.observedMbps)[0];

  return {
    fastestCandidateId: fastest?.candidateId ?? null,
    generatedAt: input.generatedAt,
    liveCalls: "none",
    mode: "Local fixture audit",
    rankDiff,
    recommendedAfter: afterPlan.recommended?.id ?? null,
    recommendedBefore: beforePlan.recommended?.id ?? null,
    reviewSteps: [
      "Use only fixture or already-observed local transfer samples.",
      "Keep source paths and signed URLs redacted before rendering.",
      "Treat rank deltas as review evidence; do not persist provider rankings.",
      "Run live mirror probes only after provider terms, consent, and rollback are approved.",
    ],
    samples,
    staleCount: samples.filter((sample) => sample.status === "stale").length,
    title: "Local Mirror Measurement + Rank Diff",
    ttlMinutes: input.ttlMinutes,
    writes: "none",
  };
}

export function createVerifySmartInstallLocalMirrorAuditPacket(): SmartInstallLocalMirrorAuditPacket {
  return buildSmartInstallLocalMirrorAuditPacket({
    generatedAt: "2026-06-17T09:00:00.000Z",
    ttlMinutes: 15,
    samples: [
      {
        bytesDownloaded: 94_371_840,
        cacheAgeMinutes: 4,
        candidate: {
          diskSpaceReady: true,
          estimatedMbps: 72,
          id: "og-store-cdn",
          installedClient: true,
          isLanPeer: false,
          label: "OG Store CDN",
          ownership: "owned",
          priceCents: null,
          provider: "OG Store",
          requiresExternalLauncher: false,
          trust: "verified",
        },
        elapsedMs: 7_200,
        sourceUrl:
          "https://downloads.og-launcher.local/builds/demo?ticket=secret-fixture&user=hidden",
      },
      {
        bytesDownloaded: 157_286_400,
        cacheAgeMinutes: 7,
        candidate: {
          diskSpaceReady: true,
          estimatedMbps: 180,
          id: "lan-peer-cache",
          installedClient: true,
          isLanPeer: true,
          label: "LAN Peer Cache",
          notes: ["Local preview source; live peer discovery is not staged"],
          ownership: "free",
          priceCents: null,
          provider: "LAN",
          requiresExternalLauncher: false,
          trust: "local",
        },
        elapsedMs: 5_500,
        sourceUrl: "lan://peer-42/cache/game.pkg?token=local-secret",
      },
      {
        bytesDownloaded: 41_943_040,
        cacheAgeMinutes: 38,
        candidate: {
          diskSpaceReady: true,
          estimatedMbps: 58,
          id: "steam-client",
          installedClient: true,
          isLanPeer: false,
          label: "Steam Client",
          ownership: "owned",
          priceCents: null,
          provider: "Steam",
          requiresExternalLauncher: true,
          trust: "verified",
        },
        elapsedMs: 8_000,
        sourceUrl: "https://steam.example.invalid/depot/1190000/chunk.bin?auth=secret-fixture",
      },
    ],
  });
}

function toAuditSample(
  sample: SmartInstallLocalMirrorAuditSampleInput,
  ttlMinutes: number,
): SmartInstallLocalMirrorAuditSample {
  return {
    cacheAgeMinutes: Math.max(0, Math.round(sample.cacheAgeMinutes)),
    candidateId: sample.candidate.id,
    elapsedMs: Math.max(0, Math.round(sample.elapsedMs)),
    label: sample.candidate.label,
    observedMbps: calculateObservedMbps(sample.bytesDownloaded, sample.elapsedMs),
    provider: sample.candidate.provider,
    redactedSource: redactSource(sample.sourceUrl),
    status: sample.cacheAgeMinutes <= ttlMinutes ? "fresh" : "stale",
  };
}

function calculateObservedMbps(bytesDownloaded: number, elapsedMs: number) {
  if (
    !Number.isFinite(bytesDownloaded) ||
    !Number.isFinite(elapsedMs) ||
    bytesDownloaded <= 0 ||
    elapsedMs <= 0
  ) {
    return 0;
  }

  return roundMbps((bytesDownloaded * 8) / (elapsedMs / 1000) / 1_000_000);
}

function buildRankLookup(
  candidates: Array<{ estimatedMbps: number; id: string; score: number }>,
): Record<string, { estimatedMbps: number; rank: number; score: number }> {
  return candidates.reduce<Record<string, { estimatedMbps: number; rank: number; score: number }>>(
    (lookup, candidate, index) => {
      lookup[candidate.id] = {
        estimatedMbps: candidate.estimatedMbps,
        rank: index + 1,
        score: candidate.score,
      };
      return lookup;
    },
    {},
  );
}

function redactSource(sourceUrl: string) {
  const trimmed = sourceUrl.trim();
  if (!trimmed) return "<redacted-source>";

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "lan:") return "lan://<redacted-peer>/<redacted-path>";
    return `${parsed.protocol}//${parsed.hostname}/<redacted-path>`;
  } catch {
    return "<redacted-source>";
  }
}

function roundMbps(value: number) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}
