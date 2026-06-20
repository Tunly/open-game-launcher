import { corsHeaders } from "../_shared/cors.ts";
import {
  buildPriceDropNotificationRunEvidence,
  parsePriceDropScanRequest,
  type PriceDropNotificationRunEvidenceRecord,
  type PriceDropSecretVerification,
  type ScanRequest,
} from "./contract.ts";
import {
  findTriggeredPriceAlerts,
  type PriceDropCandidate,
  type StorePriceAlertRow,
} from "./price-alerts.ts";

export type NotifyPriceDropWriteResult = {
  alertsMarked: number;
  notificationsRecorded: number;
};

export interface NotifyPriceDropHandlerDeps {
  createRunId?: () => string;
  loadActiveAlerts: (scanRequest: ScanRequest) => Promise<StorePriceAlertRow[]>;
  logError?: (message: string, error: unknown) => void;
  now?: () => Date;
  recordNotifications: (
    candidates: PriceDropCandidate[],
    notifiedAt: string,
  ) => Promise<NotifyPriceDropWriteResult>;
  recordPriceDropNotificationRun: (
    evidence: PriceDropNotificationRunEvidenceRecord,
  ) => Promise<void>;
  verifySecret: (request: Request) => PriceDropSecretVerification;
}

const MAX_RETURNED_CANDIDATES = 50;

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function nowIso(deps: NotifyPriceDropHandlerDeps): string {
  return (deps.now?.() ?? new Date()).toISOString();
}

function summarizeCandidate(candidate: PriceDropCandidate) {
  return {
    alertId: candidate.alertId,
    currentPriceCents: candidate.currentPriceCents,
    discountPercent: candidate.discountPercent,
    productId: candidate.productId,
    productTitle: candidate.productTitle,
    targetPriceCents: candidate.targetPriceCents,
    userId: candidate.userId,
  };
}

export async function handleNotifyPriceDrop(
  request: Request,
  deps: NotifyPriceDropHandlerDeps,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const verification = deps.verifySecret(request);
    if (verification.status === "error") {
      return jsonResponse(
        { error: verification.error },
        verification.statusCode,
      );
    }

    const scanRequest = await parsePriceDropScanRequest(request);
    const runId = deps.createRunId?.() ?? crypto.randomUUID();
    const startedAt = nowIso(deps);
    const alerts = await deps.loadActiveAlerts(scanRequest);
    const result = findTriggeredPriceAlerts(alerts);
    const notifiedAt = nowIso(deps);
    const writeResult = scanRequest.dryRun
      ? { alertsMarked: 0, notificationsRecorded: 0 }
      : await deps.recordNotifications(result.candidates, notifiedAt);
    const evidence = buildPriceDropNotificationRunEvidence({
      alertsMarkedCount: writeResult.alertsMarked,
      candidateCount: result.candidates.length,
      completedAt: nowIso(deps),
      dryRun: scanRequest.dryRun,
      limit: scanRequest.limit,
      notificationsRecordedCount: writeResult.notificationsRecorded,
      requestedAlertCount: scanRequest.alertIds.length,
      requestedProductCount: scanRequest.productIds.length,
      requestedUserCount: scanRequest.userIds.length,
      runId,
      scannedCount: result.scanned,
      skipped: result.skipped,
      startedAt,
      triggerSource: scanRequest.triggerSource,
    });
    await deps.recordPriceDropNotificationRun(evidence);

    return jsonResponse({
      alertsMarked: writeResult.alertsMarked,
      candidates: result.candidates
        .slice(0, MAX_RETURNED_CANDIDATES)
        .map(summarizeCandidate),
      candidateCount: result.candidates.length,
      deliveryMode: scanRequest.dryRun ? "dry_run" : "user_notifications",
      dryRun: scanRequest.dryRun,
      evidenceRecorded: true,
      limit: scanRequest.limit,
      notificationsRecorded: writeResult.notificationsRecorded,
      runId: evidence.run_id,
      scanned: result.scanned,
      skipped: result.skipped,
      triggerSource: evidence.trigger_source,
    });
  } catch (error) {
    if (deps.logError) {
      deps.logError("Notify price drop error:", error);
    } else {
      console.error("Notify price drop error:", error);
    }
    return jsonResponse(
      {
        error: error instanceof Error
          ? error.message
          : "Price-drop notification scan failed.",
      },
      500,
    );
  }
}
