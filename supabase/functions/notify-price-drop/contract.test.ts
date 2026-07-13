import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  buildPriceDropNotificationRunEvidence,
  parsePriceDropScanRequest,
  verifyPriceDropNotifySecret,
} from "./contract.ts";

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request(
    "https://og-launcher.example/functions/v1/notify-price-drop",
    {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", ...headers },
      method: "POST",
    },
  );
}

function makeEvidenceInput(
  overrides: Partial<
    Parameters<typeof buildPriceDropNotificationRunEvidence>[0]
  > = {},
): Parameters<typeof buildPriceDropNotificationRunEvidence>[0] {
  return {
    alertsMarkedCount: 3,
    candidateCount: 3,
    completedAt: "2026-06-14T14:01:00.000Z",
    dryRun: false,
    limit: 100,
    notificationsRecordedCount: 3,
    requestedAlertCount: 1,
    requestedProductCount: 2,
    requestedUserCount: 0,
    runId: "price-drop-run-1",
    scannedCount: 10,
    skipped: {
      already_notified: 3,
      not_met: 4,
    },
    startedAt: "2026-06-14T14:00:00.000Z",
    triggerSource: "scheduled",
    ...overrides,
  };
}

Deno.test("price-drop scan request clamps limits and filters ids", async () => {
  const request = makeRequest({
    alert_ids: [
      "11111111-1111-4111-8111-111111111111",
      "11111111-1111-4111-8111-111111111111",
      "not-a-uuid",
    ],
    dry_run: true,
    limit: "99999",
    productIds: ["22222222-2222-4222-8222-222222222222", "../bad"],
    triggerSource: "hosted-deploy-gate",
    user_ids: ["33333333-3333-4333-8333-333333333333"],
  });

  assertEquals(await parsePriceDropScanRequest(request), {
    alertIds: ["11111111-1111-4111-8111-111111111111"],
    dryRun: true,
    limit: 5000,
    productIds: ["22222222-2222-4222-8222-222222222222"],
    triggerSource: "hosted_deploy_gate",
    userIds: ["33333333-3333-4333-8333-333333333333"],
  });
});

Deno.test("price-drop scan request treats string false as false", async () => {
  assertEquals(
    (await parsePriceDropScanRequest(makeRequest({ dryRun: "false" }))).dryRun,
    false,
  );
});

Deno.test(
  "price-drop scan request defaults trigger source to manual",
  async () => {
    assertEquals(
      await parsePriceDropScanRequest(makeRequest({ dryRun: "yes" })),
      {
        alertIds: [],
        dryRun: true,
        limit: 500,
        productIds: [],
        triggerSource: "manual",
        userIds: [],
      },
    );
  },
);

Deno.test(
  "price-drop notification run evidence is sanitized aggregate data",
  () => {
    assertEquals(
      buildPriceDropNotificationRunEvidence({
        ...makeEvidenceInput({
          skipped: {
            already_notified: 3,
            "bad key with spaces": 99,
            not_met: 4,
          },
        }),
      }),
      {
        alerts_marked_count: 3,
        candidate_count: 3,
        completed_at: "2026-06-14T14:01:00.000Z",
        dry_run: false,
        limit_count: 100,
        notifications_recorded_count: 3,
        requested_alert_count: 1,
        requested_product_count: 2,
        requested_user_count: 0,
        run_id: "price-drop-run-1",
        scanned_count: 10,
        skipped_summary: {
          already_notified: 3,
          not_met: 4,
        },
        started_at: "2026-06-14T14:00:00.000Z",
        status: "completed",
        trigger_source: "scheduled",
      },
    );
  },
);

Deno.test(
  "price-drop notification run evidence allows dry-run candidates",
  () => {
    assertEquals(
      buildPriceDropNotificationRunEvidence(
        makeEvidenceInput({
          alertsMarkedCount: 0,
          candidateCount: 3,
          dryRun: true,
          notificationsRecordedCount: 0,
          skipped: {
            already_notified: 1,
            not_met: 4,
          },
          status: "dry_run",
        }),
      ),
      {
        alerts_marked_count: 0,
        candidate_count: 3,
        completed_at: "2026-06-14T14:01:00.000Z",
        dry_run: true,
        limit_count: 100,
        notifications_recorded_count: 0,
        requested_alert_count: 1,
        requested_product_count: 2,
        requested_user_count: 0,
        run_id: "price-drop-run-1",
        scanned_count: 10,
        skipped_summary: {
          already_notified: 1,
          not_met: 4,
        },
        started_at: "2026-06-14T14:00:00.000Z",
        status: "dry_run",
        trigger_source: "scheduled",
      },
    );
  },
);

Deno.test(
  "price-drop notification run evidence rejects completed notification mismatch",
  () => {
    assertThrows(
      () =>
        buildPriceDropNotificationRunEvidence(
          makeEvidenceInput({ notificationsRecordedCount: 2 }),
        ),
      Error,
      "Invalid price-drop run evidence.",
    );
  },
);

Deno.test(
  "price-drop notification run evidence accepts stale concurrent delivery claims",
  () => {
    assertEquals(
      buildPriceDropNotificationRunEvidence(
        makeEvidenceInput({
          alertsMarkedCount: 2,
          notificationsRecordedCount: 2,
          skipped: {
            already_notified: 3,
            delivery_claim_lost: 1,
            not_met: 4,
          },
        }),
      ).skipped_summary,
      {
        already_notified: 3,
        delivery_claim_lost: 1,
        not_met: 4,
      },
    );
  },
);

Deno.test(
  "price-drop notification run evidence rejects dry-run completed status",
  () => {
    assertThrows(
      () =>
        buildPriceDropNotificationRunEvidence(
          makeEvidenceInput({
            alertsMarkedCount: 0,
            dryRun: true,
            notificationsRecordedCount: 0,
            status: "completed",
          }),
        ),
      Error,
      "Invalid price-drop run evidence.",
    );
  },
);

Deno.test(
  "price-drop notification run evidence rejects live dry-run status",
  () => {
    assertThrows(
      () =>
        buildPriceDropNotificationRunEvidence(
          makeEvidenceInput({
            dryRun: false,
            status: "dry_run",
          }),
        ),
      Error,
      "Invalid price-drop run evidence.",
    );
  },
);

Deno.test(
  "price-drop notification run evidence rejects dry-run failed status",
  () => {
    assertThrows(
      () =>
        buildPriceDropNotificationRunEvidence(
          makeEvidenceInput({
            alertsMarkedCount: 0,
            dryRun: true,
            notificationsRecordedCount: 0,
            status: "failed",
          }),
        ),
      Error,
      "Invalid price-drop run evidence.",
    );
  },
);

Deno.test(
  "price-drop notification run evidence rejects skipped summary mismatch",
  () => {
    assertThrows(
      () =>
        buildPriceDropNotificationRunEvidence(
          makeEvidenceInput({ skipped: { already_notified: 2, not_met: 4 } }),
        ),
      Error,
      "Invalid price-drop run evidence.",
    );
  },
);

Deno.test(
  "price-drop notification run evidence rejects inactive skips",
  () => {
    assertThrows(
      () =>
        buildPriceDropNotificationRunEvidence(
          makeEvidenceInput({
            scannedCount: 11,
            skipped: { already_notified: 3, inactive: 1, not_met: 4 },
          }),
        ),
      Error,
      "Invalid price-drop run evidence.",
    );
  },
);

Deno.test("price-drop notify secret accepts exact trusted headers", () => {
  assertEquals(
    verifyPriceDropNotifySecret(
      makeRequest({}, { Authorization: "Bearer staging-secret" }),
      "staging-secret",
    ),
    { mode: "authorization_bearer", status: "ok" },
  );
  assertEquals(
    verifyPriceDropNotifySecret(
      makeRequest({}, { "x-price-drop-secret": "staging-secret" }),
      "staging-secret",
    ),
    { mode: "x_price_drop_secret", status: "ok" },
  );
});

Deno.test(
  "price-drop notify secret rejects missing partial and whitespace secrets",
  () => {
    const expected = {
      error: "Unauthorized price-drop notification request.",
      status: "error",
      statusCode: 401,
    } as const;

    assertEquals(
      verifyPriceDropNotifySecret(makeRequest({}), "staging-secret"),
      expected,
    );
    assertEquals(
      verifyPriceDropNotifySecret(
        makeRequest({}, { Authorization: "Bearer staging" }),
        "staging-secret",
      ),
      expected,
    );
    assertEquals(
      verifyPriceDropNotifySecret(
        makeRequest({}, { "x-price-drop-secret": "   " }),
        "staging-secret",
      ),
      expected,
    );
  },
);
