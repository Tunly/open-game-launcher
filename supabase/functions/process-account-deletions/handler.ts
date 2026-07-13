import {
  accountDeletionJsonResponse,
  accountDeletionMethodNotAllowed,
  handleAccountDeletionOptions,
} from "../_shared/account-deletion-handler.ts";
import {
  ACCOUNT_DELETION_USER_STORAGE_BUCKETS,
  type AccountDeletionProcessorRunEvidenceRecord,
  buildAccountDeletionDryRunResponse,
  buildAccountDeletionProcessorRunEvidence,
  type DeletionRequestRow,
  parseAccountDeletionProcessorBody,
  type ProcessedDeletion,
  type ProcessorResponse,
  verifyAccountDeletionProcessorSecret,
} from "./contract.ts";

export interface ProcessAccountDeletionsHandlerDeps {
  claimDeletionRequest: (input: {
    claimedAt: string;
    request: DeletionRequestRow;
  }) => Promise<DeletionRequestRow | null>;
  deleteKnownUserStorage: (userId: string) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  getExpectedSecret: () => string;
  listDueDeletionRequests: (input: {
    dueBefore: string;
    limit: number;
  }) => Promise<DeletionRequestRow[]>;
  markCompletedDeletionRequest: (input: {
    completedAt: string;
    requestId: string;
  }) => Promise<void>;
  markFailedDeletionRequest: (input: {
    failedAt: string;
    message: string;
    request: DeletionRequestRow;
  }) => Promise<void>;
  now?: () => Date;
  randomUUID?: () => string;
  recordProcessorRunEvidence: (
    evidence: AccountDeletionProcessorRunEvidenceRecord,
  ) => Promise<AccountDeletionProcessorRunEvidenceRecord>;
}

export async function handleProcessAccountDeletions(
  request: Request,
  deps: ProcessAccountDeletionsHandlerDeps,
): Promise<Response> {
  const optionsResponse = handleAccountDeletionOptions(request);
  if (optionsResponse) {
    return optionsResponse;
  }

  if (request.method !== "POST") {
    return accountDeletionMethodNotAllowed();
  }

  const secretVerification = verifyAccountDeletionProcessorSecret(
    request,
    deps.getExpectedSecret(),
  );
  if (secretVerification.status === "error") {
    return accountDeletionJsonResponse(
      { error: secretVerification.error },
      secretVerification.statusCode,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return accountDeletionJsonResponse(
      { error: "Malformed JSON request body." },
      400,
    );
  }

  const { dryRun, executeAcknowledged, limit, triggerSource } =
    parseAccountDeletionProcessorBody(body);
  if (!dryRun && !executeAcknowledged) {
    return accountDeletionJsonResponse(
      {
        error:
          "Live account deletion processing requires execute: true acknowledgement.",
      },
      400,
    );
  }

  const runId = deps.randomUUID?.() ?? crypto.randomUUID();
  const startedAt = readIsoTimestamp(deps);
  const dueBefore = readIsoTimestamp(deps);
  const dueRequests = await deps.listDueDeletionRequests({ dueBefore, limit });

  if (dryRun) {
    const response = buildAccountDeletionDryRunResponse({
      dueRequests,
      limit,
    });
    const evidence = await recordProcessorRunEvidence(
      {
        claimedCount: 0,
        completedCount: 0,
        dryRun: true,
        dueRequestCount: dueRequests.length,
        failedCount: 0,
        limit,
        runId,
        skipped: {},
        skippedCount: 0,
        startedAt,
        storageBucketCount: ACCOUNT_DELETION_USER_STORAGE_BUCKETS.length,
        triggerSource,
        wouldProcessCount: response.wouldProcess?.length ?? 0,
      },
      deps,
    );

    return accountDeletionJsonResponse(
      withProcessorRunEvidence(response, evidence),
    );
  }

  const processed: ProcessedDeletion[] = [];
  for (const deletionRequest of dueRequests) {
    processed.push(await processDeletionRequest(deletionRequest, deps));
  }
  const failedCount =
    processed.filter((result) => result.status === "failed").length;
  const skippedCount =
    processed.filter((result) => result.status === "skipped").length;
  const completedCount =
    processed.filter((result) => result.status === "completed").length;
  const evidence = await recordProcessorRunEvidence(
    {
      claimedCount: processed.length - skippedCount,
      completedCount,
      dryRun: false,
      dueRequestCount: dueRequests.length,
      failedCount,
      limit,
      runId,
      skipped: skippedCount > 0
        ? { no_longer_pending_before_claim: skippedCount }
        : {},
      skippedCount,
      startedAt,
      storageBucketCount: ACCOUNT_DELETION_USER_STORAGE_BUCKETS.length,
      triggerSource,
      wouldProcessCount: 0,
    },
    deps,
  );

  return accountDeletionJsonResponse(
    withProcessorRunEvidence(
      {
        dryRun: false,
        failedCount,
        limit,
        processed,
        processedCount: processed.length,
        storageBuckets: ACCOUNT_DELETION_USER_STORAGE_BUCKETS,
      },
      evidence,
    ),
  );
}

async function processDeletionRequest(
  deletionRequest: DeletionRequestRow,
  deps: ProcessAccountDeletionsHandlerDeps,
): Promise<ProcessedDeletion> {
  const claimedRequest = await deps.claimDeletionRequest({
    claimedAt: readIsoTimestamp(deps),
    request: deletionRequest,
  });
  if (!claimedRequest) {
    return {
      id: deletionRequest.id,
      reason:
        "Request was cancelled or no longer pending before processor claim.",
      status: "skipped",
      userId: deletionRequest.user_id,
    };
  }

  const userId = claimedRequest.user_id;
  try {
    await deps.deleteKnownUserStorage(userId);
    await deps.deleteUser(userId);
    await deps.markCompletedDeletionRequest({
      completedAt: readIsoTimestamp(deps),
      requestId: claimedRequest.id,
    });
    return { id: claimedRequest.id, userId, status: "completed" };
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const auditError = await markFailedIfPossible(
      claimedRequest,
      message,
      deps,
    );
    return {
      error: auditError
        ? `${message}; audit update failed: ${auditError}`
        : message,
      id: claimedRequest.id,
      status: "failed",
      userId,
    };
  }
}

async function markFailedIfPossible(
  deletionRequest: DeletionRequestRow,
  message: string,
  deps: ProcessAccountDeletionsHandlerDeps,
): Promise<string | null> {
  try {
    await deps.markFailedDeletionRequest({
      failedAt: readIsoTimestamp(deps),
      message,
      request: deletionRequest,
    });
    return null;
  } catch (error) {
    return normalizeErrorMessage(error);
  }
}

async function recordProcessorRunEvidence(
  input: Omit<
    Parameters<typeof buildAccountDeletionProcessorRunEvidence>[0],
    "completedAt"
  >,
  deps: ProcessAccountDeletionsHandlerDeps,
): Promise<AccountDeletionProcessorRunEvidenceRecord> {
  return await deps.recordProcessorRunEvidence(
    buildAccountDeletionProcessorRunEvidence({
      ...input,
      completedAt: readIsoTimestamp(deps),
    }),
  );
}

function withProcessorRunEvidence<T extends ProcessorResponse>(
  response: T,
  evidence: AccountDeletionProcessorRunEvidenceRecord,
): T {
  return {
    ...response,
    evidenceRecorded: true,
    runId: evidence.run_id,
    triggerSource: evidence.trigger_source,
  };
}

function readIsoTimestamp(deps: ProcessAccountDeletionsHandlerDeps): string {
  return (deps.now?.() ?? new Date()).toISOString();
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
