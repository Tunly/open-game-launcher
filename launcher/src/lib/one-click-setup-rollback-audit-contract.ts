import {
  buildOneClickSetupReadiness,
  type OneClickSetupReadiness,
  type OneClickSetupStatus,
} from "./one-click-setup-readiness";

export type OneClickSetupRollbackAuditStatus = "blocked" | "pass" | "review";

export interface OneClickSetupRollbackAuditContractInput {
  auditEnvelopeReady: boolean;
  cleanupPlanReady: boolean;
  failure?: OneClickSetupRollbackAuditFailureInput;
  partialFailureMapReady: boolean;
  readiness?: OneClickSetupReadiness;
  setupStepLedgerReady: boolean;
  undoPlanReady: boolean;
}

export interface OneClickSetupRollbackAuditFailureInput {
  failedStepId: string;
  rawError: string;
  source: "local-fixture" | "operator-review" | "verify-route";
}

export interface OneClickSetupRollbackAuditLane {
  detail: string;
  evidence: string;
  id: string;
  label: string;
  skipped: string;
  status: OneClickSetupRollbackAuditStatus;
  surface: "Audit" | "Cleanup" | "Failure" | "Ledger" | "Rollback";
}

export interface OneClickSetupRollbackAuditContract {
  blockedClaims: string[];
  blockedCount: number;
  createdAt: string;
  guardCopy: string;
  lanes: OneClickSetupRollbackAuditLane[];
  packet: OneClickSetupRollbackAuditPacket;
  packetId: string;
  passCount: number;
  reviewCount: number;
  statusLabel: string;
  summary: string;
}

export interface OneClickSetupRollbackAuditPacket {
  auditPersisted: false;
  auditEnvelope: OneClickSetupRollbackAuditEnvelope;
  cleanupCandidates: OneClickSetupRollbackAuditCleanupCandidate[];
  cleanupExecuted: false;
  deletes: string[];
  generatedAt: string;
  liveCalls: string[];
  mode: "local-no-write-rehearsal";
  packetId: string;
  partialFailureMap: OneClickSetupRollbackAuditFailurePlan[];
  rollbackExecuted: false;
  rollbackOrder: OneClickSetupRollbackAuditAction[];
  setupStepLedger: OneClickSetupRollbackAuditStepLedgerEntry[];
  validationErrors: string[];
  writes: string[];
}

export interface OneClickSetupRollbackAuditStepLedgerEntry {
  action: string;
  known: boolean;
  label: string;
  rollbackCheckpoint: string;
  stepId: string;
  status: OneClickSetupStatus;
}

export interface OneClickSetupRollbackAuditAction {
  checkpoint: string;
  deletes: string[];
  order: number;
  review: string;
  stepId: string;
  writes: string[];
}

export interface OneClickSetupRollbackAuditFailurePlan {
  checkpoint: string;
  outcome: "failed-step" | "not-reached" | "review-before-retry" | "unknown-step-blocked";
  redactedError: string;
  stepId: string;
}

export interface OneClickSetupRollbackAuditCleanupCandidate {
  label: string;
  reason: string;
  willDelete: false;
}

export interface OneClickSetupRollbackAuditEnvelope {
  actor: "local-rehearsal";
  auditPersisted: false;
  deletes: string[];
  evidenceLinks: string[];
  packetId: string;
  redactedError: string;
  redactionApplied: boolean;
  source: OneClickSetupRollbackAuditFailureInput["source"];
  status: "rehearsal-only";
  stepId: string;
  writes: string[];
}

export const ONE_CLICK_SETUP_ROLLBACK_AUDIT_BLOCKED_CLAIMS = [
  "No hosted auth E2E",
  "No provider OAuth/token replay",
  "No provider-approved silent install",
  "No setup execution",
  "No installer or silent install start",
  "No local file write/delete",
  "No hosted/Supabase write",
  "No provider client mutation",
  "No provider paths touched",
  "No keychain migration",
  "No rollback execution or success claim",
  "No cleanup file deletion",
  "No audit row persisted",
  "No consent/terms approval",
  "No production setup completion claim",
];

const ONE_CLICK_SETUP_ROLLBACK_AUDIT_GUARD_COPY =
  "Local no-write rollback/audit rehearsal only. This reviews setup-step ledger, undo plan, partial-failure mapping, cleanup plan, and audit envelope shape without hosted auth, provider OAuth replay, token migration, automatic install, file deletion, Supabase audit writes, or production deployment proof.";

const EXPECTED_ONE_CLICK_SETUP_STEP_IDS = [
  "desktop-runtime",
  "install-target",
  "platform-links",
  "library-seed",
  "backup-restore",
  "cloud-account",
] as const;

const ROLLBACK_CHECKPOINT_BY_STEP_ID: Record<string, string> = {
  "backup-restore": "backup-reminder-draft-review",
  "cloud-account": "cloud-session-draft-review",
  "desktop-runtime": "desktop-runtime-state-review",
  "install-target": "install-target-draft-clear",
  "library-seed": "library-seed-cache-review",
  "platform-links": "provider-link-session-review",
};

const CLEANUP_CANDIDATES: OneClickSetupRollbackAuditCleanupCandidate[] = [
  {
    label: "Temp setup bundle labels",
    reason: "Reviewed as labels only; temp folders are not deleted.",
    willDelete: false,
  },
  {
    label: "Download cache labels",
    reason: "Cache cleanup is listed for operator review only.",
    willDelete: false,
  },
  {
    label: "Shortcut draft labels",
    reason: "Shortcut drafts are not written or removed in this rehearsal.",
    willDelete: false,
  },
  {
    label: "Provider session labels",
    reason: "Provider accounts and keychain entries are not replayed.",
    willDelete: false,
  },
];

const DEFAULT_FAILURE: OneClickSetupRollbackAuditFailureInput = {
  failedStepId: "platform-links",
  rawError: "Provider callback unavailable in local no-write rehearsal.",
  source: "local-fixture",
};

export function buildOneClickSetupRollbackAuditContract(
  input: OneClickSetupRollbackAuditContractInput,
): OneClickSetupRollbackAuditContract {
  const readiness = input.readiness ?? createDefaultOneClickSetupReadiness();
  const packetId = "one-click-rollback-audit-contract-local-001";
  const createdAt = "2026-06-16T00:00:00.000Z";
  const packet = buildOneClickSetupRollbackAuditPacket(readiness, input.failure, {
    generatedAt: createdAt,
    packetId,
  });
  const packetIsValid = packet.validationErrors.length === 0;
  const lanes: OneClickSetupRollbackAuditLane[] = [
    {
      detail:
        "Pins the current local setup tape into ordered dry-run steps without executing any setup action.",
      evidence: `steps:${packet.setupStepLedger.map((step) => step.stepId).join(">")}`,
      id: "setup-step-ledger",
      label: "Setup Step Ledger",
      skipped: "No setup writes or installs",
      status: input.setupStepLedgerReady && packetIsValid ? "pass" : "blocked",
      surface: "Ledger",
    },
    {
      detail:
        "Reviews the rollback order for browser-local state, queue drafts, staged shortcuts, and pre-existing config snapshots.",
      evidence: `undo:${packet.rollbackOrder.map((action) => action.checkpoint).join(">")}`,
      id: "undo-plan",
      label: "Undo / Cleanup Order",
      skipped: "No rollback command executed",
      status: input.undoPlanReady ? "review" : "blocked",
      surface: "Rollback",
    },
    {
      detail:
        "Maps auth, provider, install, backup, and cloud-account failures to the first safe rollback checkpoint.",
      evidence: `failure-map:${packet.partialFailureMap
        .map((plan) => `${plan.stepId}:${plan.outcome}`)
        .join("|")}`,
      id: "partial-failure-map",
      label: "Partial Failure Map",
      skipped: "No provider replay or installer launch",
      status: input.partialFailureMapReady && packetIsValid ? "pass" : "blocked",
      surface: "Failure",
    },
    {
      detail:
        "Stages cleanup candidates as labels only so temp folders, download cache, and shortcut drafts stay untouched.",
      evidence: `cleanup:${packet.cleanupCandidates.map((candidate) => candidate.label).join("+")}`,
      id: "cleanup-plan",
      label: "Cleanup Candidate Plan",
      skipped: "No file deletion",
      status: input.cleanupPlanReady ? "review" : "blocked",
      surface: "Cleanup",
    },
    {
      detail:
        "Defines audit packet fields for packet id, step id, status, redacted error, actor, and no-secret evidence links.",
      evidence: "audit:packetId+stepId+status+redactedError+actor=local+writes=0+deletes=0",
      id: "audit-envelope",
      label: "Audit Envelope",
      skipped: "No Supabase audit row write",
      status: input.auditEnvelopeReady && packetIsValid ? "review" : "blocked",
      surface: "Audit",
    },
  ];
  const passCount = lanes.filter((lane) => lane.status === "pass").length;
  const reviewCount = lanes.filter((lane) => lane.status === "review").length;
  const blockedCount = lanes.filter((lane) => lane.status === "blocked").length;

  return {
    blockedClaims: [...ONE_CLICK_SETUP_ROLLBACK_AUDIT_BLOCKED_CLAIMS],
    blockedCount,
    createdAt,
    guardCopy: ONE_CLICK_SETUP_ROLLBACK_AUDIT_GUARD_COPY,
    lanes,
    packet,
    packetId,
    passCount,
    reviewCount,
    statusLabel: blockedCount > 0 ? "Blocked" : "No-write rehearsal",
    summary:
      "Local One-Click Setup rollback/audit rehearsal for step order, undo planning, failure mapping, cleanup labels, and audit envelope shape; hosted auth, provider OAuth/token replay, installs, writes, cleanup execution, and production deployment stay open.",
  };
}

export function buildOneClickSetupRollbackAuditPacket(
  readiness: OneClickSetupReadiness,
  failure: OneClickSetupRollbackAuditFailureInput = DEFAULT_FAILURE,
  options: { generatedAt?: string; packetId?: string } = {},
): OneClickSetupRollbackAuditPacket {
  const packetId = options.packetId ?? "one-click-rollback-audit-contract-local-001";
  const generatedAt = options.generatedAt ?? "2026-06-16T00:00:00.000Z";
  const setupStepLedger = readiness.steps.map((step) => ({
    action: step.action,
    known: EXPECTED_ONE_CLICK_SETUP_STEP_IDS.includes(
      step.id as (typeof EXPECTED_ONE_CLICK_SETUP_STEP_IDS)[number],
    ),
    label: step.label,
    rollbackCheckpoint: ROLLBACK_CHECKPOINT_BY_STEP_ID[step.id] ?? "blocked-unknown-step",
    stepId: step.id,
    status: step.status,
  }));
  const validationErrors = buildPacketValidationErrors(setupStepLedger, failure.failedStepId);
  const redactedError = redactOneClickSetupAuditText(failure.rawError);
  const rollbackOrder = buildRollbackOrder(setupStepLedger, failure.failedStepId);
  const partialFailureMap = buildPartialFailureMap(
    setupStepLedger,
    failure.failedStepId,
    redactedError,
  );

  return {
    auditPersisted: false,
    auditEnvelope: {
      actor: "local-rehearsal",
      auditPersisted: false,
      deletes: [],
      evidenceLinks: [
        "local-one-click-setup-readiness",
        "local-rollback-audit-contract",
        "redacted-operator-evidence-required",
      ],
      packetId,
      redactedError,
      redactionApplied: redactedError !== failure.rawError,
      source: failure.source,
      status: "rehearsal-only",
      stepId: failure.failedStepId,
      writes: [],
    },
    cleanupCandidates: CLEANUP_CANDIDATES.map((candidate) => ({ ...candidate })),
    cleanupExecuted: false,
    deletes: [],
    generatedAt,
    liveCalls: [],
    mode: "local-no-write-rehearsal",
    packetId,
    partialFailureMap,
    rollbackExecuted: false,
    rollbackOrder,
    setupStepLedger,
    validationErrors,
    writes: [],
  };
}

export function createVerifyOneClickSetupRollbackAuditContract(
  readiness: OneClickSetupReadiness = createDefaultOneClickSetupReadiness(),
): OneClickSetupRollbackAuditContract {
  return buildOneClickSetupRollbackAuditContract({
    auditEnvelopeReady: true,
    cleanupPlanReady: true,
    partialFailureMapReady: true,
    readiness,
    setupStepLedgerReady: true,
    undoPlanReady: true,
  });
}

export function createDefaultOneClickSetupReadiness(): OneClickSetupReadiness {
  return buildOneClickSetupReadiness({
    backupReminderConfigured: true,
    installDir: "D:\\OGLauncher\\Games",
    isDesktopRuntime: true,
    librarySnapshotCount: 18,
    platforms: [
      { gamesCount: 42, id: "steam", label: "Steam", linked: true },
      { gamesCount: 12, id: "gog", label: "GOG", linked: true },
      { gamesCount: 0, id: "epic", label: "Epic", linked: true },
      { id: "xbox", label: "Xbox", linked: false },
    ],
    supabaseConfigured: true,
  });
}

export function redactOneClickSetupAuditText(value: string): string {
  return value
    .replace(/\bAuthorization\s*:\s*Bearer\s+[^\s,;]+/gi, "Authorization: Bearer [redacted]")
    .replace(
      /\b(access_token|refresh_token|id_token|token|sig|signature|code)\s*=\s*([^&\s"'<>]+)/gi,
      "$1=[redacted]",
    )
    .replace(
      /\b(access_token|refresh_token|id_token|token|sig|signature|code)\s*:\s*([^,\s"'<>]+)/gi,
      "$1: [redacted]",
    )
    .replace(/\b(?:ogd|sbp)_[a-z0-9_=-]{8,}\b/gi, "[redacted-token]")
    .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, "[redacted-jwt]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[redacted-url]")
    .replace(/[A-Za-z]:\\[^\s"'<>]+/g, "[redacted-path]")
    .replace(/(?:\/Users|\/home|\/var|\/tmp|\/etc|\/opt)\/[^\s"'<>]+/g, "[redacted-path]");
}

function buildRollbackOrder(
  ledger: OneClickSetupRollbackAuditStepLedgerEntry[],
  failedStepId: string,
): OneClickSetupRollbackAuditAction[] {
  const failedIndex = ledger.findIndex((step) => step.stepId === failedStepId);
  const affectedSteps = (failedIndex >= 0 ? ledger.slice(0, failedIndex + 1) : ledger)
    .slice()
    .reverse();

  return affectedSteps.map((step, index) => ({
    checkpoint: step.rollbackCheckpoint,
    deletes: [],
    order: index + 1,
    review: `Review ${step.label} draft state only`,
    stepId: step.stepId,
    writes: [],
  }));
}

function buildPartialFailureMap(
  ledger: OneClickSetupRollbackAuditStepLedgerEntry[],
  failedStepId: string,
  redactedError: string,
): OneClickSetupRollbackAuditFailurePlan[] {
  const failedIndex = ledger.findIndex((step) => step.stepId === failedStepId);

  if (failedIndex < 0) {
    return [
      {
        checkpoint: "blocked-unknown-step",
        outcome: "unknown-step-blocked",
        redactedError,
        stepId: failedStepId,
      },
      ...ledger.map((step) => ({
        checkpoint: step.rollbackCheckpoint,
        outcome: "not-reached" as const,
        redactedError: "n/a",
        stepId: step.stepId,
      })),
    ];
  }

  return ledger.map((step, index) => ({
    checkpoint: step.rollbackCheckpoint,
    outcome:
      index === failedIndex
        ? "failed-step"
        : index < failedIndex
          ? "review-before-retry"
          : "not-reached",
    redactedError: index === failedIndex ? redactedError : "n/a",
    stepId: step.stepId,
  }));
}

function buildPacketValidationErrors(
  ledger: OneClickSetupRollbackAuditStepLedgerEntry[],
  failedStepId: string,
) {
  const errors: string[] = [];
  const unknownStepIds = ledger.filter((step) => !step.known).map((step) => step.stepId);

  if (unknownStepIds.length > 0) {
    errors.push(`Unknown setup step ids: ${unknownStepIds.join(", ")}`);
  }

  if (!ledger.some((step) => step.stepId === failedStepId)) {
    errors.push(`Failure step is not in the setup ledger: ${failedStepId}`);
  }

  return errors;
}
