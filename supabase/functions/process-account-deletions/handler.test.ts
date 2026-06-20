import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  ACCOUNT_DELETION_USER_STORAGE_BUCKETS,
  type AccountDeletionProcessorRunEvidenceRecord,
  type DeletionRequestRow,
} from "./contract.ts";
import {
  handleProcessAccountDeletions,
  type ProcessAccountDeletionsHandlerDeps,
} from "./handler.ts";

const endpoint = "https://functions.example/process-account-deletions";
const nowIso = "2026-07-13T10:00:00.000Z";
const runId = "account-deletion-run-1";
const processorSecret = "processor-secret";

Deno.test("account deletion processor handler answers CORS and method guards without dependencies", async () => {
  const deps = stubDeps({
    listDueDeletionRequests: () => {
      throw new Error("due requests should not be listed");
    },
  });

  const optionsResponse = await handleProcessAccountDeletions(
    new Request(endpoint, { method: "OPTIONS" }),
    deps,
  );
  assertEquals(optionsResponse.status, 200);
  assertEquals(optionsResponse.headers.get("Access-Control-Allow-Origin"), "*");

  const getResponse = await handleProcessAccountDeletions(
    new Request(endpoint, { method: "GET" }),
    deps,
  );
  assertEquals(getResponse.status, 405);
  assertEquals(await getResponse.json(), { error: "Method not allowed." });
});

Deno.test("account deletion processor handler requires secret before body parsing", async () => {
  let listCalls = 0;
  const response = await handleProcessAccountDeletions(
    new Request(endpoint, {
      body: "{",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    stubDeps({
      listDueDeletionRequests: async () => {
        listCalls += 1;
        return [];
      },
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(await response.json(), {
    error: "Unauthorized deletion processor request.",
  });
  assertEquals(listCalls, 0);
});

Deno.test("account deletion processor handler records non-destructive dry-run evidence", async () => {
  const evidenceRows: AccountDeletionProcessorRunEvidenceRecord[] = [];
  const dueBeforeCalls: Array<{ dueBefore: string; limit: number }> = [];
  const dueRequests = [
    dueRequest(),
    dueRequest({
      id: "33333333-3333-4333-8333-333333333333",
      user_id: "44444444-4444-4444-8444-444444444444",
    }),
  ];

  const response = await handleProcessAccountDeletions(
    processorRequest({
      dry_run: true,
      limit: "250",
      triggerSource: "hosted-deploy-gate",
    }),
    stubDeps({
      deleteUser: () => {
        throw new Error("users should not be deleted during dry-run");
      },
      listDueDeletionRequests: async (input) => {
        dueBeforeCalls.push(input);
        return dueRequests;
      },
      recordProcessorRunEvidence: async (evidence) => {
        evidenceRows.push(evidence);
        return evidence;
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    dryRun: true,
    evidenceRecorded: true,
    failedCount: 0,
    limit: 100,
    processed: [],
    processedCount: 0,
    runId,
    storageBuckets: ACCOUNT_DELETION_USER_STORAGE_BUCKETS,
    triggerSource: "hosted_deploy_gate",
    wouldProcess: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        scheduledAt: "2026-07-13T10:30:00.000Z",
        userId: "22222222-2222-4222-8222-222222222222",
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        scheduledAt: "2026-07-13T10:30:00.000Z",
        userId: "44444444-4444-4444-8444-444444444444",
      },
    ],
  });
  assertEquals(dueBeforeCalls, [{ dueBefore: nowIso, limit: 100 }]);
  assertEquals(evidenceRows, [
    {
      claimed_count: 0,
      completed_at: nowIso,
      completed_count: 0,
      dry_run: true,
      due_request_count: 2,
      failed_count: 0,
      limit_count: 100,
      run_id: runId,
      skipped_count: 0,
      skipped_summary: {},
      started_at: nowIso,
      status: "dry_run",
      storage_bucket_count: ACCOUNT_DELETION_USER_STORAGE_BUCKETS.length,
      trigger_source: "hosted_deploy_gate",
      would_process_count: 2,
    },
  ]);
});

Deno.test("account deletion processor handler treats malformed JSON as default live body", async () => {
  const evidenceRows: AccountDeletionProcessorRunEvidenceRecord[] = [];
  const response = await handleProcessAccountDeletions(
    processorRequest("{", { rawBody: true }),
    stubDeps({
      recordProcessorRunEvidence: async (evidence) => {
        evidenceRows.push(evidence);
        return evidence;
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    dryRun: false,
    evidenceRecorded: true,
    failedCount: 0,
    limit: 20,
    processed: [],
    processedCount: 0,
    runId,
    storageBuckets: ACCOUNT_DELETION_USER_STORAGE_BUCKETS,
    triggerSource: "manual",
  });
  assertEquals(evidenceRows[0].dry_run, false);
  assertEquals(evidenceRows[0].limit_count, 20);
  assertEquals(evidenceRows[0].status, "completed");
  assertEquals(evidenceRows[0].trigger_source, "manual");
});

Deno.test("account deletion processor handler records skipped claims", async () => {
  const evidenceRows: AccountDeletionProcessorRunEvidenceRecord[] = [];
  const response = await handleProcessAccountDeletions(
    processorRequest({ dry_run: false, limit: 1 }),
    stubDeps({
      claimDeletionRequest: async () => null,
      listDueDeletionRequests: async () => [dueRequest()],
      recordProcessorRunEvidence: async (evidence) => {
        evidenceRows.push(evidence);
        return evidence;
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    dryRun: false,
    evidenceRecorded: true,
    failedCount: 0,
    limit: 1,
    processed: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        reason:
          "Request was cancelled or no longer pending before processor claim.",
        status: "skipped",
        userId: "22222222-2222-4222-8222-222222222222",
      },
    ],
    processedCount: 1,
    runId,
    storageBuckets: ACCOUNT_DELETION_USER_STORAGE_BUCKETS,
    triggerSource: "manual",
  });
  assertEquals(evidenceRows[0].claimed_count, 0);
  assertEquals(evidenceRows[0].skipped_count, 1);
  assertEquals(evidenceRows[0].skipped_summary, {
    no_longer_pending_before_claim: 1,
  });
});

Deno.test("account deletion processor handler completes claimed deletions", async () => {
  const operations: string[] = [];
  const response = await handleProcessAccountDeletions(
    processorRequest({ dry_run: false, limit: 1 }),
    stubDeps({
      deleteKnownUserStorage: async (userId) => {
        operations.push(`storage:${userId}`);
      },
      deleteUser: async (userId) => {
        operations.push(`auth:${userId}`);
      },
      listDueDeletionRequests: async () => [dueRequest()],
      markCompletedDeletionRequest: async (input) => {
        operations.push(`complete:${input.requestId}:${input.completedAt}`);
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    dryRun: false,
    evidenceRecorded: true,
    failedCount: 0,
    limit: 1,
    processed: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        status: "completed",
        userId: "22222222-2222-4222-8222-222222222222",
      },
    ],
    processedCount: 1,
    runId,
    storageBuckets: ACCOUNT_DELETION_USER_STORAGE_BUCKETS,
    triggerSource: "manual",
  });
  assertEquals(operations, [
    "storage:22222222-2222-4222-8222-222222222222",
    "auth:22222222-2222-4222-8222-222222222222",
    "complete:11111111-1111-4111-8111-111111111111:2026-07-13T10:00:00.000Z",
  ]);
});

Deno.test("account deletion processor handler records deletion failures", async () => {
  const failedAuditCalls: Array<{ message: string; requestId: string }> = [];
  const evidenceRows: AccountDeletionProcessorRunEvidenceRecord[] = [];
  const response = await handleProcessAccountDeletions(
    processorRequest({ dry_run: false, limit: 1 }),
    stubDeps({
      deleteUser: () => {
        throw new Error("Auth delete failed");
      },
      listDueDeletionRequests: async () => [dueRequest()],
      markFailedDeletionRequest: async (input) => {
        failedAuditCalls.push({
          message: input.message,
          requestId: input.request.id,
        });
      },
      recordProcessorRunEvidence: async (evidence) => {
        evidenceRows.push(evidence);
        return evidence;
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    dryRun: false,
    evidenceRecorded: true,
    failedCount: 1,
    limit: 1,
    processed: [
      {
        error: "Auth delete failed",
        id: "11111111-1111-4111-8111-111111111111",
        status: "failed",
        userId: "22222222-2222-4222-8222-222222222222",
      },
    ],
    processedCount: 1,
    runId,
    storageBuckets: ACCOUNT_DELETION_USER_STORAGE_BUCKETS,
    triggerSource: "manual",
  });
  assertEquals(failedAuditCalls, [
    {
      message: "Auth delete failed",
      requestId: "11111111-1111-4111-8111-111111111111",
    },
  ]);
  assertEquals(evidenceRows[0].failed_count, 1);
  assertEquals(evidenceRows[0].status, "failed");
});

Deno.test("account deletion processor handler reports audit failure after deletion failure", async () => {
  const response = await handleProcessAccountDeletions(
    processorRequest({ dry_run: false, limit: 1 }),
    stubDeps({
      deleteUser: () => {
        throw new Error("Auth delete failed");
      },
      listDueDeletionRequests: async () => [dueRequest()],
      markFailedDeletionRequest: () => {
        throw new Error("Audit write failed");
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    dryRun: false,
    evidenceRecorded: true,
    failedCount: 1,
    limit: 1,
    processed: [
      {
        error: "Auth delete failed; audit update failed: Audit write failed",
        id: "11111111-1111-4111-8111-111111111111",
        status: "failed",
        userId: "22222222-2222-4222-8222-222222222222",
      },
    ],
    processedCount: 1,
    runId,
    storageBuckets: ACCOUNT_DELETION_USER_STORAGE_BUCKETS,
    triggerSource: "manual",
  });
});

function processorRequest(
  body: unknown,
  options: { rawBody?: boolean } = {},
): Request {
  return new Request(endpoint, {
    body: options.rawBody ? String(body) : JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${processorSecret}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

function dueRequest(
  overrides: Partial<DeletionRequestRow> = {},
): DeletionRequestRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    request_metadata: { source: "test" },
    scheduled_at: "2026-07-13T10:30:00.000Z",
    user_id: "22222222-2222-4222-8222-222222222222",
    ...overrides,
  };
}

function stubDeps(
  overrides: Partial<ProcessAccountDeletionsHandlerDeps> = {},
): ProcessAccountDeletionsHandlerDeps {
  return {
    claimDeletionRequest: async ({ request }) => request,
    deleteKnownUserStorage: async () => {},
    deleteUser: async () => {},
    getExpectedSecret: () => processorSecret,
    listDueDeletionRequests: async () => [],
    markCompletedDeletionRequest: async () => {},
    markFailedDeletionRequest: async () => {},
    now: () => new Date(nowIso),
    randomUUID: () => runId,
    recordProcessorRunEvidence: async (evidence) => evidence,
    ...overrides,
  };
}
