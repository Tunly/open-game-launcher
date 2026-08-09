export type HostedCronEvidenceSummaryStatus = "blocked" | "pass" | "review";

export type HostedCronEvidenceMode = "dry_run" | "missing" | "scheduled";
export type HostedCronEvidenceAggregateCountStatus = "valid" | "missing" | "invalid";
export type HostedCronEvidenceTriggerSource = "manual" | "missing" | "scheduled" | "verify_route";

export interface HostedCronEvidenceInput {
  aggregateCountStatus: HostedCronEvidenceAggregateCountStatus;
  containsSecretMaterial: boolean;
  evidenceRecorded: boolean;
  evidenceTable: string;
  failedCount: number | null;
  functionName: string;
  id: string;
  label: string;
  mode: HostedCronEvidenceMode;
  mutationProof: boolean;
  observedAt: string | null;
  restTargetSafe: boolean;
  rowScope: string;
  runId: string | null;
  schedulerConfigProof: boolean;
  secretRedacted: boolean;
  triggerSource: HostedCronEvidenceTriggerSource;
  verifyRouteWrite: boolean;
}

export interface HostedCronEvidenceJob {
  evidence: string;
  evidenceTable: string;
  functionName: string;
  id: string;
  label: string;
  mode: HostedCronEvidenceMode;
  observedAt: string;
  requirement: string;
  runId: string;
  status: HostedCronEvidenceSummaryStatus;
}

export interface HostedCronEvidenceSummary {
  blockedClaims: string[];
  blockedCount: number;
  createdAt: string;
  jobs: HostedCronEvidenceJob[];
  maxAgeMinutes: number;
  passCount: number;
  packetId: string;
  reviewCount: number;
  statusLabel: string;
  summary: string;
  totalCount: number;
}

export const HOSTED_CRON_EVIDENCE_BLOCKED_CLAIMS = [
  "Scheduler origin must be trigger_source=scheduled",
  "Dashboard or config proof required",
  "Manual authorized calls do not substitute",
  "Missing aggregate count blocks evidence",
  "Invalid aggregate count blocks evidence",
  "failed_count must be zero",
  "Unsafe REST targets are blocked",
  "No secret material rendered",
  "No verify-route Supabase write",
  "Dry-run rows do not pass",
  "Stale rows do not pass",
  "No production deployment proof",
] as const;

export function buildHostedCronEvidenceSummary({
  createdAt,
  jobs,
  maxAgeMinutes = 90,
  packetId,
}: {
  createdAt: string;
  jobs: HostedCronEvidenceInput[];
  maxAgeMinutes?: number;
  packetId: string;
}): HostedCronEvidenceSummary {
  const createdAtMs = Date.parse(createdAt);
  const summaryJobs = jobs.map((job) =>
    buildHostedCronEvidenceJob(job, createdAtMs, maxAgeMinutes),
  );
  const passCount = summaryJobs.filter((job) => job.status === "pass").length;
  const reviewCount = summaryJobs.filter((job) => job.status === "review").length;
  const blockedCount = summaryJobs.filter((job) => job.status === "blocked").length;
  const totalCount = summaryJobs.length;

  return {
    blockedClaims: [...HOSTED_CRON_EVIDENCE_BLOCKED_CLAIMS],
    blockedCount,
    createdAt,
    jobs: summaryJobs,
    maxAgeMinutes,
    packetId,
    passCount,
    reviewCount,
    statusLabel: passCount === totalCount ? "Ready" : "External Evidence Required",
    summary:
      "Local no-write summary for hosted scheduler evidence. Price-drop, account deletion, and presence cron lanes require fresh non-dry-run rows with trigger_source=scheduled, valid aggregate counts, failed_count=0, a safe Supabase REST target, redacted secret handling, and external dashboard/config proof before production readiness can be claimed.",
    totalCount,
  };
}

export function createVerifyHostedCronEvidenceSummary() {
  return buildHostedCronEvidenceSummary({
    createdAt: "2026-06-16T00:00:00.000Z",
    packetId: "hosted-cron-evidence-summary-local-001",
    jobs: [
      {
        aggregateCountStatus: "valid",
        containsSecretMaterial: false,
        evidenceRecorded: true,
        evidenceTable: "store_price_drop_notification_runs",
        failedCount: 0,
        functionName: "notify-price-drop",
        id: "price-drop",
        label: "Price-Drop Scheduler",
        mode: "dry_run",
        mutationProof: false,
        observedAt: "2026-06-15T23:50:00.000Z",
        restTargetSafe: true,
        rowScope: "sanitized dry-run candidate aggregate",
        runId: "price-drop-dry-run-local-001",
        schedulerConfigProof: false,
        secretRedacted: true,
        triggerSource: "manual",
        verifyRouteWrite: false,
      },
      {
        aggregateCountStatus: "invalid",
        containsSecretMaterial: false,
        evidenceRecorded: true,
        evidenceTable: "account_deletion_processor_runs",
        failedCount: 0,
        functionName: "process-account-deletions",
        id: "account-deletion",
        label: "Account Deletion Processor",
        mode: "scheduled",
        mutationProof: true,
        observedAt: "2026-06-15T20:00:00.000Z",
        restTargetSafe: true,
        rowScope: "stale scheduled staging row",
        runId: "account-deletion-stale-scheduled-001",
        schedulerConfigProof: false,
        secretRedacted: true,
        triggerSource: "scheduled",
        verifyRouteWrite: false,
      },
      {
        aggregateCountStatus: "missing",
        containsSecretMaterial: false,
        evidenceRecorded: false,
        evidenceTable: "presence_poll_runs",
        failedCount: null,
        functionName: "poll-platform-presence",
        id: "presence-poll",
        label: "Presence Polling",
        mode: "missing",
        mutationProof: false,
        observedAt: null,
        restTargetSafe: true,
        rowScope: "no fresh scheduled evidence row",
        runId: null,
        schedulerConfigProof: false,
        secretRedacted: true,
        triggerSource: "missing",
        verifyRouteWrite: false,
      },
    ],
  });
}

function buildHostedCronEvidenceJob(
  job: HostedCronEvidenceInput,
  createdAtMs: number,
  maxAgeMinutes: number,
): HostedCronEvidenceJob {
  const observedAtMs = job.observedAt ? Date.parse(job.observedAt) : Number.NaN;
  const ageMinutes =
    Number.isFinite(createdAtMs) && Number.isFinite(observedAtMs)
      ? Math.max(0, Math.round((createdAtMs - observedAtMs) / 60_000))
      : Number.POSITIVE_INFINITY;
  const fresh = ageMinutes <= maxAgeMinutes;
  const passes =
    job.mode === "scheduled" &&
    fresh &&
    job.evidenceRecorded &&
    job.mutationProof &&
    job.aggregateCountStatus === "valid" &&
    job.failedCount === 0 &&
    job.restTargetSafe &&
    job.schedulerConfigProof &&
    job.secretRedacted &&
    job.triggerSource === "scheduled" &&
    !job.containsSecretMaterial &&
    !job.verifyRouteWrite;
  const status: HostedCronEvidenceSummaryStatus = passes
    ? "pass"
    : job.runId
      ? "review"
      : "blocked";

  return {
    evidence: [
      `scope:${job.rowScope}`,
      `triggerSource:${job.triggerSource}`,
      `aggregateCount:${job.aggregateCountStatus}`,
      `failedCount:${job.failedCount ?? "missing"}`,
      `restTarget:${job.restTargetSafe ? "safe" : "blocked"}`,
      `schedulerProof:${job.schedulerConfigProof ? "dashboard/config" : "missing"}`,
      `secret:${job.secretRedacted && !job.containsSecretMaterial ? "redacted" : "blocked"}`,
      `verifyWrite:${job.verifyRouteWrite ? "blocked" : "none"}`,
      `age:${Number.isFinite(ageMinutes) ? `${ageMinutes}m` : "missing"}`,
    ].join(" | "),
    evidenceTable: job.evidenceTable,
    functionName: job.functionName,
    id: job.id,
    label: job.label,
    mode: job.mode,
    observedAt: job.observedAt ?? "missing",
    requirement: passes
      ? "Fresh scheduled non-dry-run row with trigger_source=scheduled, valid aggregate counts, failed_count=0, safe REST target, redacted secrets, and dashboard/config proof"
      : getRequirement(job, fresh),
    runId: job.runId ?? "missing",
    status,
  };
}

function getRequirement(job: HostedCronEvidenceInput, fresh: boolean) {
  if (job.mode === "missing" || !job.runId)
    return "Fresh scheduled evidence row with aggregate counts is required";
  if (job.mode === "dry_run")
    return "Dry-run or manual authorized calls must be replaced by trigger_source=scheduled evidence";
  if (!fresh) return "Scheduled evidence row is stale";
  if (job.triggerSource !== "scheduled") return "Scheduler origin must be trigger_source=scheduled";
  if (!job.schedulerConfigProof) return "External scheduler dashboard/config proof is required";
  if (job.aggregateCountStatus === "missing") return "Aggregate count fields are missing";
  if (job.aggregateCountStatus === "invalid") return "Aggregate count fields are invalid";
  if (job.failedCount !== 0) return "failed_count must be zero";
  if (!job.restTargetSafe) return "Supabase REST target must be safe";
  if (job.containsSecretMaterial || !job.secretRedacted)
    return "Secret material must stay redacted";
  if (job.verifyRouteWrite) return "Verify route must not write evidence rows";
  if (!job.evidenceRecorded) return "Evidence row must be recorded";
  if (!job.mutationProof) return "Live mutation proof is required";
  return "External scheduler proof required";
}
