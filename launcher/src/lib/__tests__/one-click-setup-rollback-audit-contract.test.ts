import { describe, expect, it } from "vitest";

import {
  buildOneClickSetupRollbackAuditContract,
  createVerifyOneClickSetupRollbackAuditContract,
  ONE_CLICK_SETUP_ROLLBACK_AUDIT_BLOCKED_CLAIMS,
} from "../one-click-setup-rollback-audit-contract";
import { buildOneClickSetupReadiness } from "../one-click-setup-readiness";

const falseRollbackAuditClaim =
  /\b(?:hosted\s*auth\s*(?:verified|complete|passed)|oauth\s*(?:replayed|complete|verified)|tokens?\s*(?:replayed|restored|migrated|verified)|keychain\s*(?:migrated|restored|written)|silent\s*install\s*(?:started|ready|complete|approved)|automatic\s*install\s*(?:started|complete)|setup\s*(?:completed|replayed)|provider\s*client\s*(?:mutated|updated|installed)|rollback\s*(?:verified|complete|succeeded)|cleanup\s*(?:complete|succeeded)|audit\s*(?:row\s*)?(?:inserted|verified|complete|succeeded)|consent\s*approved|terms\s*approved|production\s*(?:setup\s*)?(?:deployment\s*)?(?:ready|complete|verified))\b/i;

describe("buildOneClickSetupRollbackAuditContract", () => {
  it("creates a no-write rollback/audit rehearsal without hosted setup claims", () => {
    const contract = createVerifyOneClickSetupRollbackAuditContract();

    expect(contract.statusLabel).toBe("No-write rehearsal");
    expect(contract.passCount).toBe(2);
    expect(contract.reviewCount).toBe(3);
    expect(contract.blockedCount).toBe(0);
    expect(contract.blockedClaims).toEqual(ONE_CLICK_SETUP_ROLLBACK_AUDIT_BLOCKED_CLAIMS);
    expect(contract.guardCopy).toContain("Local no-write rollback/audit rehearsal only");
    expect(contract.lanes.map((lane) => lane.id)).toEqual([
      "setup-step-ledger",
      "undo-plan",
      "partial-failure-map",
      "cleanup-plan",
      "audit-envelope",
    ]);
    expect(contract.packet.writes).toEqual([]);
    expect(contract.packet.deletes).toEqual([]);
    expect(contract.packet.liveCalls).toEqual([]);
    expect(contract.packet.rollbackExecuted).toBe(false);
    expect(contract.packet.cleanupExecuted).toBe(false);
    expect(contract.packet.auditPersisted).toBe(false);
    expect(contract.packet.auditEnvelope.writes).toEqual([]);
    expect(contract.packet.auditEnvelope.deletes).toEqual([]);
    expect(JSON.stringify(contract)).not.toMatch(falseRollbackAuditClaim);
  });

  it("binds the packet step ledger to the One-Click Setup readiness order", () => {
    const readiness = buildReadyOneClickSetupReadiness();
    const contract = buildOneClickSetupRollbackAuditContract({
      auditEnvelopeReady: true,
      cleanupPlanReady: true,
      partialFailureMapReady: true,
      readiness,
      setupStepLedgerReady: true,
      undoPlanReady: true,
    });

    expect(contract.packet.setupStepLedger.map((step) => step.stepId)).toEqual(
      readiness.steps.map((step) => step.id),
    );
    expect(contract.lanes.find((lane) => lane.id === "setup-step-ledger")?.evidence).toBe(
      "steps:desktop-runtime>install-target>platform-links>library-seed>backup-restore>cloud-account",
    );
    expect(JSON.stringify(contract.packet)).not.toContain("store-links");
  });

  it("redacts rollback audit errors before they enter the packet", () => {
    const contract = buildOneClickSetupRollbackAuditContract({
      auditEnvelopeReady: true,
      cleanupPlanReady: true,
      failure: {
        failedStepId: "platform-links",
        rawError:
          "Authorization: Bearer secret.jwt.value https://x.test/a?access_token=access-secret&refresh_token=refresh-secret token=inline-token sig=signed-secret /home/daniel/.config/og/token.txt D:\\Secrets\\token.txt ogd_supersecretvalue sbp_abcdefghijklmnopqrstuvwxyz1234567890",
        source: "operator-review",
      },
      partialFailureMapReady: true,
      readiness: buildReadyOneClickSetupReadiness(),
      setupStepLedgerReady: true,
      undoPlanReady: true,
    });
    const serializedPacket = JSON.stringify(contract.packet);

    expect(contract.packet.auditEnvelope.redactionApplied).toBe(true);
    expect(serializedPacket).not.toContain("secret.jwt.value");
    expect(serializedPacket).not.toContain("access-secret");
    expect(serializedPacket).not.toContain("refresh-secret");
    expect(serializedPacket).not.toContain("inline-token");
    expect(serializedPacket).not.toContain("signed-secret");
    expect(serializedPacket).not.toContain("https://x.test");
    expect(serializedPacket).not.toContain("/home/daniel");
    expect(serializedPacket).not.toContain("D:\\Secrets");
    expect(serializedPacket).not.toContain("ogd_supersecretvalue");
    expect(serializedPacket).not.toContain("sbp_abcdefghijklmnopqrstuvwxyz1234567890");
    expect(serializedPacket).toContain("[redacted-url]");
    expect(serializedPacket).toContain("[redacted-path]");
  });

  it("blocks unknown setup steps instead of treating them as valid rollback lanes", () => {
    const readiness = buildReadyOneClickSetupReadiness();
    const contract = buildOneClickSetupRollbackAuditContract({
      auditEnvelopeReady: true,
      cleanupPlanReady: true,
      failure: {
        failedStepId: "store-links",
        rawError: "Legacy setup step should not pass.",
        source: "verify-route",
      },
      partialFailureMapReady: true,
      readiness: {
        ...readiness,
        steps: [
          ...readiness.steps,
          {
            action: "Legacy store link replay.",
            detail: "Legacy id from an obsolete setup tape.",
            id: "store-links",
            label: "Legacy Store Links",
            status: "ready",
          },
        ],
      },
      setupStepLedgerReady: true,
      undoPlanReady: true,
    });

    expect(contract.statusLabel).toBe("Blocked");
    expect(contract.blockedCount).toBeGreaterThan(0);
    expect(contract.packet.validationErrors).toContain("Unknown setup step ids: store-links");
    expect(contract.lanes.find((lane) => lane.id === "setup-step-ledger")?.status).toBe("blocked");
    expect(
      contract.packet.partialFailureMap.find((plan) => plan.stepId === "store-links")?.checkpoint,
    ).toBe("blocked-unknown-step");
  });

  it("blocks missing rehearsal evidence while preserving skipped execution labels", () => {
    const contract = buildOneClickSetupRollbackAuditContract({
      auditEnvelopeReady: false,
      cleanupPlanReady: false,
      partialFailureMapReady: false,
      setupStepLedgerReady: false,
      undoPlanReady: false,
    });

    expect(contract.statusLabel).toBe("Blocked");
    expect(contract.blockedCount).toBe(5);
    expect(contract.lanes.find((lane) => lane.id === "audit-envelope")).toEqual(
      expect.objectContaining({
        skipped: "No Supabase audit row write",
        status: "blocked",
      }),
    );
    expect(contract.lanes.find((lane) => lane.id === "cleanup-plan")).toEqual(
      expect.objectContaining({
        skipped: "No file deletion",
        status: "blocked",
      }),
    );
  });
});

function buildReadyOneClickSetupReadiness() {
  return buildOneClickSetupReadiness({
    backupReminderConfigured: true,
    installDir: "/games",
    isDesktopRuntime: true,
    librarySnapshotCount: 3,
    platforms: [{ gamesCount: 12, id: "steam", label: "Steam", linked: true }],
    supabaseConfigured: true,
  });
}
