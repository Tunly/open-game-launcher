import { describe, expect, it } from "vitest";

import {
  buildOneClickSetupE2EReadiness,
  createVerifyOneClickSetupE2EReadiness,
} from "../one-click-setup-e2e-readiness";

describe("buildOneClickSetupE2EReadiness", () => {
  it("keeps hosted/provider setup E2E local without auth, token, or install claims", () => {
    const readiness = createVerifyOneClickSetupE2EReadiness();

    expect(readiness.statusLabel).toBe("Local only");
    expect(readiness.readyCount).toBe(1);
    expect(readiness.warningCount).toBe(1);
    expect(readiness.blockedCount).toBe(5);
    expect(readiness.guards).toContain("No hosted auth E2E");
    expect(readiness.guards).toContain("No OAuth/token replay");
    expect(readiness.guards).toContain("No provider-approved silent install");
    expect(readiness.guards).toContain("No consent/terms approval");
    expect(readiness.guards).toContain("No rollback/audit claim");
    expect(readiness.guardCopy).toContain("does not verify hosted auth");
    expect(readiness.guardCopy).toContain("run provider-approved silent installs");
  });

  it("blocks every gate when the local setup tape is absent", () => {
    const readiness = buildOneClickSetupE2EReadiness({
      consentPolicyReady: false,
      hostedAuthReady: false,
      localSetupTapeReady: false,
      providerOAuthReady: false,
      rollbackAuditReady: false,
      silentInstallReady: false,
      tokenReplayReady: false,
    });

    expect(readiness.blockedCount).toBe(7);
    expect(readiness.nextAction).toBe(
      "Restore the local One-Click Setup tape before hosted automation.",
    );
  });

  it("keeps provider automation in review even when evidence exists", () => {
    const readiness = buildOneClickSetupE2EReadiness({
      consentPolicyReady: true,
      hostedAuthReady: true,
      localSetupTapeReady: true,
      providerOAuthReady: true,
      rollbackAuditReady: true,
      silentInstallReady: true,
      tokenReplayReady: true,
    });

    expect(readiness.blockedCount).toBe(0);
    expect(readiness.readyCount).toBe(1);
    expect(readiness.warningCount).toBe(6);
    expect(readiness.statusLabel).toBe("Needs staging");
    expect(readiness.gates.find((gate) => gate.id === "provider-oauth")?.status).toBe("warning");
  });
});
