import { describe, expect, it } from "vitest";

import {
  buildCrossStoreSaveMigrationReadiness,
  createVerifyCrossStoreSaveMigrationReadiness,
} from "../cross-store-save-migration-readiness";

describe("buildCrossStoreSaveMigrationReadiness", () => {
  it("keeps live save migration E2E blocked for the verification fixture", () => {
    const readiness = createVerifyCrossStoreSaveMigrationReadiness();

    expect(readiness.statusLabel).toBe("Local only");
    expect(readiness.readyCount).toBe(5);
    expect(readiness.warningCount).toBe(8);
    expect(readiness.blockedCount).toBe(2);
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
    expect(readiness.guards).toContain("Supabase/keychain staging proof review only");
    expect(readiness.guards).toContain("No provider cloud transfer");
    expect(readiness.guards).toContain("No live Supabase bucket E2E");
    expect(readiness.guards).toContain("Keychain restore contract review only");
    expect(readiness.guards).toContain("Rollback restore requires explicit desktop consent");
    expect(readiness.keychainRestoreEvidence?.label).toBe("Keychain Restore Contract");
    expect(readiness.keychainRestoreEvidence?.guards).toContain("No key export");
    expect(readiness.keychainRestoreEvidence?.guards).toContain("No live keychain restore run");
    expect(readiness.keychainRestoreEvidence?.guards).toContain(
      "Restore requires explicit desktop consent",
    );
    expect(readiness.keychainRestoreEvidence?.restoreRules.map((rule) => rule.label)).toEqual([
      "Redacted React Boundary",
      "Desktop Vault Boundary",
      "Session Consent Boundary",
    ]);
    expect(readiness.keychainRestoreEvidence?.summary).not.toMatch(
      /key exported|plaintext secret|live bucket restored|keychain restored|migration complete/i,
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
      "Supabase/Keychain Staging Contract",
      "Supabase Bucket E2E",
      "Keychain Restore",
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
      keychainRestoreReady: true,
      localPlanReady: true,
      localSandboxProofReady: true,
      migrationSessionRehearsalReady: true,
      nativeCopyEngineReady: true,
      pathMappingReady: true,
      providerCatalogReady: true,
      providerCloudContractReady: true,
      providerCloudTransferReady: false,
      rollbackSnapshotReady: true,
      supabaseBucketE2EReady: false,
      supabaseKeychainStagingProofReady: true,
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
    expect(readiness.summary).toContain("redacted Supabase/keychain staging contract");
    expect(readiness.summary).toContain("keychain restore contract");
    expect(readiness.summary).toContain("migration-session rehearsal packet");
    expect(readiness.summary).toContain("provider-approved catalog validation");
    expect(readiness.summary).toContain("live Supabase/keychain E2E");
    expect(readiness.nextAction).toContain("Stage provider-approved cloud");
    expect(readiness.guardCopy).toContain("Native desktop copy and rollback now require");
    expect(readiness.guardCopy).toContain("provider cloud contract review");
    expect(readiness.guardCopy).toContain("temp-file local sandbox proof");
    expect(readiness.guardCopy).toContain("migration session rehearsal review");
    expect(readiness.guardCopy).toContain("Supabase/keychain staging-contract review");
    expect(readiness.guardCopy).toContain("keychain restore contract review");
    expect(readiness.guardCopy).toContain("provider-approved catalog validation");
  });
});
