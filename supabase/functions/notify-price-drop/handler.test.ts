import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import type { PriceDropSecretVerification } from "./contract.ts";
import {
  handleNotifyPriceDrop,
  type NotifyPriceDropHandlerDeps,
} from "./handler.ts";
import type { PriceDropCandidate, StorePriceAlertRow } from "./price-alerts.ts";

const productId = "22222222-2222-4222-8222-222222222222";
const alertId = "11111111-1111-4111-8111-111111111111";
const userId = "33333333-3333-4333-8333-333333333333";

Deno.test("notify price-drop handler answers CORS and method guards without dependencies", async () => {
  const deps = stubDeps({
    verifySecret: () => {
      throw new Error("secret should not be read");
    },
  });

  const optionsResponse = await handleNotifyPriceDrop(
    new Request("https://functions.example/notify-price-drop", {
      method: "OPTIONS",
    }),
    deps,
  );
  assertEquals(optionsResponse.status, 200);
  assertEquals(optionsResponse.headers.get("Access-Control-Allow-Origin"), "*");

  const getResponse = await handleNotifyPriceDrop(
    new Request("https://functions.example/notify-price-drop", {
      method: "GET",
    }),
    deps,
  );
  assertEquals(getResponse.status, 405);
  assertEquals(await getResponse.json(), { error: "Method not allowed." });
});

Deno.test("notify price-drop handler rejects unauthorized before database access", async () => {
  let loadCalls = 0;
  let runIdCalls = 0;
  const response = await handleNotifyPriceDrop(
    jsonRequest({ dryRun: true }),
    stubDeps({
      createRunId: () => {
        runIdCalls += 1;
        return "run-should-not-be-created";
      },
      loadActiveAlerts: async () => {
        loadCalls += 1;
        return [];
      },
      verifySecret: () => ({
        error: "Unauthorized price-drop notification request.",
        status: "error",
        statusCode: 401,
      }),
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(await response.json(), {
    error: "Unauthorized price-drop notification request.",
  });
  assertEquals(loadCalls, 0);
  assertEquals(runIdCalls, 0);
});

Deno.test("notify price-drop handler dry-run records sanitized evidence without notifications", async () => {
  const evidenceRecords: unknown[] = [];
  let notificationCalls = 0;
  let scanLimit = 0;
  const response = await handleNotifyPriceDrop(
    jsonRequest({
      dryRun: true,
      limit: 1,
      triggerSource: "scheduled",
    }),
    stubDeps({
      loadActiveAlerts: async (scanRequest) => {
        scanLimit = scanRequest.limit;
        return [alertRow()];
      },
      recordNotifications: async () => {
        notificationCalls += 1;
        return { alertsMarked: 99, notificationsRecorded: 99 };
      },
      recordPriceDropNotificationRun: async (evidence) => {
        evidenceRecords.push(evidence);
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    alertsMarked: 0,
    candidates: [
      {
        alertId,
        currentPriceCents: 1500,
        discountPercent: 25,
        productId,
        productTitle: "Mock Game",
        targetPriceCents: 1500,
        userId,
      },
    ],
    candidateCount: 1,
    deliveryMode: "dry_run",
    dryRun: true,
    evidenceRecorded: true,
    limit: 1,
    notificationsRecorded: 0,
    runId: "price-drop-run-1",
    scanned: 1,
    skipped: {
      already_notified: 0,
      inactive: 0,
      invalid_product: 0,
      invalid_target: 0,
      not_met: 0,
      unpublished_product: 0,
    },
    triggerSource: "scheduled",
  });
  assertEquals(scanLimit, 1);
  assertEquals(notificationCalls, 0);
  assertEquals(evidenceRecords, [
    {
      alerts_marked_count: 0,
      candidate_count: 1,
      completed_at: "2026-06-15T12:00:02.000Z",
      dry_run: true,
      limit_count: 1,
      notifications_recorded_count: 0,
      requested_alert_count: 0,
      requested_product_count: 0,
      requested_user_count: 0,
      run_id: "price-drop-run-1",
      scanned_count: 1,
      skipped_summary: {
        already_notified: 0,
        inactive: 0,
        invalid_product: 0,
        invalid_target: 0,
        not_met: 0,
        unpublished_product: 0,
      },
      started_at: "2026-06-15T12:00:00.000Z",
      status: "dry_run",
      trigger_source: "scheduled",
    },
  ]);
});

Deno.test("notify price-drop handler live run records notifications and evidence", async () => {
  let notifiedAt = "";
  const evidenceRecords: unknown[] = [];
  const response = await handleNotifyPriceDrop(
    jsonRequest({ triggerSource: "hosted_deploy_gate" }),
    stubDeps({
      loadActiveAlerts: async () => [alertRow()],
      recordNotifications: async (candidates, at) => {
        notifiedAt = at;
        assertEquals(candidates.length, 1);
        return { alertsMarked: 1, notificationsRecorded: 1 };
      },
      recordPriceDropNotificationRun: async (evidence) => {
        evidenceRecords.push(evidence);
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(notifiedAt, "2026-06-15T12:00:01.000Z");
  assertEquals((await response.json()).deliveryMode, "user_notifications");
  assertEquals(evidenceRecords[0], {
    alerts_marked_count: 1,
    candidate_count: 1,
    completed_at: "2026-06-15T12:00:02.000Z",
    dry_run: false,
    limit_count: 500,
    notifications_recorded_count: 1,
    requested_alert_count: 0,
    requested_product_count: 0,
    requested_user_count: 0,
    run_id: "price-drop-run-1",
    scanned_count: 1,
    skipped_summary: {
      already_notified: 0,
      inactive: 0,
      invalid_product: 0,
      invalid_target: 0,
      not_met: 0,
      unpublished_product: 0,
    },
    started_at: "2026-06-15T12:00:00.000Z",
    status: "completed",
    trigger_source: "hosted_deploy_gate",
  });
});

Deno.test("notify price-drop handler records stale concurrent claims without failing", async () => {
  const evidenceRecords: unknown[] = [];
  const response = await handleNotifyPriceDrop(
    jsonRequest({ triggerSource: "scheduled" }),
    stubDeps({
      loadActiveAlerts: async () => [alertRow()],
      recordNotifications: async () => ({
        alertsMarked: 0,
        notificationsRecorded: 0,
      }),
      recordPriceDropNotificationRun: async (evidence) => {
        evidenceRecords.push(evidence);
      },
    }),
  );

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.candidateCount, 1);
  assertEquals(body.notificationsRecorded, 0);
  assertEquals(body.skipped.delivery_claim_lost, 1);
  assertEquals(evidenceRecords[0], {
    alerts_marked_count: 0,
    candidate_count: 1,
    completed_at: "2026-06-15T12:00:02.000Z",
    dry_run: false,
    limit_count: 500,
    notifications_recorded_count: 0,
    requested_alert_count: 0,
    requested_product_count: 0,
    requested_user_count: 0,
    run_id: "price-drop-run-1",
    scanned_count: 1,
    skipped_summary: {
      already_notified: 0,
      delivery_claim_lost: 1,
      inactive: 0,
      invalid_product: 0,
      invalid_target: 0,
      not_met: 0,
      unpublished_product: 0,
    },
    started_at: "2026-06-15T12:00:00.000Z",
    status: "completed",
    trigger_source: "scheduled",
  });
});

Deno.test("notify price-drop handler limits returned candidate summaries", async () => {
  const response = await handleNotifyPriceDrop(
    jsonRequest({ dryRun: true }),
    stubDeps({
      loadActiveAlerts: async () =>
        Array.from({ length: 55 }, (_, index) =>
          alertRow({
            id: `alert-${index}`,
            product: {
              discount_percent: 50,
              id: `product-${index}`,
              price_cents: 2000,
              slug: `mock-game-${index}`,
              status: "published",
              title: `Mock Game ${index}`,
              updated_at: "2026-06-10T10:00:00.000Z",
            },
            product_id: `product-${index}`,
            target_price_cents: 1000,
            user_id: `user-${index}`,
          })),
    }),
  );

  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(body.candidateCount, 55);
  assertEquals(body.candidates.length, 50);
  assertEquals(body.candidates[49].productTitle, "Mock Game 49");
});

Deno.test("notify price-drop handler maps dependency errors to 500", async () => {
  const errors: unknown[] = [];
  let evidenceCalls = 0;
  const response = await handleNotifyPriceDrop(
    jsonRequest({ dryRun: true }),
    stubDeps({
      loadActiveAlerts: async () => {
        throw new Error("read failed");
      },
      logError: (_message, error) => {
        errors.push(error);
      },
      recordPriceDropNotificationRun: async () => {
        evidenceCalls += 1;
      },
    }),
  );

  assertEquals(response.status, 500);
  assertEquals(await response.json(), { error: "read failed" });
  assertEquals(errors.length, 1);
  assertEquals(evidenceCalls, 0);
});

function jsonRequest(body: Record<string, unknown>) {
  return new Request("https://functions.example/notify-price-drop", {
    body: JSON.stringify(body),
    headers: {
      Authorization: "Bearer test-secret",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

function alertRow(
  overrides: Partial<StorePriceAlertRow> = {},
): StorePriceAlertRow {
  return {
    id: alertId,
    is_active: true,
    last_notified_at: null,
    product: {
      discount_percent: 25,
      id: productId,
      price_cents: 2000,
      slug: "mock-game",
      status: "published",
      title: "Mock Game",
      updated_at: "2026-06-10T10:00:00.000Z",
    },
    product_id: productId,
    target_price_cents: 1500,
    updated_at: "2026-06-10T09:00:00.000Z",
    user_id: userId,
    ...overrides,
  };
}

function okSecret(): PriceDropSecretVerification {
  return { mode: "authorization_bearer", status: "ok" };
}

function stubDeps(
  overrides: Partial<NotifyPriceDropHandlerDeps> = {},
): NotifyPriceDropHandlerDeps {
  let nowIndex = 0;
  const dates = [
    "2026-06-15T12:00:00.000Z",
    "2026-06-15T12:00:01.000Z",
    "2026-06-15T12:00:02.000Z",
  ];

  return {
    createRunId: () => "price-drop-run-1",
    loadActiveAlerts: async () => [],
    logError: () => {},
    now: () => new Date(dates[Math.min(nowIndex++, dates.length - 1)]),
    recordNotifications: async (
      candidates: PriceDropCandidate[],
    ) => ({
      alertsMarked: candidates.length,
      notificationsRecorded: candidates.length,
    }),
    recordPriceDropNotificationRun: async () => {},
    verifySecret: () => okSecret(),
    ...overrides,
  };
}
