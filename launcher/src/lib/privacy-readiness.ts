import type { AccountDeletionRequest } from "./supabase/privacy";

export type PrivacyReadinessCheckStatus = "pass" | "warning" | "blocked";

export interface PrivacyReadinessCheck {
  detail: string;
  label: string;
  status: PrivacyReadinessCheckStatus;
}

export interface AccountDeletionProcessorReadiness {
  blockedCount: number;
  checks: PrivacyReadinessCheck[];
  cronDryRunPacket: AccountDeletionCronDryRunPacket;
  hostedCronStagingProof: AccountDeletionHostedCronStagingProof;
  passedCount: number;
  statusLabel: "Blocked" | "Needs hosted cron" | "Ready";
  summary: string;
  warningCount: number;
}

export interface AccountDeletionCronDryRunPacket {
  body: {
    dry_run: true;
    limit: number;
  };
  endpointPath: "/functions/v1/process-account-deletions";
  expectedResponseKeys: string[];
  method: "POST";
  redactedHeaders: Array<{
    name: string;
    value: string;
  }>;
  scheduleHint: string;
  writesEnabled: false;
}

export interface AccountDeletionHostedCronProofRow {
  detail: string;
  id: string;
  label: string;
  status: PrivacyReadinessCheckStatus;
}

export interface AccountDeletionHostedCronStagingProof {
  evidenceTable: "account_deletion_processor_runs";
  endpointPath: "/functions/v1/process-account-deletions";
  expectedDryRunResponse: {
    dryRun: true;
    evidenceRecorded: true;
    failedCount: 0;
    limit: number;
    processedCount: 0;
    runId: string;
    storageBuckets: string[];
    triggerSource: "hosted_deploy_gate";
    wouldProcess: Array<{
      id: string;
      scheduledAt: string;
      userId: string;
    }>;
  };
  functionName: "process-account-deletions";
  guardCopy: string;
  guards: string[];
  latestRunId: "account-deletion-fixture";
  rows: AccountDeletionHostedCronProofRow[];
  triggerSource: "staging-cron-fixture";
  workflow: "Supabase Scheduled Functions staging";
  writeMode: "No verify-route deletion write";
}

export const ACCOUNT_DELETION_CRON_DRY_RUN_PACKET: AccountDeletionCronDryRunPacket = {
  body: {
    dry_run: true,
    limit: 20,
  },
  endpointPath: "/functions/v1/process-account-deletions",
  expectedResponseKeys: [
    "dryRun",
    "processedCount",
    "failedCount",
    "storageBuckets",
    "wouldProcess",
  ],
  method: "POST",
  redactedHeaders: [
    {
      name: "Authorization",
      value: "Bearer $ACCOUNT_DELETION_PROCESSOR_SECRET",
    },
    {
      name: "x-account-deletion-secret",
      value: "$ACCOUNT_DELETION_PROCESSOR_SECRET",
    },
  ],
  scheduleHint: "Run from Supabase Scheduled Functions or a trusted external cron runner.",
  writesEnabled: false,
};

const ACCOUNT_DELETION_STORAGE_BUCKETS = [
  "game-saves",
  "avatars",
  "profile-banners",
  "profile-showcases",
  "screenshots",
  "game-artwork",
];

export function getAccountDeletionProcessorReadiness(input: {
  latestRequest: AccountDeletionRequest | null;
  loadError?: string | null;
}): AccountDeletionProcessorReadiness {
  const checks: PrivacyReadinessCheck[] = [
    queueReadCheck(input.loadError),
    deletionRequestCheck(input.latestRequest, input.loadError),
    holdWindowCheck(input.latestRequest, input.loadError),
    {
      detail:
        "Trusted processor requires ACCOUNT_DELETION_PROCESSOR_SECRET via bearer or x-account-deletion-secret header.",
      label: "Processor secret",
      status: "pass",
    },
    {
      detail:
        "process-account-deletions supports a secret-gated dry_run payload before destructive auth deletion.",
      label: "Dry-run contract",
      status: "pass",
    },
    {
      detail:
        "Sanitized POST packet is staged with dry_run: true, limit 20, and redacted secret headers.",
      label: "Cron dry-run packet",
      status: "pass",
    },
    {
      detail:
        "Hosted staging proof is rendered from a sanitized dry-run fixture and does not perform deletes.",
      label: "Hosted staging proof",
      status: "pass",
    },
    {
      detail:
        "Final verification still needs Supabase Scheduled Functions or an external cron runner against staging secrets.",
      label: "Hosted cron",
      status: "warning",
    },
  ];
  const passedCount = checks.filter((check) => check.status === "pass").length;
  const warningCount = checks.filter((check) => check.status === "warning").length;
  const blockedCount = checks.filter((check) => check.status === "blocked").length;
  const statusLabel =
    blockedCount > 0 ? "Blocked" : warningCount > 0 ? "Needs hosted cron" : "Ready";
  const summary =
    statusLabel === "Blocked"
      ? "Account deletion staging is blocked until the queue can be read."
      : statusLabel === "Ready"
        ? "Deletion request, processor secret, and hosted schedule evidence are present."
        : "Local deletion processor evidence is present; a real hosted cron run is still required.";

  return {
    blockedCount,
    checks,
    cronDryRunPacket: ACCOUNT_DELETION_CRON_DRY_RUN_PACKET,
    hostedCronStagingProof: buildHostedCronStagingProof(input.latestRequest),
    passedCount,
    statusLabel,
    summary,
    warningCount,
  };
}

function buildHostedCronStagingProof(
  latestRequest: AccountDeletionRequest | null,
): AccountDeletionHostedCronStagingProof {
  const wouldProcess =
    latestRequest?.status === "pending"
      ? [
          {
            id: "account-deletion-request-redacted",
            scheduledAt: latestRequest.scheduled_at,
            userId: "user-id-redacted",
          },
        ]
      : [];

  return {
    evidenceTable: "account_deletion_processor_runs",
    endpointPath: ACCOUNT_DELETION_CRON_DRY_RUN_PACKET.endpointPath,
    expectedDryRunResponse: {
      dryRun: true,
      evidenceRecorded: true,
      failedCount: 0,
      limit: ACCOUNT_DELETION_CRON_DRY_RUN_PACKET.body.limit,
      processedCount: 0,
      runId: "account-deletion-fixture",
      storageBuckets: [...ACCOUNT_DELETION_STORAGE_BUCKETS],
      triggerSource: "hosted_deploy_gate",
      wouldProcess,
    },
    functionName: "process-account-deletions",
    guardCopy:
      "Hosted cron staging proof reviews a sanitized dry_run fixture and account_deletion_processor_runs aggregates only; it does not expose secret values, auth user payloads, storage object paths, request IDs, user IDs, or request metadata.",
    guards: [
      "No processor secret value",
      "No raw request id",
      "No raw user id",
      "No auth user deletion",
      "No storage deletion",
      "No request metadata payload",
      "No hosted cron success claim",
    ],
    rows: [
      {
        detail:
          "Bearer or x-account-deletion-secret headers are required; the UI keeps them redacted as placeholders.",
        id: "secret-gated-caller",
        label: "Secret-gated caller",
        status: "pass",
      },
      {
        detail:
          "Expected dry_run response keeps processedCount 0 and failedCount 0 before destructive deletion is enabled.",
        id: "dry-run-response-shape",
        label: "Dry-run response shape",
        status: "pass",
      },
      {
        detail:
          "account_deletion_processor_runs stores run_id, trigger_source, dry_run, status, and aggregate counts only.",
        id: "run-evidence-table",
        label: "Run evidence table",
        status: "pass",
      },
      {
        detail: `Bucket manifest is reviewed without object keys: ${ACCOUNT_DELETION_STORAGE_BUCKETS.join(
          ", ",
        )}.`,
        id: "storage-bucket-manifest",
        label: "Storage bucket manifest",
        status: "pass",
      },
      {
        detail:
          "The verification route renders this fixture without invoking Supabase Edge Functions, deleting auth users, or removing storage.",
        id: "no-write-verify-route",
        label: "No-write verify route",
        status: "pass",
      },
      {
        detail:
          "A fresh staging run from Supabase Scheduled Functions or a trusted external scheduler is still required.",
        id: "trusted-staging-run",
        label: "Trusted staging run",
        status: "warning",
      },
    ],
    latestRunId: "account-deletion-fixture",
    triggerSource: "staging-cron-fixture",
    workflow: "Supabase Scheduled Functions staging",
    writeMode: "No verify-route deletion write",
  };
}

function queueReadCheck(loadError?: string | null): PrivacyReadinessCheck {
  if (loadError) {
    return {
      detail: `Deletion queue read failed: ${loadError}`,
      label: "Queue read",
      status: "blocked",
    };
  }

  return {
    detail: "Signed-in user can read the latest account_deletion_requests row.",
    label: "Queue read",
    status: "pass",
  };
}

function deletionRequestCheck(
  latestRequest: AccountDeletionRequest | null,
  loadError?: string | null,
): PrivacyReadinessCheck {
  if (loadError) {
    return {
      detail: "Deletion request state is unavailable until the queue read succeeds.",
      label: "Deletion request",
      status: "blocked",
    };
  }
  if (!latestRequest) {
    return {
      detail: "No deletion request is currently queued for this account.",
      label: "Deletion request",
      status: "warning",
    };
  }
  if (latestRequest.status === "failed") {
    return {
      detail:
        latestRequest.error_message ?? "Latest deletion request failed and needs operator review.",
      label: "Deletion request",
      status: "warning",
    };
  }
  if (latestRequest.status === "pending") {
    return {
      detail: `Request ${latestRequest.id.slice(0, 8)} is pending processor execution.`,
      label: "Deletion request",
      status: "pass",
    };
  }

  return {
    detail: `Latest deletion request is ${latestRequest.status}.`,
    label: "Deletion request",
    status: "pass",
  };
}

function holdWindowCheck(
  latestRequest: AccountDeletionRequest | null,
  loadError?: string | null,
): PrivacyReadinessCheck {
  if (loadError) {
    return {
      detail: "30-day hold cannot be checked until the queue read succeeds.",
      label: "30-day hold",
      status: "blocked",
    };
  }
  if (!latestRequest || latestRequest.status !== "pending") {
    return {
      detail: "Create a pending request to verify the scheduled_at hold window.",
      label: "30-day hold",
      status: "warning",
    };
  }

  const requestedAt = new Date(latestRequest.requested_at).getTime();
  const scheduledAt = new Date(latestRequest.scheduled_at).getTime();
  if (!Number.isFinite(requestedAt) || !Number.isFinite(scheduledAt)) {
    return {
      detail: "Deletion request has invalid requested_at or scheduled_at timestamps.",
      label: "30-day hold",
      status: "blocked",
    };
  }

  const holdDays = Math.round((scheduledAt - requestedAt) / 86_400_000);
  return {
    detail: `Request is scheduled after ${holdDays} days.`,
    label: "30-day hold",
    status: holdDays >= 30 ? "pass" : "blocked",
  };
}
