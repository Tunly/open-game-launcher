// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { getStorePriceDropSchedulerReadiness } from "../store-price-drop-readiness";

describe("store price-drop scheduler readiness", () => {
  it("summarizes staged alerts while keeping hosted cron visible", () => {
    const readiness = getStorePriceDropSchedulerReadiness({
      localAlertCount: 2,
      remoteAlertCount: 2,
      isSignedIn: true,
    });

    expect(readiness.activeAlertCount).toBe(2);
    expect(readiness.localAlertCount).toBe(2);
    expect(readiness.remoteAlertCount).toBe(2);
    expect(readiness.statusLabel).toBe("Needs hosted cron");
    expect(readiness.blockedCount).toBe(0);
    expect(readiness.passedCount).toBe(6);
    expect(readiness.warningCount).toBe(1);
    expect(readiness.progress).toBe(86);
    expect(readiness.dryRunPayload).toBe('{"dryRun":true}');
    expect(readiness.hostedProof.latestRunId).toBe("none");
    expect(readiness.hostedProof.writeMode).toBe("No verify-route notification write");
    expect(readiness.hostedProof.guards).toContain("No PRICE_DROP_NOTIFY_SECRET");
    expect(readiness.hostedProof.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Secret-gated caller", status: "pass" }),
        expect.objectContaining({ label: "Run evidence row", status: "warning" }),
        expect.objectContaining({ label: "Trusted scheduled row", status: "warning" }),
        expect.objectContaining({ label: "No-write verify route", status: "pass" }),
      ]),
    );
    expect(JSON.stringify(readiness.hostedProof)).not.toMatch(
      /PRICE_DROP_NOTIFY_SECRET=|@example\.|notification body:/i,
    );
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Edge function", status: "pass" }),
        expect.objectContaining({ label: "Secret gate", status: "pass" }),
        expect.objectContaining({ label: "Alert queue", status: "pass" }),
        expect.objectContaining({ label: "Dry-run payload", status: "pass" }),
        expect.objectContaining({ label: "Hosted cron", status: "warning" }),
      ]),
    );
  });

  it("warns when local alerts have not synced to a signed-in store account", () => {
    const readiness = getStorePriceDropSchedulerReadiness({
      localAlertCount: -1,
      remoteAlertCount: -1,
      isSignedIn: false,
    });

    expect(readiness.activeAlertCount).toBe(0);
    expect(readiness.localAlertCount).toBe(0);
    expect(readiness.remoteAlertCount).toBe(0);
    expect(readiness.statusLabel).toBe("Needs hosted cron");
    expect(readiness.dryRunPayload).toBe('{"dryRun":true}');
    expect(readiness.statusLabel).not.toBe("Ready");
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Alert queue", status: "warning" }),
        expect.objectContaining({ label: "Remote sync", status: "warning" }),
      ]),
    );
  });

  it("does not count local-only alerts as scheduler-ready rows", () => {
    const readiness = getStorePriceDropSchedulerReadiness({
      localAlertCount: 3,
      remoteAlertCount: 0,
      isSignedIn: true,
    });

    expect(readiness.activeAlertCount).toBe(0);
    expect(readiness.localAlertCount).toBe(3);
    expect(readiness.remoteAlertCount).toBe(0);
    expect(readiness.passedCount).toBe(4);
    expect(readiness.warningCount).toBe(3);
    expect(readiness.progress).toBe(57);
    expect(readiness.summary).toMatch(/Local price alerts are visible/);
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Alert queue",
          status: "warning",
          detail: expect.stringMatching(/cron needs synced UUID store_price_alert rows/),
        }),
        expect.objectContaining({
          label: "Remote sync",
          status: "warning",
          detail: expect.stringMatching(/no remote scheduler rows/),
        }),
      ]),
    );
  });

  it("separates trusted scheduler evidence from synced alert coverage", () => {
    const readiness = getStorePriceDropSchedulerReadiness({
      localAlertCount: 1,
      remoteAlertCount: 0,
      isSignedIn: true,
      hostedRunEvidence: {
        alertsMarkedCount: 1,
        candidateCount: 1,
        completedAt: "2026-06-15T00:00:00.000Z",
        dryRun: false,
        limit: 500,
        notificationsRecordedCount: 1,
        requestedAlertCount: 0,
        requestedProductCount: 0,
        requestedUserCount: 0,
        runId: "price-drop-run-1",
        scannedCount: 1,
        status: "completed",
        triggerSource: "scheduled",
      },
      trustedEvidence: true,
    });

    expect(readiness.statusLabel).toBe("Needs synced alerts");
    expect(readiness.summary).toMatch(/trusted scheduler evidence/);
    expect(readiness.hostedProof.latestRunId).toBe("price-drop-run-1");
    expect(readiness.hostedProof.triggerSource).toBe("scheduled");
    expect(readiness.hostedProof.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Run evidence row", status: "pass" }),
        expect.objectContaining({ label: "Aggregate counts only", status: "pass" }),
        expect.objectContaining({ label: "Trusted scheduled row", status: "pass" }),
      ]),
    );
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Hosted cron", status: "pass" }),
        expect.objectContaining({ label: "Alert queue", status: "warning" }),
      ]),
    );
  });

  it("keeps notify-price-drop callable by trusted cron", () => {
    const config = readFileSync(resolve("../supabase/config.toml"), "utf8");

    expect(config).toMatch(/\[functions\.notify-price-drop\][\s\S]*?verify_jwt\s*=\s*false/);
  });
});
