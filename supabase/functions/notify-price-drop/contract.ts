export type ScanRequest = {
  alertIds: string[];
  dryRun: boolean;
  limit: number;
  productIds: string[];
  triggerSource: PriceDropTriggerSource;
  userIds: string[];
};

export type PriceDropTriggerSource =
  | "manual"
  | "scheduled"
  | "hosted_deploy_gate";

export type PriceDropNotificationRunStatus = "dry_run" | "completed" | "failed";

export type PriceDropNotificationRunEvidenceInput = {
  alertsMarkedCount: number;
  candidateCount: number;
  completedAt: string;
  dryRun: boolean;
  limit: number;
  notificationsRecordedCount: number;
  requestedAlertCount: number;
  requestedProductCount: number;
  requestedUserCount: number;
  runId: string;
  scannedCount: number;
  skipped: Record<string, number>;
  startedAt: string;
  status?: PriceDropNotificationRunStatus;
  triggerSource: PriceDropTriggerSource;
};

export type PriceDropNotificationRunEvidenceRecord = {
  alerts_marked_count: number;
  candidate_count: number;
  completed_at: string;
  dry_run: boolean;
  limit_count: number;
  notifications_recorded_count: number;
  requested_alert_count: number;
  requested_product_count: number;
  requested_user_count: number;
  run_id: string;
  scanned_count: number;
  skipped_summary: Record<string, number>;
  started_at: string;
  status: PriceDropNotificationRunStatus;
  trigger_source: PriceDropTriggerSource;
};

export type PriceDropSecretVerification =
  | {
    mode: "authorization_bearer" | "x_price_drop_secret";
    status: "ok";
  }
  | {
    error: string;
    status: "error";
    statusCode: 401;
  };

export const PRICE_DROP_NOTIFY_DEFAULT_LIMIT = 500;
export const PRICE_DROP_NOTIFY_MAX_LIMIT = 5000;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const triggerSources: PriceDropTriggerSource[] = [
  "manual",
  "scheduled",
  "hosted_deploy_gate",
];

export function verifyPriceDropNotifySecret(
  request: Request,
  expectedSecret: string,
): PriceDropSecretVerification {
  const normalizedExpectedSecret = expectedSecret.trim();
  const authHeader = request.headers.get("Authorization")?.trim();
  const bearerSecret = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const headerSecret = request.headers.get("x-price-drop-secret")?.trim();

  if (normalizedExpectedSecret && bearerSecret === normalizedExpectedSecret) {
    return { mode: "authorization_bearer", status: "ok" };
  }

  if (normalizedExpectedSecret && headerSecret === normalizedExpectedSecret) {
    return { mode: "x_price_drop_secret", status: "ok" };
  }

  return {
    error: "Unauthorized price-drop notification request.",
    status: "error",
    statusCode: 401,
  };
}

export async function parsePriceDropScanRequest(
  request: Request,
): Promise<ScanRequest> {
  const body = await request.json().catch(() => ({}));
  const record = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};

  return {
    alertIds: readUuidArray(record, "alert_ids", "alertIds"),
    dryRun: readBoolean(record, "dry_run", "dryRun"),
    limit: readLimit(record),
    productIds: readUuidArray(record, "product_ids", "productIds"),
    triggerSource: normalizeTriggerSource(
      readString(record, "trigger_source", "triggerSource"),
    ) ?? "manual",
    userIds: readUuidArray(record, "user_ids", "userIds"),
  };
}

export function buildPriceDropNotificationRunEvidence(
  input: PriceDropNotificationRunEvidenceInput,
): PriceDropNotificationRunEvidenceRecord {
  const runId = input.runId.trim();
  if (!runId) {
    throw new Error("Price-drop run evidence requires a runId.");
  }

  const evidence = {
    alerts_marked_count: nonNegativeInteger(input.alertsMarkedCount),
    candidate_count: nonNegativeInteger(input.candidateCount),
    completed_at: input.completedAt,
    dry_run: input.dryRun,
    limit_count: nonNegativeInteger(input.limit),
    notifications_recorded_count: nonNegativeInteger(
      input.notificationsRecordedCount,
    ),
    requested_alert_count: nonNegativeInteger(input.requestedAlertCount),
    requested_product_count: nonNegativeInteger(input.requestedProductCount),
    requested_user_count: nonNegativeInteger(input.requestedUserCount),
    run_id: runId,
    scanned_count: nonNegativeInteger(input.scannedCount),
    skipped_summary: sanitizeSkippedSummary(input.skipped),
    started_at: input.startedAt,
    status: input.status ?? (input.dryRun ? "dry_run" : "completed"),
    trigger_source: input.triggerSource,
  };

  assertPriceDropNotificationRunEvidence(evidence);
  return evidence;
}

function assertPriceDropNotificationRunEvidence(
  evidence: PriceDropNotificationRunEvidenceRecord,
) {
  if (evidence.dry_run !== (evidence.status === "dry_run")) {
    throw new Error("Invalid price-drop run evidence.");
  }

  if (evidence.status === "failed") {
    return;
  }

  if (evidence.dry_run) {
    if (
      evidence.notifications_recorded_count !== 0 ||
      evidence.alerts_marked_count !== 0
    ) {
      throw new Error("Invalid price-drop run evidence.");
    }
    return;
  }

  if (evidence.scanned_count > evidence.limit_count) {
    throw new Error("Invalid price-drop run evidence.");
  }

  if (evidence.candidate_count > evidence.scanned_count) {
    throw new Error("Invalid price-drop run evidence.");
  }

  const expectedSkippedCount = evidence.dry_run
    ? evidence.scanned_count - evidence.candidate_count
    : evidence.scanned_count - evidence.notifications_recorded_count;
  if (sumSkippedSummary(evidence.skipped_summary) !== expectedSkippedCount) {
    throw new Error("Invalid price-drop run evidence.");
  }

  if (
    evidence.alerts_marked_count !== evidence.notifications_recorded_count ||
    evidence.notifications_recorded_count > evidence.candidate_count
  ) {
    throw new Error("Invalid price-drop run evidence.");
  }

  if ((evidence.skipped_summary.inactive ?? 0) !== 0) {
    throw new Error("Invalid price-drop run evidence.");
  }
}

function sumSkippedSummary(summary: Record<string, number>) {
  return Object.values(summary).reduce((total, count) => total + count, 0);
}

function readBoolean(
  body: Record<string, unknown>,
  ...keys: string[]
): boolean {
  return keys.some((key) => {
    const value = body[key];
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value !== "string") {
      return false;
    }

    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  });
}

function readLimit(body: Record<string, unknown>): number {
  const rawLimit = body.limit;
  const parsed = typeof rawLimit === "number"
    ? rawLimit
    : Number.parseInt(String(rawLimit ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return PRICE_DROP_NOTIFY_DEFAULT_LIMIT;
  }

  return Math.min(Math.trunc(parsed), PRICE_DROP_NOTIFY_MAX_LIMIT);
}

function readString(body: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function normalizeTriggerSource(
  value: string | null,
): PriceDropTriggerSource | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase().replaceAll("-", "_");
  return triggerSources.includes(normalized as PriceDropTriggerSource)
    ? (normalized as PriceDropTriggerSource)
    : null;
}

function readUuidArray(
  body: Record<string, unknown>,
  snakeKey: string,
  camelKey: string,
): string[] {
  const value = body[snakeKey] ?? body[camelKey];
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter(
          (item): item is string =>
            typeof item === "string" && uuidPattern.test(item.trim()),
        )
        .map((item) => item.trim()),
    ),
  );
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

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}
