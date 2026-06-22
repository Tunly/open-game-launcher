import { describe, expect, it } from "vitest";

import {
  buildSmartInstallProviderTelemetryReadiness,
  createVerifySmartInstallProviderTelemetryReadiness,
} from "../smart-install-provider-telemetry-readiness";

describe("buildSmartInstallProviderTelemetryReadiness", () => {
  it("keeps provider telemetry staging local without live checks or download claims", () => {
    const readiness = createVerifySmartInstallProviderTelemetryReadiness();

    expect(readiness.statusLabel).toBe("Local only");
    expect(readiness.readyCount).toBe(3);
    expect(readiness.warningCount).toBe(2);
    expect(readiness.blockedCount).toBe(3);
    expect(readiness.dryRunPacket?.title).toBe("Provider Telemetry Dry-Run Contract");
    expect(readiness.dryRunPacket?.writes).toBe("none");
    expect(readiness.dryRunPacket?.liveCalls).toBe("none");
    expect(readiness.dryRunPacket?.signals).toHaveLength(3);
    expect(readiness.dryRunPacket?.redactedFieldCount).toBe(12);
    expect(readiness.localMirrorAuditPacket?.title).toBe("Local Mirror Measurement + Rank Diff");
    expect(readiness.localMirrorAuditPacket?.writes).toBe("none");
    expect(readiness.localMirrorAuditPacket?.liveCalls).toBe("none");
    expect(readiness.localMirrorAuditPacket?.recommendedAfter).toBe("lan-peer-cache");
    expect(readiness.guards).toContain("No live provider telemetry");
    expect(readiness.guards).toContain("No entitlement API call");
    expect(readiness.guards).toContain("No live mirror speed measurement");
    expect(readiness.guards).toContain("No provider ranking sync");
    expect(readiness.guards).toContain("No auto-purchase/download claim");
    expect(readiness.guardCopy).toContain("does not fetch live provider telemetry");
    expect(readiness.guardCopy).toContain("run live mirror probes");
    expect(JSON.stringify(readiness.dryRunPacket)).toContain("<redacted>");
    expect(JSON.stringify(readiness.dryRunPacket)).not.toMatch(
      /bearer ey|access_token=[^<]|download_url=https?:|signed_ticket=|account_email=.*@/i,
    );
    expect(JSON.stringify(readiness.localMirrorAuditPacket)).not.toMatch(
      /ticket=|auth=|token=|secret|download started|ranking synced/i,
    );
  });

  it("blocks staging when local planner and source scoring are missing", () => {
    const readiness = buildSmartInstallProviderTelemetryReadiness({
      dryRunContractReady: false,
      entitlementCheckReady: false,
      localPlannerReady: false,
      localSourceScoringReady: false,
      mirrorMeasurementReady: false,
      providerTelemetryReady: false,
      rankingSyncReady: false,
      rateLimitPolicyReady: false,
    });

    expect(readiness.blockedCount).toBe(8);
    expect(readiness.dryRunPacket).toBeNull();
    expect(readiness.localMirrorAuditPacket).toBeNull();
    expect(readiness.nextAction).toBe(
      "Restore local Smart Install planning before provider telemetry staging.",
    );
  });

  it("keeps live provider capabilities in review even when evidence exists", () => {
    const readiness = buildSmartInstallProviderTelemetryReadiness({
      dryRunContractReady: true,
      entitlementCheckReady: true,
      localPlannerReady: true,
      localSourceScoringReady: true,
      mirrorMeasurementReady: true,
      providerTelemetryReady: true,
      rankingSyncReady: true,
      rateLimitPolicyReady: true,
    });

    expect(readiness.blockedCount).toBe(0);
    expect(readiness.readyCount).toBe(3);
    expect(readiness.warningCount).toBe(5);
    expect(readiness.statusLabel).toBe("Needs staging");
    expect(readiness.gates.find((gate) => gate.id === "provider-telemetry")?.status).toBe(
      "warning",
    );
    expect(readiness.gates.find((gate) => gate.id === "dry-run-contract")?.status).toBe("ready");
  });
});
