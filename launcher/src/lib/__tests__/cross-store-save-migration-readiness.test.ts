import { describe, expect, it } from "vitest";

import {
  buildCrossStoreSaveMigrationReadiness,
  createVerifyCrossStoreSaveMigrationReadiness,
} from "../cross-store-save-migration-readiness";

describe("buildCrossStoreSaveMigrationReadiness", () => {
  it("keeps live save migration E2E blocked for the verification fixture", () => {
    const readiness = createVerifyCrossStoreSaveMigrationReadiness();

    expect(readiness.statusLabel).toBe("Local only");
    expect(readiness.readyCount).toBe(4);
    expect(readiness.warningCount).toBe(7);
    expect(readiness.blockedCount).toBe(1);
    expect(readiness.progress).toBe(33);
    expect(readiness.guards).toContain("Dry-run audit before copy");
    expect(readiness.guards).toContain("Native copy requires explicit desktop consent");
    expect(readiness.guards).toContain("No automatic migration run");
    expect(readiness.guards).toContain("Provider catalog coverage review only");
    expect(readiness.guards).toContain("Provider cloud contract review only");
    expect(readiness.guards).toContain("Provider path mapping review only");
    expect(readiness.guards).toContain("Post-copy verification review only");
    expect(readiness.guards).toContain("Local sandbox proof uses temp files only");
    expect(readiness.guards).toContain("Migration session rehearsal review only");
    expect(readiness.guards).toContain("No provider cloud transfer");
    expect(readiness.guards).toContain("Rollback restore requires explicit desktop consent");
    expect(readiness.guards).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/supabase|keychain|bucket/i)]),
    );
    expect(readiness.gates.map((gate) => gate.label)).toEqual([
      "Local Save Plan",
      "Variant Metadata",
      "Provider Catalog Coverage",
      "Provider Cloud Contract Packet",
      "Dry-Run Audit Packet",
      "Native Copy Engine",
      "Path Mapping Matrix",
      "Provider Cloud Transfer",
      "Rollback Restore",
      "Local Sandbox E2E Proof",
      "Post-Copy Conflict Audit",
      "Migration Session Rehearsal",
    ]);
  });

  it("does not report controlled staging until all mutation and live E2E gates pass", () => {
    const readiness = buildCrossStoreSaveMigrationReadiness({
      conflictAuditReady: true,
      dryRunAuditReady: true,
      localPlanReady: true,
      localSandboxProofReady: true,
      migrationSessionRehearsalReady: true,
      nativeCopyEngineReady: true,
      pathMappingReady: true,
      providerCatalogReady: true,
      providerCloudContractReady: true,
      providerCloudTransferReady: false,
      rollbackSnapshotReady: true,
      variantMetadataReady: true,
    });

    expect(readiness.summary).toContain("dry-run audit packet");
    expect(readiness.summary).toContain("provider catalog coverage packet");
    expect(readiness.summary).toContain("provider cloud contract packet");
    expect(readiness.summary).toContain("provider path-map review matrix");
    expect(readiness.summary).toContain("consent-gated native copy proof");
    expect(readiness.summary).toContain("rollback restore proof");
    expect(readiness.summary).toContain("temp-file local sandbox E2E proof");
    expect(readiness.summary).toContain("post-copy conflict verification packet");
    expect(readiness.summary).toContain("migration-session rehearsal packet");
    expect(readiness.summary).toContain("provider-approved catalog validation");
    expect(readiness.summary).not.toMatch(/supabase|keychain|bucket/i);
    expect(readiness.nextAction).toContain("Stage provider-approved cloud");
    expect(readiness.guardCopy).toContain("Native desktop copy and rollback now require");
    expect(readiness.guardCopy).toContain("provider cloud contract review");
    expect(readiness.guardCopy).toContain("temp-file local sandbox proof");
    expect(readiness.guardCopy).toContain("migration session rehearsal review");
    expect(readiness.guardCopy).toContain("provider-approved catalog validation");
    expect(readiness.guardCopy).not.toMatch(/supabase|keychain|bucket/i);
  });
});
