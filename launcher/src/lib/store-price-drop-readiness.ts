export type StorePriceDropReadinessStatus = "pass" | "warning" | "blocked";

export interface StorePriceDropReadinessCheck {
  detail: string;
  label: string;
  status: StorePriceDropReadinessStatus;
}

export interface StorePriceDropHostedRunEvidence {
  alertsMarkedCount: number;
  candidateCount: number;
  completedAt: string | null;
  dryRun: boolean;
  limit: number;
  notificationsRecordedCount: number;
  requestedAlertCount: number;
  requestedProductCount: number;
  requestedUserCount: number;
  runId: string;
  scannedCount: number;
  status: string;
  triggerSource: string;
}

export interface StorePriceDropHostedProofRow {
  detail: string;
  id: string;
  label: string;
  status: StorePriceDropReadinessStatus;
}

export interface StorePriceDropHostedSchedulerProof {
  guardCopy: string;
  guards: string[];
  latestRunId: string;
  rows: StorePriceDropHostedProofRow[];
  triggerSource: string;
  writeMode: "No verify-route notification write";
}

export interface StorePriceDropSchedulerReadiness {
  activeAlertCount: number;
  blockedCount: number;
  checks: StorePriceDropReadinessCheck[];
  dryRunPayload: string;
  hostedProof: StorePriceDropHostedSchedulerProof;
  localAlertCount: number;
  passedCount: number;
  progress: number;
  remoteAlertCount: number;
  statusLabel: "Ready" | "Needs hosted cron" | "Needs synced alerts" | "Blocked";
  summary: string;
  warningCount: number;
}

function normalizeCount(value: number) {
  return Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0));
}

export function getStorePriceDropSchedulerReadiness(input: {
  hostedRunEvidence?: StorePriceDropHostedRunEvidence | null;
  localAlertCount: number;
  remoteAlertCount: number;
  isSignedIn: boolean;
  trustedEvidence?: boolean;
}): StorePriceDropSchedulerReadiness {
  const localAlertCount = normalizeCount(input.localAlertCount);
  const remoteAlertCount = normalizeCount(input.remoteAlertCount);
  const hasTrustedEvidence = Boolean(input.trustedEvidence);
  const hasRemoteAlerts = input.isSignedIn && remoteAlertCount > 0;
  const hasLocalOnlyAlerts = localAlertCount > 0 && remoteAlertCount === 0;
  const checks: StorePriceDropReadinessCheck[] = [
    {
      detail: "notify-price-drop Edge Function scans active store_price_alerts and can dry-run.",
      label: "Edge function",
      status: "pass",
    },
    {
      detail:
        "Function accepts Authorization bearer or x-price-drop-secret; secret is never shown in UI.",
      label: "Secret gate",
      status: "pass",
    },
    {
      detail: "Local Supabase config allows trusted cron calls with verify_jwt = false.",
      label: "Cron config",
      status: "pass",
    },
    {
      detail:
        remoteAlertCount > 0
          ? `${remoteAlertCount} synced store_price_alert row(s) are staged for notification checks.`
          : localAlertCount > 0
            ? `${localAlertCount} local alert(s) exist, but cron needs synced UUID store_price_alert rows.`
            : "No remote price alerts are staged yet; create and sync an alert to exercise dry-run output.",
      label: "Alert queue",
      status: hasRemoteAlerts ? "pass" : "warning",
    },
    {
      detail: !input.isSignedIn
        ? "Browser/local state is visible, but remote store_price_alerts sync needs sign-in."
        : hasLocalOnlyAlerts
          ? "Signed-in session is present, but current alerts have no remote scheduler rows yet."
          : "Signed-in store state can sync alerts to store_price_alerts.",
      label: "Remote sync",
      status: input.isSignedIn && !hasLocalOnlyAlerts ? "pass" : "warning",
    },
    {
      detail: 'Staging should call notify-price-drop with {"dryRun":true} before enabling writes.',
      label: "Dry-run payload",
      status: "pass",
    },
    {
      detail: hasTrustedEvidence
        ? "Latest store_price_drop_notification_runs row proves a fresh scheduled notify-price-drop run."
        : "Supabase Scheduled Functions or trusted external cron still need live staging evidence.",
      label: "Hosted cron",
      status: hasTrustedEvidence ? "pass" : "warning",
    },
  ];
  const passedCount = checks.filter((check) => check.status === "pass").length;
  const warningCount = checks.filter((check) => check.status === "warning").length;
  const blockedCount = checks.filter((check) => check.status === "blocked").length;
  const progress = Math.round((passedCount / checks.length) * 100);
  const statusLabel =
    blockedCount > 0
      ? "Blocked"
      : warningCount > 0
        ? hasTrustedEvidence
          ? "Needs synced alerts"
          : "Needs hosted cron"
        : "Ready";

  return {
    activeAlertCount: remoteAlertCount,
    blockedCount,
    checks,
    dryRunPayload: '{"dryRun":true}',
    hostedProof: buildHostedSchedulerProof({
      evidence: input.hostedRunEvidence ?? null,
      trustedEvidence: hasTrustedEvidence,
    }),
    localAlertCount,
    passedCount,
    progress,
    remoteAlertCount,
    statusLabel,
    summary:
      statusLabel === "Ready"
        ? "Price-drop scheduling has hosted evidence."
        : hasTrustedEvidence
          ? "Price-drop cron has trusted scheduler evidence; synced alert coverage still needs review."
          : hasLocalOnlyAlerts
            ? "Local price alerts are visible; scheduler readiness still needs synced remote rows and hosted cron staging."
            : "Price-drop notifications are locally wired; hosted cron staging remains open.",
    warningCount,
  };
}

function buildHostedSchedulerProof(input: {
  evidence: StorePriceDropHostedRunEvidence | null;
  trustedEvidence: boolean;
}): StorePriceDropHostedSchedulerProof {
  const evidence = input.evidence;
  const hasEvidence = Boolean(evidence);
  const trustedScheduledRun = input.trustedEvidence && hasEvidence;

  return {
    guardCopy:
      "Hosted scheduler proof reviews sanitized store_price_drop_notification_runs aggregates only; it does not expose PRICE_DROP_NOTIFY_SECRET, user emails, product titles, or notification payload bodies.",
    guards: [
      "No PRICE_DROP_NOTIFY_SECRET",
      "No notification body",
      "No user email",
      "No verify-route notification write",
      "No hosted cron success claim without trusted row",
    ],
    latestRunId: evidence?.runId ?? "none",
    rows: [
      {
        detail:
          "notify-price-drop accepts only trusted bearer/header secret calls and clamps dry-run scan limits before scheduler writes.",
        id: "secret-gate",
        label: "Secret-gated caller",
        status: "pass",
      },
      {
        detail: evidence
          ? `Run ${evidence.runId} / ${evidence.triggerSource} / ${evidence.status} / dryRun ${String(
              evidence.dryRun,
            )}.`
          : "No sanitized store_price_drop_notification_runs row is available yet.",
        id: "run-evidence",
        label: "Run evidence row",
        status: hasEvidence ? "pass" : "warning",
      },
      {
        detail: evidence
          ? `${evidence.scannedCount} scanned, ${evidence.candidateCount} candidates, ${evidence.notificationsRecordedCount} notifications recorded, ${evidence.alertsMarkedCount} alerts marked.`
          : "Counts will stay zero until a dry-run or scheduled run writes aggregate evidence.",
        id: "aggregate-counts",
        label: "Aggregate counts only",
        status: hasEvidence ? "pass" : "warning",
      },
      {
        detail: trustedScheduledRun
          ? "Fresh scheduled non-dry-run evidence is present within the trust window."
          : "Needs a fresh scheduled non-dry-run row before hosted cron can be treated as proven.",
        id: "trusted-scheduled-row",
        label: "Trusted scheduled row",
        status: trustedScheduledRun ? "pass" : "warning",
      },
      {
        detail:
          "Verify route may show a deterministic proof packet without marking alerts, recording notifications, or mutating Supabase.",
        id: "no-write-verify",
        label: "No-write verify route",
        status: "pass",
      },
    ],
    triggerSource: evidence?.triggerSource ?? "none",
    writeMode: "No verify-route notification write",
  };
}
