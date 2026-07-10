export type DeletionRequestRow = {
  id: string;
  user_id: string;
  scheduled_at: string;
  request_metadata: Record<string, unknown> | null;
};

export type ProcessedDeletion = {
  id: string;
  userId: string;
  status: "completed" | "failed" | "skipped";
  error?: string;
  reason?: string;
};

export type ProcessorResponse = {
  dryRun: boolean;
  evidenceRecorded?: boolean;
  failedCount: number;
  limit: number;
  processed: ProcessedDeletion[];
  processedCount: number;
  runId?: string;
  storageBuckets: string[];
  triggerSource?: AccountDeletionProcessorTriggerSource;
  wouldProcess?: Array<{
    id: string;
    scheduledAt: string;
    userId: string;
  }>;
};

export type ProcessorSecretVerification =
  | {
    mode: "authorization_bearer" | "x_account_deletion_secret";
    status: "ok";
  }
  | {
    error: string;
    status: "error";
    statusCode: 401;
  };

export type AccountDeletionProcessorTriggerSource =
  | "manual"
  | "scheduled"
  | "hosted_deploy_gate";

export type AccountDeletionProcessorRunStatus =
  | "dry_run"
  | "completed"
  | "failed";

export type AccountDeletionProcessorRunEvidenceInput = {
  claimedCount: number;
  completedAt: string;
  completedCount: number;
  dryRun: boolean;
  dueRequestCount: number;
  failedCount: number;
  limit: number;
  runId: string;
  skipped: Record<string, number>;
  skippedCount: number;
  startedAt: string;
  status?: AccountDeletionProcessorRunStatus;
  storageBucketCount: number;
  triggerSource: AccountDeletionProcessorTriggerSource;
  wouldProcessCount: number;
};

export type AccountDeletionProcessorRunEvidenceRecord = {
  claimed_count: number;
  completed_at: string;
  completed_count: number;
  dry_run: boolean;
  due_request_count: number;
  failed_count: number;
  limit_count: number;
  run_id: string;
  skipped_count: number;
  skipped_summary: Record<string, number>;
  started_at: string;
  status: AccountDeletionProcessorRunStatus;
  storage_bucket_count: number;
  trigger_source: AccountDeletionProcessorTriggerSource;
  would_process_count: number;
};

export const ACCOUNT_DELETION_PROCESSOR_DEFAULT_LIMIT = 20;
export const ACCOUNT_DELETION_PROCESSOR_MAX_LIMIT = 100;
export const ACCOUNT_DELETION_PROCESSING_STATUS = "processing";
export const ACCOUNT_DELETION_USER_STORAGE_BUCKETS = [
  "avatars",
  "profile-banners",
  "profile-showcases",
  "game-artwork",
];

const triggerSources: AccountDeletionProcessorTriggerSource[] = [
  "manual",
  "scheduled",
  "hosted_deploy_gate",
];

export function buildAccountDeletionProcessingClaim(input: {
  claimedAt: string;
  request: DeletionRequestRow;
}) {
  return {
    filters: [
      { column: "id", value: input.request.id },
      { column: "user_id", value: input.request.user_id },
      { column: "status", value: "pending" },
    ],
    lte: {
      column: "scheduled_at",
      value: input.claimedAt,
    },
    update: {
      request_metadata: {
        ...(input.request.request_metadata ?? {}),
        processor_started_at: input.claimedAt,
      },
      status: ACCOUNT_DELETION_PROCESSING_STATUS,
    },
  } as const;
}

export function buildAccountDeletionCompletionMutation(input: {
  completedAt: string;
  requestId: string;
}) {
  return {
    filters: [
      { column: "id", value: input.requestId },
      { column: "status", value: ACCOUNT_DELETION_PROCESSING_STATUS },
    ],
    update: {
      completed_at: input.completedAt,
      status: "completed",
    },
  } as const;
}

export function buildAccountDeletionFailureMutation(input: {
  failedAt: string;
  message: string;
  request: DeletionRequestRow;
}) {
  return {
    filters: [
      { column: "id", value: input.request.id },
      { column: "status", value: ACCOUNT_DELETION_PROCESSING_STATUS },
    ],
    update: {
      error_message: input.message.slice(0, 2000),
      failed_at: input.failedAt,
      request_metadata: {
        ...(input.request.request_metadata ?? {}),
        processor_failed_at: input.failedAt,
      },
      status: "failed",
    },
  } as const;
}

export function parseAccountDeletionProcessorBody(body: unknown): {
  dryRun: boolean;
  limit: number;
  triggerSource: AccountDeletionProcessorTriggerSource;
} {
  return {
    dryRun: readDryRun(body),
    limit: readLimit(body),
    triggerSource: readTriggerSource(body),
  };
}

export function buildAccountDeletionProcessorRunEvidence(
  input: AccountDeletionProcessorRunEvidenceInput,
): AccountDeletionProcessorRunEvidenceRecord {
  const runId = input.runId.trim();
  if (!runId) {
    throw new Error("Account deletion processor evidence requires a runId.");
  }

  const evidence = {
    claimed_count: nonNegativeInteger(input.claimedCount),
    completed_at: input.completedAt,
    completed_count: nonNegativeInteger(input.completedCount),
    dry_run: input.dryRun,
    due_request_count: nonNegativeInteger(input.dueRequestCount),
    failed_count: nonNegativeInteger(input.failedCount),
    limit_count: nonNegativeInteger(input.limit),
    run_id: runId,
    skipped_count: nonNegativeInteger(input.skippedCount),
    skipped_summary: sanitizeSkippedSummary(input.skipped),
    started_at: input.startedAt,
    status: input.status ??
      (input.dryRun
        ? "dry_run"
        : input.failedCount > 0
        ? "failed"
        : "completed"),
    storage_bucket_count: nonNegativeInteger(input.storageBucketCount),
    trigger_source: input.triggerSource,
    would_process_count: nonNegativeInteger(input.wouldProcessCount),
  };

  assertAccountDeletionProcessorRunEvidence(evidence);
  return evidence;
}

export function verifyAccountDeletionProcessorSecret(
  request: Request,
  expectedSecret: string,
): ProcessorSecretVerification {
  const normalizedExpectedSecret = expectedSecret.trim();
  const authHeader = request.headers.get("Authorization")?.trim();
  const bearerSecret = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const headerSecret = request.headers.get("x-account-deletion-secret")?.trim();

  if (normalizedExpectedSecret && bearerSecret === normalizedExpectedSecret) {
    return { mode: "authorization_bearer", status: "ok" };
  }

  if (normalizedExpectedSecret && headerSecret === normalizedExpectedSecret) {
    return { mode: "x_account_deletion_secret", status: "ok" };
  }

  return {
    error: "Unauthorized deletion processor request.",
    status: "error",
    statusCode: 401,
  };
}

export function buildAccountDeletionDryRunResponse(input: {
  dueRequests: DeletionRequestRow[];
  limit: number;
}): ProcessorResponse {
  const limitedDueRequests = input.dueRequests.slice(0, input.limit);

  return {
    dryRun: true,
    failedCount: 0,
    limit: input.limit,
    processed: [],
    processedCount: 0,
    storageBuckets: [...ACCOUNT_DELETION_USER_STORAGE_BUCKETS],
    wouldProcess: limitedDueRequests.map((deletionRequest) => ({
      id: deletionRequest.id,
      scheduledAt: deletionRequest.scheduled_at,
      userId: deletionRequest.user_id,
    })),
  };
}

function readLimit(body: unknown): number {
  if (!body || typeof body !== "object" || !("limit" in body)) {
    return ACCOUNT_DELETION_PROCESSOR_DEFAULT_LIMIT;
  }

  const rawLimit = (body as { limit?: unknown }).limit;
  const parsed = typeof rawLimit === "number"
    ? rawLimit
    : Number.parseInt(String(rawLimit), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return ACCOUNT_DELETION_PROCESSOR_DEFAULT_LIMIT;
  }

  return Math.min(Math.trunc(parsed), ACCOUNT_DELETION_PROCESSOR_MAX_LIMIT);
}

function readDryRun(body: unknown): boolean {
  if (!body || typeof body !== "object" || !("dry_run" in body)) {
    return false;
  }

  return (body as { dry_run?: unknown }).dry_run === true;
}

function readTriggerSource(
  body: unknown,
): AccountDeletionProcessorTriggerSource {
  if (!body || typeof body !== "object") {
    return "manual";
  }

  const record = body as Record<string, unknown>;
  const value = record.trigger_source ?? record.triggerSource;
  if (typeof value !== "string") {
    return "manual";
  }

  const normalized = value.trim().toLowerCase().replaceAll("-", "_");
  return triggerSources.includes(
      normalized as AccountDeletionProcessorTriggerSource,
    )
    ? (normalized as AccountDeletionProcessorTriggerSource)
    : "manual";
}

function sanitizeSkippedSummary(skipped: Record<string, number>) {
  const summary: Record<string, number> = {};
  for (const [key, value] of Object.entries(skipped)) {
    if (/^[a-z0-9_:-]+$/i.test(key)) {
      summary[key] = nonNegativeInteger(value);
    }
  }
  return summary;
}

function assertAccountDeletionProcessorRunEvidence(
  evidence: AccountDeletionProcessorRunEvidenceRecord,
) {
  if (
    evidence.storage_bucket_count !==
      ACCOUNT_DELETION_USER_STORAGE_BUCKETS.length
  ) {
    throw new Error("Invalid account deletion processor evidence.");
  }

  if (evidence.dry_run) {
    if (
      evidence.status !== "dry_run" ||
      evidence.claimed_count !== 0 ||
      evidence.completed_count !== 0 ||
      evidence.failed_count !== 0 ||
      evidence.skipped_count !== 0 ||
      evidence.due_request_count > evidence.limit_count ||
      evidence.would_process_count !== evidence.due_request_count ||
      sumSkippedSummary(evidence.skipped_summary) !== 0
    ) {
      throw new Error("Invalid account deletion processor evidence.");
    }
    return;
  }

  if (evidence.status === "dry_run") {
    throw new Error("Invalid account deletion processor evidence.");
  }

  if (evidence.due_request_count > evidence.limit_count) {
    throw new Error("Invalid account deletion processor evidence.");
  }

  if (
    evidence.claimed_count + evidence.skipped_count !==
      evidence.due_request_count
  ) {
    throw new Error("Invalid account deletion processor evidence.");
  }

  if (
    evidence.completed_count + evidence.failed_count !== evidence.claimed_count
  ) {
    throw new Error("Invalid account deletion processor evidence.");
  }

  if (evidence.would_process_count !== 0) {
    throw new Error("Invalid account deletion processor evidence.");
  }

  if (sumSkippedSummary(evidence.skipped_summary) !== evidence.skipped_count) {
    throw new Error("Invalid account deletion processor evidence.");
  }

  if (evidence.failed_count > 0 && evidence.status === "completed") {
    throw new Error("Invalid account deletion processor evidence.");
  }

  if (evidence.status === "failed" && evidence.failed_count === 0) {
    throw new Error("Invalid account deletion processor evidence.");
  }
}

function sumSkippedSummary(summary: Record<string, number>) {
  return Object.values(summary).reduce((total, count) => total + count, 0);
}

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}
