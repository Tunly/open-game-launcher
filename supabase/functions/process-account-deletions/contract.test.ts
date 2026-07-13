import {
  ACCOUNT_DELETION_USER_STORAGE_BUCKETS,
  type AccountDeletionProcessorRunEvidenceInput,
  buildAccountDeletionCompletionMutation,
  buildAccountDeletionDryRunResponse,
  buildAccountDeletionFailureMutation,
  buildAccountDeletionProcessingClaim,
  buildAccountDeletionProcessorRunEvidence,
  type DeletionRequestRow,
  parseAccountDeletionProcessorBody,
  verifyAccountDeletionProcessorSecret,
} from "./contract.ts";

function makeRequest(headers: Record<string, string> = {}) {
  return new Request(
    "https://og-launcher.example/functions/v1/process-account-deletions",
    {
      headers,
      method: "POST",
    },
  );
}

function dueRequest(
  overrides: Partial<DeletionRequestRow> = {},
): DeletionRequestRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    request_metadata: { source: "test" },
    scheduled_at: "2026-07-13T10:00:00.000Z",
    user_id: "22222222-2222-4222-8222-222222222222",
    ...overrides,
  };
}

Deno.test(
  "account deletion processor parses dry-run body and clamps limits",
  () => {
    assertEquals(
      parseAccountDeletionProcessorBody({ dry_run: true, limit: "250" }),
      {
        dryRun: true,
        executeAcknowledged: false,
        limit: 100,
        triggerSource: "manual",
      },
    );
    assertEquals(
      parseAccountDeletionProcessorBody({
        dry_run: "true",
        limit: -1,
        triggerSource: "hosted-deploy-gate",
      }),
      {
        dryRun: false,
        executeAcknowledged: false,
        limit: 20,
        triggerSource: "hosted_deploy_gate",
      },
    );
    assertEquals(
      parseAccountDeletionProcessorBody({
        dry_run: false,
        execute: true,
        limit: 5,
      }),
      {
        dryRun: false,
        executeAcknowledged: true,
        limit: 5,
        triggerSource: "manual",
      },
    );
  },
);

Deno.test("account deletion processor accepts exact bearer secret", () => {
  assertEquals(
    verifyAccountDeletionProcessorSecret(
      makeRequest({ Authorization: "Bearer staging-secret" }),
      "staging-secret",
    ),
    {
      mode: "authorization_bearer",
      status: "ok",
    },
  );
});

Deno.test(
  "account deletion processor accepts exact x-account-deletion-secret",
  () => {
    assertEquals(
      verifyAccountDeletionProcessorSecret(
        makeRequest({ "x-account-deletion-secret": "staging-secret" }),
        "staging-secret",
      ),
      {
        mode: "x_account_deletion_secret",
        status: "ok",
      },
    );
  },
);

Deno.test(
  "account deletion processor rejects missing or partial secrets",
  () => {
    assertEquals(
      verifyAccountDeletionProcessorSecret(makeRequest(), "staging-secret"),
      {
        error: "Unauthorized deletion processor request.",
        status: "error",
        statusCode: 401,
      },
    );
    assertEquals(
      verifyAccountDeletionProcessorSecret(
        makeRequest({ Authorization: "Bearer staging" }),
        "staging-secret",
      ),
      {
        error: "Unauthorized deletion processor request.",
        status: "error",
        statusCode: 401,
      },
    );
  },
);

Deno.test("account deletion dry-run response is non-destructive", () => {
  const response = buildAccountDeletionDryRunResponse({
    dueRequests: [
      dueRequest(),
      dueRequest({
        id: "33333333-3333-4333-8333-333333333333",
        user_id: "44444444-4444-4444-8444-444444444444",
      }),
    ],
    limit: 20,
  });

  assertEquals(response.dryRun, true);
  assertEquals(response.processed, []);
  assertEquals(response.processedCount, 0);
  assertEquals(response.failedCount, 0);
  assertEquals(response.storageBuckets, ACCOUNT_DELETION_USER_STORAGE_BUCKETS);
  assertEquals(response.storageBuckets.includes("game-artwork"), true);
  assertEquals(response.storageBuckets.includes("screenshots"), false);
  assertEquals(response.wouldProcess?.length, 2);
  assertEquals(stableJson(response).includes("source"), false);
});

Deno.test("account deletion dry-run response is limited", () => {
  const response = buildAccountDeletionDryRunResponse({
    dueRequests: [
      dueRequest({
        id: "11111111-1111-4111-8111-111111111111",
        user_id: "22222222-2222-4222-8222-222222222222",
      }),
      dueRequest({
        id: "33333333-3333-4333-8333-333333333333",
        user_id: "44444444-4444-4444-8444-444444444444",
      }),
    ],
    limit: 1,
  });

  assertEquals(response.limit, 1);
  assertEquals(response.wouldProcess, [
    {
      id: "11111111-1111-4111-8111-111111111111",
      scheduledAt: "2026-07-13T10:00:00.000Z",
      userId: "22222222-2222-4222-8222-222222222222",
    },
  ]);
});

Deno.test(
  "account deletion processor run evidence is sanitized aggregates",
  () => {
    const evidence = buildAccountDeletionProcessorRunEvidence({
      claimedCount: 2,
      completedAt: "2026-07-13T10:04:00.000Z",
      completedCount: 1,
      dryRun: false,
      dueRequestCount: 3,
      failedCount: 1,
      limit: 20,
      runId: "account-deletion-run-1",
      skipped: {
        no_longer_pending_before_claim: 1,
        "bad key with spaces": 99,
      },
      skippedCount: 1,
      startedAt: "2026-07-13T10:03:00.000Z",
      storageBucketCount: ACCOUNT_DELETION_USER_STORAGE_BUCKETS.length,
      triggerSource: "scheduled",
      wouldProcessCount: 0,
    });

    assertEquals(evidence, {
      claimed_count: 2,
      completed_at: "2026-07-13T10:04:00.000Z",
      completed_count: 1,
      dry_run: false,
      due_request_count: 3,
      failed_count: 1,
      limit_count: 20,
      run_id: "account-deletion-run-1",
      skipped_count: 1,
      skipped_summary: {
        no_longer_pending_before_claim: 1,
      },
      started_at: "2026-07-13T10:03:00.000Z",
      status: "failed",
      storage_bucket_count: ACCOUNT_DELETION_USER_STORAGE_BUCKETS.length,
      trigger_source: "scheduled",
      would_process_count: 0,
    });
    const json = stableJson(evidence);
    assertEquals(json.includes("11111111-1111-4111-8111-111111111111"), false);
    assertEquals(json.includes("22222222-2222-4222-8222-222222222222"), false);
  },
);

Deno.test(
  "account deletion processor run evidence allows dry-run would-process count",
  () => {
    const evidence = buildAccountDeletionProcessorRunEvidence(
      validProcessorRunEvidence({
        claimedCount: 0,
        completedCount: 0,
        dryRun: true,
        dueRequestCount: 3,
        failedCount: 0,
        skipped: {},
        skippedCount: 0,
        status: "dry_run",
        wouldProcessCount: 3,
      }),
    );

    assertEquals(evidence.dry_run, true);
    assertEquals(evidence.status, "dry_run");
    assertEquals(evidence.would_process_count, 3);
    assertEquals(evidence.claimed_count, 0);
    assertEquals(evidence.completed_count, 0);
    assertEquals(evidence.failed_count, 0);
    assertEquals(evidence.skipped_count, 0);
  },
);

Deno.test(
  "account deletion processor run evidence rejects due and claim mismatch",
  () => {
    assertThrowsStableEvidenceError(() =>
      buildAccountDeletionProcessorRunEvidence(
        validProcessorRunEvidence({
          claimedCount: 1,
          dueRequestCount: 3,
          skipped: { no_longer_pending_before_claim: 1 },
          skippedCount: 1,
        }),
      ),
    );
  },
);

Deno.test(
  "account deletion processor run evidence rejects completed and failed mismatch",
  () => {
    assertThrowsStableEvidenceError(() =>
      buildAccountDeletionProcessorRunEvidence(
        validProcessorRunEvidence({
          claimedCount: 2,
          completedCount: 1,
          dueRequestCount: 2,
          failedCount: 0,
        }),
      ),
    );
  },
);

Deno.test(
  "account deletion processor run evidence rejects skipped summary mismatch",
  () => {
    assertThrowsStableEvidenceError(() =>
      buildAccountDeletionProcessorRunEvidence(
        validProcessorRunEvidence({
          claimedCount: 1,
          dueRequestCount: 3,
          skipped: { no_longer_pending_before_claim: 1 },
          skippedCount: 2,
        }),
      ),
    );
  },
);

Deno.test(
  "account deletion processor run evidence rejects storage bucket mismatch",
  () => {
    assertThrowsStableEvidenceError(() =>
      buildAccountDeletionProcessorRunEvidence(
        validProcessorRunEvidence({
          storageBucketCount: ACCOUNT_DELETION_USER_STORAGE_BUCKETS.length - 1,
        }),
      ),
    );
  },
);

Deno.test(
  "account deletion processor run evidence rejects dry-run would-process mismatch",
  () => {
    assertThrowsStableEvidenceError(() =>
      buildAccountDeletionProcessorRunEvidence(
        validProcessorRunEvidence({
          claimedCount: 0,
          completedCount: 0,
          dryRun: true,
          dueRequestCount: 3,
          failedCount: 0,
          skipped: {},
          skippedCount: 0,
          status: "dry_run",
          wouldProcessCount: 2,
        }),
      ),
    );
  },
);

Deno.test(
  "account deletion processor run evidence rejects failed status without failures",
  () => {
    assertThrowsStableEvidenceError(() =>
      buildAccountDeletionProcessorRunEvidence(
        validProcessorRunEvidence({
          status: "failed",
        }),
      ),
    );
  },
);

Deno.test(
  "account deletion processing claim is status and owner scoped",
  () => {
    assertEquals(
      buildAccountDeletionProcessingClaim({
        claimedAt: "2026-07-13T10:01:00.000Z",
        request: dueRequest(),
      }),
      {
        filters: [
          { column: "id", value: "11111111-1111-4111-8111-111111111111" },
          { column: "user_id", value: "22222222-2222-4222-8222-222222222222" },
          { column: "status", value: "pending" },
        ],
        lte: {
          column: "scheduled_at",
          value: "2026-07-13T10:01:00.000Z",
        },
        update: {
          request_metadata: {
            processor_started_at: "2026-07-13T10:01:00.000Z",
            source: "test",
          },
          status: "processing",
        },
      },
    );
  },
);

Deno.test("account deletion audit mutations require processing state", () => {
  assertEquals(
    buildAccountDeletionCompletionMutation({
      completedAt: "2026-07-13T10:02:00.000Z",
      requestId: "request-1",
    }),
    {
      filters: [
        { column: "id", value: "request-1" },
        { column: "status", value: "processing" },
      ],
      update: {
        completed_at: "2026-07-13T10:02:00.000Z",
        status: "completed",
      },
    },
  );

  const failure = buildAccountDeletionFailureMutation({
    failedAt: "2026-07-13T10:03:00.000Z",
    message: "x".repeat(2005),
    request: dueRequest(),
  });
  assertEquals(failure.filters, [
    { column: "id", value: "11111111-1111-4111-8111-111111111111" },
    { column: "status", value: "processing" },
  ]);
  assertEquals(failure.update.status, "failed");
  assertEquals(failure.update.error_message.length, 2000);
  assertEquals(failure.update.request_metadata, {
    processor_failed_at: "2026-07-13T10:03:00.000Z",
    source: "test",
  });
});

Deno.test(
  "account deletion processor run migration stores aggregate evidence only",
  async () => {
    const migration = await Deno.readTextFile(
      new URL(
        "../../migrations/20260615162000_account_deletion_processor_runs.sql",
        import.meta.url,
      ),
    );

    assertEquals(migration.includes("account_deletion_processor_runs"), true);
    assertEquals(
      migration.includes(
        "trigger_source in ('manual', 'scheduled', 'hosted_deploy_gate')",
      ),
      true,
    );
    assertEquals(
      migration.includes("raw request IDs, user IDs, secrets"),
      true,
    );
    assertEquals(
      migration.includes(
        "grant all on public.account_deletion_processor_runs to service_role",
      ),
      true,
    );
    assertEquals(
      migration.includes(
        "revoke all on public.account_deletion_processor_runs",
      ),
      true,
    );
  },
);

function validProcessorRunEvidence(
  overrides: Partial<AccountDeletionProcessorRunEvidenceInput> = {},
): AccountDeletionProcessorRunEvidenceInput {
  return {
    claimedCount: 2,
    completedAt: "2026-07-13T10:04:00.000Z",
    completedCount: 2,
    dryRun: false,
    dueRequestCount: 2,
    failedCount: 0,
    limit: 20,
    runId: "account-deletion-run-1",
    skipped: {},
    skippedCount: 0,
    startedAt: "2026-07-13T10:03:00.000Z",
    status: "completed",
    storageBucketCount: ACCOUNT_DELETION_USER_STORAGE_BUCKETS.length,
    triggerSource: "scheduled",
    wouldProcessCount: 0,
    ...overrides,
  };
}

function assertThrowsStableEvidenceError(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    assertEquals(
      error instanceof Error ? error.message : String(error),
      "Invalid account deletion processor evidence.",
    );
    return;
  }

  throw new Error(
    "Expected account deletion processor evidence to be invalid.",
  );
}

function assertEquals(actual: unknown, expected: unknown) {
  const actualJson = stableJson(actual);
  const expectedJson = stableJson(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      `Assertion failed:\nactual:   ${actualJson}\nexpected: ${expectedJson}`,
    );
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
