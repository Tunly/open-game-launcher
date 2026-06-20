// @vitest-environment node

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getAccountDeletionProcessorReadiness } from "../privacy-readiness";
import type { AccountDeletionRequest } from "../supabase/privacy";

function makeDeletionRequest(
  overrides: Partial<AccountDeletionRequest> = {},
): AccountDeletionRequest {
  return {
    cancelled_at: null,
    completed_at: null,
    created_at: "2026-06-10T10:00:00.000Z",
    error_message: null,
    failed_at: null,
    id: "11111111-1111-4111-8111-111111111111",
    reason: "leaving",
    request_metadata: {},
    requested_at: "2026-06-10T10:00:00.000Z",
    scheduled_at: "2026-07-10T10:00:00.000Z",
    status: "pending",
    updated_at: "2026-06-10T10:00:00.000Z",
    user_id: "22222222-2222-4222-8222-222222222222",
    ...overrides,
  };
}

describe("account deletion processor readiness", () => {
  it("summarizes a pending request while keeping hosted cron visible", () => {
    const readiness = getAccountDeletionProcessorReadiness({
      latestRequest: makeDeletionRequest(),
    });

    expect(readiness.statusLabel).toBe("Needs hosted cron");
    expect(readiness.blockedCount).toBe(0);
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Queue read", status: "pass" }),
        expect.objectContaining({ label: "Deletion request", status: "pass" }),
        expect.objectContaining({ label: "30-day hold", status: "pass" }),
        expect.objectContaining({ label: "Processor secret", status: "pass" }),
        expect.objectContaining({ label: "Dry-run contract", status: "pass" }),
        expect.objectContaining({ label: "Cron dry-run packet", status: "pass" }),
        expect.objectContaining({ label: "Hosted staging proof", status: "pass" }),
        expect.objectContaining({ label: "Hosted cron", status: "warning" }),
      ]),
    );
    expect(readiness.cronDryRunPacket.body).toEqual({ dry_run: true, limit: 20 });
    expect(readiness.cronDryRunPacket.writesEnabled).toBe(false);
    expect(readiness.cronDryRunPacket.redactedHeaders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Authorization",
          value: "Bearer $ACCOUNT_DELETION_PROCESSOR_SECRET",
        }),
      ]),
    );
    expect(readiness.hostedCronStagingProof).toEqual(
      expect.objectContaining({
        evidenceTable: "account_deletion_processor_runs",
        endpointPath: "/functions/v1/process-account-deletions",
        functionName: "process-account-deletions",
        latestRunId: "account-deletion-fixture",
        triggerSource: "staging-cron-fixture",
        workflow: "Supabase Scheduled Functions staging",
        writeMode: "No verify-route deletion write",
      }),
    );
    expect(readiness.hostedCronStagingProof.expectedDryRunResponse).toEqual(
      expect.objectContaining({
        dryRun: true,
        evidenceRecorded: true,
        failedCount: 0,
        limit: 20,
        processedCount: 0,
        runId: "account-deletion-fixture",
        storageBuckets: expect.arrayContaining(["game-artwork", "screenshots"]),
        triggerSource: "hosted_deploy_gate",
        wouldProcess: [
          {
            id: "account-deletion-request-redacted",
            scheduledAt: "2026-07-10T10:00:00.000Z",
            userId: "user-id-redacted",
          },
        ],
      }),
    );
    expect(readiness.hostedCronStagingProof.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Secret-gated caller", status: "pass" }),
        expect.objectContaining({ label: "Dry-run response shape", status: "pass" }),
        expect.objectContaining({ label: "Run evidence table", status: "pass" }),
        expect.objectContaining({ label: "Storage bucket manifest", status: "pass" }),
        expect.objectContaining({ label: "No-write verify route", status: "pass" }),
        expect.objectContaining({ label: "Trusted staging run", status: "warning" }),
      ]),
    );
    expect(readiness.hostedCronStagingProof.guards).toEqual(
      expect.arrayContaining([
        "No processor secret value",
        "No raw request id",
        "No raw user id",
        "No auth user deletion",
        "No storage deletion",
        "No request metadata payload",
        "No hosted cron success claim",
      ]),
    );
    const hostedProofJson = JSON.stringify(readiness.hostedCronStagingProof);
    expect(hostedProofJson).not.toContain("11111111-1111-4111-8111-111111111111");
    expect(hostedProofJson).not.toContain("22222222-2222-4222-8222-222222222222");
    expect(hostedProofJson).not.toContain("leaving");
    expect(hostedProofJson).not.toContain("ACCOUNT_DELETION_PROCESSOR_SECRET");
  });

  it("warns when there is no queued deletion request yet", () => {
    const readiness = getAccountDeletionProcessorReadiness({
      latestRequest: null,
    });

    expect(readiness.statusLabel).toBe("Needs hosted cron");
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Deletion request", status: "warning" }),
        expect.objectContaining({ label: "30-day hold", status: "warning" }),
      ]),
    );
  });

  it("blocks readiness when queue loading failed", () => {
    const readiness = getAccountDeletionProcessorReadiness({
      latestRequest: null,
      loadError: "Invalid or expired session.",
    });

    expect(readiness.statusLabel).toBe("Blocked");
    expect(readiness.blockedCount).toBeGreaterThanOrEqual(2);
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Queue read", status: "blocked" }),
        expect.objectContaining({ label: "Deletion request", status: "blocked" }),
      ]),
    );
  });

  it("blocks requests with a hold window shorter than 30 days", () => {
    const readiness = getAccountDeletionProcessorReadiness({
      latestRequest: makeDeletionRequest({
        scheduled_at: "2026-06-20T10:00:00.000Z",
      }),
    });

    expect(readiness.statusLabel).toBe("Blocked");
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "30-day hold", status: "blocked" }),
      ]),
    );
  });

  it("keeps the trusted deletion processor callable by hosted cron", () => {
    const config = readFileSync(resolve("../supabase/config.toml"), "utf8");

    expect(config).toContain("[functions.process-account-deletions]");
    expect(config).toMatch(/\[functions\.process-account-deletions\][\s\S]*verify_jwt\s*=\s*false/);
  });
});
