import { describe, expect, it } from "vitest";

import {
  buildPluginSystemReadiness,
  createPluginManifestImportPayload,
  createVerifyPluginMarketplaceUpdateIndexTrustReadiness,
  createVerifyPluginRuntimeSandboxReadiness,
  createVerifyPluginUpdateSigningReadiness,
  createVerifyPluginSystemReadiness,
  parsePluginManifestImportPayload,
  type PluginRuntimeSandboxProofEvidence,
} from "../plugin-system-readiness";

function createRuntimeSandboxEscapeAttempts() {
  return [
    {
      blockedBy: "entrypoint path containment",
      boundary: "path",
      id: "path-traversal-entrypoint",
      label: "Path Traversal Entrypoint",
      payload: "../secrets/token.txt",
      result: "blocked-before-code-load",
    },
    {
      blockedBy: "deny-all IPC allowlist",
      boundary: "ipc",
      id: "ipc-open-shell",
      label: "Deny-All IPC Invoke",
      payload: "tauri.invoke('open_shell')",
      result: "blocked-before-code-load",
    },
    {
      blockedBy: "no environment grants",
      boundary: "environment",
      id: "environment-secret-read",
      label: "Environment Secret Read",
      payload: "process.env.OG_SECRET",
      result: "blocked-before-code-load",
    },
    {
      blockedBy: "disabled registry read-only containment",
      boundary: "filesystem",
      id: "filesystem-host-write",
      label: "Filesystem Host Write",
      payload: "/etc/hosts",
      result: "blocked-before-code-load",
    },
    {
      blockedBy: "registry symlink ancestor rejection",
      boundary: "filesystem",
      id: "filesystem-symlink-entrypoint",
      label: "Symlink Entrypoint Escape",
      payload: "dist/linked-main.js -> /tmp/escape.js",
      result: "blocked-before-code-load",
    },
    {
      blockedBy: "manifest path normalization",
      boundary: "path",
      id: "manifest-nested-path-escape",
      label: "Nested Manifest Path Escape",
      payload: "plugins/../manifest.json",
      result: "blocked-before-code-load",
    },
    {
      blockedBy: "network IPC allowlist is empty",
      boundary: "ipc",
      id: "ipc-network-fetch",
      label: "Network IPC Fetch",
      payload: "tauri.invoke('fetch_url', 'https://plugins.example')",
      result: "blocked-before-code-load",
    },
    {
      blockedBy: "deny-by-default permission ledger",
      boundary: "permission",
      id: "permission-process-spawn",
      label: "Permission Escalation",
      payload: "process:spawn",
      result: "blocked-before-code-load",
    },
  ];
}

function createRuntimeSandboxProof(
  overrides: Partial<PluginRuntimeSandboxProofEvidence> = {},
): PluginRuntimeSandboxProofEvidence {
  return {
    allowedExecutionCount: 0,
    auditFailedCount: 0,
    auditPassedCount: 1,
    codeExecuted: false,
    deniedEntrypointCount: 1,
    entries: [
      {
        denyReason:
          "Process sandbox runtime is not implemented; plugin entrypoint denied before code load.",
        entrypoint: "dist/main.js",
        issues: [],
        pluginId: "verified-plugin",
        registryPath: "app-data/plugins/staged/verified-plugin/1.0.0",
        status: "runtime-blocked",
        version: "1.0.0",
      },
    ],
    escapeAttempts: createRuntimeSandboxEscapeAttempts(),
    ipcAllowlistReady: false,
    permissionGrantReady: false,
    processBoundaryReady: false,
    provedAt: "2026-06-15T00:02:00.000Z",
    registryPath: "app-data/plugins/staged",
    sourceLabel: "Desktop runtime sandbox dry-run",
    ...overrides,
  };
}

function buildRuntimeReadinessWithProof(proof: PluginRuntimeSandboxProofEvidence) {
  return buildPluginSystemReadiness({
    hostedMarketplaceConfigured: true,
    localDiscoveryConfigured: true,
    manifestCount: 1,
    permissionReviewConfigured: true,
    runtimeSandboxProof: proof,
    sandboxPrototypeAvailable: false,
    signedManifestCount: 1,
    updateChannelConfigured: true,
  });
}

describe("buildPluginSystemReadiness", () => {
  it("keeps verification mode local-only without execution or marketplace claims", () => {
    const readiness = createVerifyPluginSystemReadiness();

    expect(readiness.statusLabel).toBe("Local only");
    expect(readiness.readyCount).toBe(6);
    expect(readiness.blockedCount).toBe(2);
    expect(readiness.warningCount).toBe(1);
    expect(readiness.guards).toContain("Local manifest review");
    expect(readiness.guards).toContain("Static policy ledger only");
    expect(readiness.guards).toContain("Deny-by-default permissions");
    expect(readiness.guards).toContain("No plugin execution");
    expect(readiness.guards).toContain("Native disabled registry audit");
    expect(readiness.guards).toContain("Native runtime admission dry-run");
    expect(readiness.guards).toContain("Sandbox escape fixtures blocked");
    expect(readiness.guards).toContain("Signed package stages disabled");
    expect(readiness.guards).toContain("No permission grant persisted");
    expect(readiness.guards).toContain("No marketplace publish");
    expect(readiness.guards).toContain("No auto-update install");
    expect(readiness.guards).toContain("No theme/app shell injection");
    expect(readiness.manifestReviews).toHaveLength(3);
    expect(readiness.permissionLedger.map((item) => item.label)).toEqual([
      "downloads:write",
      "library:read",
      "process:spawn",
      "settings:write",
      "theme:profile",
    ]);
    expect(readiness.policyLedger.map((item) => item.label)).toEqual([
      "Schema Policy",
      "Permission Denials",
      "Theme Hook Policy",
      "Signature Policy",
    ]);
    expect(
      readiness.policyLedger.find((item) => item.id === "permission-denials")?.detail,
    ).toContain("outside the local allowlist");
    expect(readiness.checks.find((check) => check.id === "runtime-sandbox")?.status).toBe(
      "blocked",
    );
    expect(readiness.checks.find((check) => check.id === "signed-package-staging")?.status).toBe(
      "ready",
    );
    expect(readiness.checks.find((check) => check.id === "disabled-registry-audit")?.status).toBe(
      "ready",
    );
    expect(readiness.checks.find((check) => check.id === "policy-ledger")?.status).toBe("ready");
    expect(readiness.disabledRegistryAudit).toEqual(
      expect.objectContaining({
        failedCount: 0,
        passedCount: 1,
        sourceLabel: "Verification native disabled registry audit fixture",
      }),
    );
    expect(readiness.runtimeSandboxProof).toBeNull();
    expect(readiness.signedPackageLedger).toEqual([
      expect.objectContaining({
        fileCount: 1,
        keyId: "local-trusted",
        pluginId: "library-tags-exporter",
        status: "disabled",
      }),
    ]);
  });

  it("warns when local manifests are missing before runtime work", () => {
    const readiness = buildPluginSystemReadiness({
      hostedMarketplaceConfigured: false,
      localDiscoveryConfigured: false,
      manifestCount: 0,
      permissionReviewConfigured: false,
      sandboxPrototypeAvailable: false,
      signedManifestCount: 0,
      updateChannelConfigured: false,
    });

    expect(readiness.statusLabel).toBe("Local only");
    expect(readiness.warningCount).toBe(7);
    expect(readiness.blockedCount).toBe(2);
    expect(readiness.nextAction).toBe(
      "Build a process boundary before loading third-party plugin code.",
    );
    expect(readiness.checks.find((check) => check.id === "manifest-schema")?.detail).toContain(
      "No local plugin manifests",
    );
    expect(readiness.manifestReviews).toEqual([]);
    expect(readiness.policyLedger.map((item) => item.status)).toEqual([
      "warning",
      "ready",
      "ready",
      "warning",
    ]);
    expect(readiness.permissionLedger).toEqual([
      {
        count: 0,
        detail: "No reviewed manifest requests elevated launcher permissions.",
        id: "no-elevated-permissions",
        label: "No Elevated Permissions",
        status: "ready",
      },
    ]);
  });

  it("does not promote browser package cache to package trust without native registry audit", () => {
    const readiness = buildPluginSystemReadiness({
      hostedMarketplaceConfigured: true,
      localDiscoveryConfigured: true,
      manifestCount: 1,
      permissionReviewConfigured: true,
      sandboxPrototypeAvailable: true,
      signedManifestCount: 1,
      stagedSignedPackages: [
        {
          detail: "Cached package row reopened from browser storage.",
          entrypoint: "dist/main.js",
          fileCount: 1,
          keyId: "local-trusted",
          pluginId: "cached-plugin",
          registryPath: "app-data/plugins/staged/cached-plugin/1.0.0",
          signatureIssuer: "Local Test CA",
          status: "disabled",
          version: "1.0.0",
        },
      ],
      updateChannelConfigured: true,
    });

    expect(readiness.checks.find((check) => check.id === "signed-package-staging")?.status).toBe(
      "warning",
    );
    expect(readiness.checks.find((check) => check.id === "disabled-registry-audit")?.status).toBe(
      "warning",
    );
    expect(
      readiness.checks.find((check) => check.id === "signed-package-staging")?.detail,
    ).toContain("browser display cache");
    expect(readiness.statusLabel).toBe("Needs hardening");
  });

  it("counts native disabled registry audit evidence as local package trust", () => {
    const readiness = buildPluginSystemReadiness({
      disabledRegistryAudit: {
        auditedAt: "2026-06-15T00:00:00.000Z",
        entries: [
          {
            entrypoint: "dist/main.js",
            fileCount: 1,
            issues: [],
            keyId: "local-trusted",
            pluginId: "verified-plugin",
            registryPath: "app-data/plugins/staged/verified-plugin/1.0.0",
            signatureIssuer: "Local Test CA",
            status: "disabled-audited",
            version: "1.0.0",
          },
        ],
        failedCount: 0,
        passedCount: 1,
        registryPath: "app-data/plugins/staged",
        sourceLabel: "Desktop disabled registry audit",
      },
      hostedMarketplaceConfigured: true,
      localDiscoveryConfigured: true,
      manifestCount: 1,
      permissionReviewConfigured: true,
      sandboxPrototypeAvailable: true,
      signedManifestCount: 1,
      stagedSignedPackages: [],
      updateChannelConfigured: true,
    });

    expect(readiness.checks.find((check) => check.id === "signed-package-staging")?.status).toBe(
      "ready",
    );
    expect(readiness.checks.find((check) => check.id === "disabled-registry-audit")?.status).toBe(
      "ready",
    );
    expect(readiness.disabledRegistryAudit?.entries[0]).toEqual(
      expect.objectContaining({
        issues: [],
        status: "disabled-audited",
      }),
    );
    expect(readiness.blockedCount).toBe(0);
  });

  it("treats native runtime sandbox dry-run proof as admission evidence without enabling runtime", () => {
    const readiness = buildPluginSystemReadiness({
      disabledRegistryAudit: {
        auditedAt: "2026-06-15T00:00:00.000Z",
        entries: [
          {
            entrypoint: "dist/main.js",
            fileCount: 1,
            issues: [],
            keyId: "local-trusted",
            pluginId: "verified-plugin",
            registryPath: "app-data/plugins/staged/verified-plugin/1.0.0",
            signatureIssuer: "Local Test CA",
            status: "disabled-audited",
            version: "1.0.0",
          },
        ],
        failedCount: 0,
        passedCount: 1,
        registryPath: "app-data/plugins/staged",
        sourceLabel: "Desktop disabled registry audit",
      },
      hostedMarketplaceConfigured: true,
      localDiscoveryConfigured: true,
      manifestCount: 1,
      permissionReviewConfigured: true,
      runtimeSandboxProof: {
        allowedExecutionCount: 0,
        auditFailedCount: 0,
        auditPassedCount: 1,
        codeExecuted: false,
        deniedEntrypointCount: 1,
        entries: [
          {
            denyReason:
              "Process sandbox runtime is not implemented; plugin entrypoint denied before code load.",
            entrypoint: "dist/main.js",
            issues: [],
            pluginId: "verified-plugin",
            registryPath: "app-data/plugins/staged/verified-plugin/1.0.0",
            status: "runtime-blocked",
            version: "1.0.0",
          },
        ],
        escapeAttempts: createRuntimeSandboxEscapeAttempts(),
        ipcAllowlistReady: false,
        permissionGrantReady: false,
        processBoundaryReady: false,
        provedAt: "2026-06-15T00:02:00.000Z",
        registryPath: "app-data/plugins/staged",
        sourceLabel: "Desktop runtime sandbox dry-run",
      },
      sandboxPrototypeAvailable: false,
      signedManifestCount: 1,
      updateChannelConfigured: true,
    });

    const runtimeCheck = readiness.checks.find((check) => check.id === "runtime-sandbox");
    expect(runtimeCheck?.status).toBe("warning");
    expect(runtimeCheck?.detail).toContain("1 entrypoint");
    expect(runtimeCheck?.detail).toContain("8 escape fixtures");
    expect(runtimeCheck?.detail).toContain("denied before code load");
    expect(readiness.runtimeSandboxProof?.codeExecuted).toBe(false);
    expect(readiness.runtimeSandboxProof?.allowedExecutionCount).toBe(0);
    expect(readiness.runtimeSandboxProof?.escapeAttempts).toHaveLength(8);
    expect(readiness.runtimeSandboxProof?.escapeAttempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "path-traversal-entrypoint",
          result: "blocked-before-code-load",
        }),
        expect.objectContaining({
          id: "ipc-open-shell",
          result: "blocked-before-code-load",
        }),
        expect.objectContaining({
          id: "filesystem-symlink-entrypoint",
          result: "blocked-before-code-load",
        }),
        expect.objectContaining({
          id: "manifest-nested-path-escape",
          result: "blocked-before-code-load",
        }),
        expect.objectContaining({
          id: "ipc-network-fetch",
          result: "blocked-before-code-load",
        }),
        expect.objectContaining({
          id: "permission-process-spawn",
          result: "blocked-before-code-load",
        }),
      ]),
    );
    expect(readiness.blockedCount).toBe(0);
    expect(readiness.statusLabel).toBe("Needs hardening");
  });

  it("treats update signing review evidence as signature review without auto-install", () => {
    const readiness = buildPluginSystemReadiness({
      disabledRegistryAudit: {
        auditedAt: "2026-06-15T00:00:00.000Z",
        entries: [
          {
            entrypoint: "dist/main.js",
            fileCount: 1,
            issues: [],
            keyId: "local-trusted",
            pluginId: "verified-plugin",
            registryPath: "app-data/plugins/staged/verified-plugin/1.0.0",
            signatureIssuer: "Local Test CA",
            status: "disabled-audited",
            version: "1.0.0",
          },
        ],
        failedCount: 0,
        passedCount: 1,
        registryPath: "app-data/plugins/staged",
        sourceLabel: "Desktop disabled registry audit",
      },
      hostedMarketplaceConfigured: true,
      localDiscoveryConfigured: true,
      manifestCount: 1,
      permissionReviewConfigured: true,
      runtimeSandboxProof: {
        allowedExecutionCount: 0,
        auditFailedCount: 0,
        auditPassedCount: 1,
        codeExecuted: false,
        deniedEntrypointCount: 1,
        entries: [
          {
            denyReason:
              "Process sandbox runtime is not implemented; plugin entrypoint denied before code load.",
            entrypoint: "dist/main.js",
            issues: [],
            pluginId: "verified-plugin",
            registryPath: "app-data/plugins/staged/verified-plugin/1.0.0",
            status: "runtime-blocked",
            version: "1.0.0",
          },
        ],
        escapeAttempts: createRuntimeSandboxEscapeAttempts(),
        ipcAllowlistReady: false,
        permissionGrantReady: false,
        processBoundaryReady: false,
        provedAt: "2026-06-15T00:02:00.000Z",
        registryPath: "app-data/plugins/staged",
        sourceLabel: "Desktop runtime sandbox dry-run",
      },
      sandboxPrototypeAvailable: false,
      signedManifestCount: 1,
      updateChannelConfigured: false,
      updateSigningReview: {
        autoInstallBlocked: true,
        entries: [
          {
            autoInstall: false,
            channel: "stable",
            currentVersion: "0.3.1",
            issues: [],
            manifestHash: "sha256:4cf2b18ef5a01fd7d7dd2db638a4e03c4d5f52d20c0114db1ef0d3d47f88a75a",
            pluginId: "verified-plugin",
            proposedVersion: "0.3.2",
            rollbackVersion: "0.3.1",
            signatureIssuer: "OG Launcher Local Test CA",
            status: "review-only",
          },
        ],
        manifestHashReady: true,
        reviewedAt: "2026-06-15T00:05:00.000Z",
        rollbackPlanReady: true,
        signatureVerifiedCount: 1,
        sourceLabel: "Local update signing review fixture",
      },
    });

    const updateCheck = readiness.checks.find((check) => check.id === "update-signing");
    expect(updateCheck?.status).toBe("ready");
    expect(updateCheck?.detail).toContain("1 signed update envelope");
    expect(updateCheck?.detail).toContain("auto-install blocked");
    expect(readiness.updateSigningReview?.autoInstallBlocked).toBe(true);
    expect(readiness.updateSigningReview?.entries[0]).toEqual(
      expect.objectContaining({
        autoInstall: false,
        status: "review-only",
      }),
    );
    expect(readiness.blockedCount).toBe(0);
    expect(readiness.warningCount).toBe(2);
    expect(readiness.statusLabel).toBe("Needs hardening");
  });

  it("blocks update signing when review evidence enables install or contains issues", () => {
    const readiness = buildPluginSystemReadiness({
      hostedMarketplaceConfigured: true,
      localDiscoveryConfigured: true,
      manifestCount: 1,
      permissionReviewConfigured: true,
      sandboxPrototypeAvailable: true,
      signedManifestCount: 1,
      updateChannelConfigured: false,
      updateSigningReview: {
        autoInstallBlocked: false,
        entries: [
          {
            autoInstall: true,
            channel: "stable",
            currentVersion: "0.3.1",
            issues: ["Auto-install must remain blocked for local update review."],
            manifestHash: "",
            pluginId: "unsafe-update",
            proposedVersion: "0.3.2",
            rollbackVersion: null,
            signatureIssuer: "Unknown",
            status: "blocked",
          },
        ],
        manifestHashReady: false,
        reviewedAt: "2026-06-15T00:05:00.000Z",
        rollbackPlanReady: false,
        signatureVerifiedCount: 0,
        sourceLabel: "Unsafe update review",
      },
    });

    const updateCheck = readiness.checks.find((check) => check.id === "update-signing");
    expect(updateCheck?.status).toBe("blocked");
    expect(updateCheck?.detail).toContain("unsafe update review");
    expect(readiness.nextAction).toBe(
      "Fix update signing review evidence before any plugin update work.",
    );
  });

  it("builds a deterministic plugin update signing verify fixture", () => {
    const readiness = createVerifyPluginUpdateSigningReadiness();

    expect(readiness.updateSigningReview).toEqual(
      expect.objectContaining({
        autoInstallBlocked: true,
        manifestHashReady: true,
        rollbackPlanReady: true,
        signatureVerifiedCount: 1,
      }),
    );
    expect(readiness.checks.find((check) => check.id === "update-signing")?.status).toBe("ready");
    expect(readiness.statusLabel).toBe("Local only");
    expect(readiness.blockedCount).toBe(1);
    expect(readiness.progress).toBe(78);
  });

  it("builds a deterministic runtime sandbox escape fixture matrix", () => {
    const readiness = createVerifyPluginRuntimeSandboxReadiness();
    const runtimeCheck = readiness.checks.find((check) => check.id === "runtime-sandbox");

    expect(runtimeCheck?.status).toBe("warning");
    expect(runtimeCheck?.detail).toContain("8 escape fixtures");
    expect(readiness.runtimeSandboxProof).toEqual(
      expect.objectContaining({
        allowedExecutionCount: 0,
        codeExecuted: false,
        deniedEntrypointCount: 1,
        escapeAttempts: expect.arrayContaining([
          expect.objectContaining({
            id: "path-traversal-entrypoint",
            payload: "../secrets/token.txt",
            result: "blocked-before-code-load",
          }),
          expect.objectContaining({
            id: "ipc-open-shell",
            payload: "tauri.invoke('open_shell')",
            result: "blocked-before-code-load",
          }),
          expect.objectContaining({
            id: "filesystem-symlink-entrypoint",
            payload: "dist/linked-main.js -> /tmp/escape.js",
            result: "blocked-before-code-load",
          }),
          expect.objectContaining({
            id: "manifest-nested-path-escape",
            payload: "plugins/../manifest.json",
            result: "blocked-before-code-load",
          }),
          expect.objectContaining({
            id: "ipc-network-fetch",
            payload: "tauri.invoke('fetch_url', 'https://plugins.example')",
            result: "blocked-before-code-load",
          }),
          expect.objectContaining({
            id: "permission-process-spawn",
            payload: "process:spawn",
            result: "blocked-before-code-load",
          }),
        ]),
      }),
    );
    expect(readiness.runtimeSandboxProof?.escapeAttempts).toHaveLength(8);
    expect(readiness.blockedCount).toBe(1);
    expect(readiness.statusLabel).toBe("Local only");
  });

  it("treats signed marketplace/update index trust as review-only marketplace evidence", () => {
    const readiness = buildPluginSystemReadiness({
      hostedMarketplaceConfigured: false,
      localDiscoveryConfigured: true,
      manifestCount: 1,
      marketplaceTrust: {
        autoUpdateAllowed: false,
        blockedCount: 0,
        catalogEntryCount: 1,
        downloadAllowed: false,
        entries: [
          {
            channel: "stable",
            issues: [],
            manifestHash: "sha256:4cf2b18ef5a01fd7d7dd2db638a4e03c4d5f52d20c0114db1ef0d3d47f88a75a",
            moderationStatus: "approved",
            pluginId: "verified-plugin",
            registryStatus: "disabled-audited",
            revoked: false,
            status: "trusted-disabled-match",
            version: "0.3.2",
          },
        ],
        indexPath: "/tmp/og-plugin-index.json",
        installAllowed: false,
        matchedDisabledPackageCount: 1,
        registryPath: "app-data/plugins/staged",
        reviewedAt: "2026-06-15T00:08:00.000Z",
        revokedCount: 0,
        signatureIssuer: "OG Launcher Local Test CA",
        signatureKeyId: "local-trusted",
        signatureVerified: true,
        sourceLabel: "Local signed marketplace/update index review fixture",
      },
      permissionReviewConfigured: true,
      runtimeSandboxProof: {
        allowedExecutionCount: 0,
        auditFailedCount: 0,
        auditPassedCount: 1,
        codeExecuted: false,
        deniedEntrypointCount: 1,
        entries: [
          {
            denyReason:
              "Process sandbox runtime is not implemented; plugin entrypoint denied before code load.",
            entrypoint: "dist/main.js",
            issues: [],
            pluginId: "verified-plugin",
            registryPath: "app-data/plugins/staged/verified-plugin/0.3.2",
            status: "runtime-blocked",
            version: "0.3.2",
          },
        ],
        escapeAttempts: createRuntimeSandboxEscapeAttempts(),
        ipcAllowlistReady: false,
        permissionGrantReady: false,
        processBoundaryReady: false,
        provedAt: "2026-06-15T00:02:00.000Z",
        registryPath: "app-data/plugins/staged",
        sourceLabel: "Desktop runtime sandbox dry-run",
      },
      sandboxPrototypeAvailable: false,
      signedManifestCount: 1,
      updateChannelConfigured: false,
      updateSigningReview: {
        autoInstallBlocked: true,
        entries: [
          {
            autoInstall: false,
            channel: "stable",
            currentVersion: "0.3.1",
            issues: [],
            manifestHash: "sha256:4cf2b18ef5a01fd7d7dd2db638a4e03c4d5f52d20c0114db1ef0d3d47f88a75a",
            pluginId: "verified-plugin",
            proposedVersion: "0.3.2",
            rollbackVersion: "0.3.1",
            signatureIssuer: "OG Launcher Local Test CA",
            status: "review-only",
          },
        ],
        manifestHashReady: true,
        reviewedAt: "2026-06-15T00:05:00.000Z",
        rollbackPlanReady: true,
        signatureVerifiedCount: 1,
        sourceLabel: "Local update signing review fixture",
      },
    });

    const marketplaceCheck = readiness.checks.find((check) => check.id === "marketplace");
    expect(marketplaceCheck?.status).toBe("warning");
    expect(marketplaceCheck?.detail).toContain("1 signed marketplace/update index");
    expect(marketplaceCheck?.detail).toContain("downloads and installs blocked");
    expect(readiness.marketplaceTrust?.signatureVerified).toBe(true);
    expect(readiness.marketplaceTrust?.downloadAllowed).toBe(false);
    expect(readiness.marketplaceTrust?.installAllowed).toBe(false);
    expect(readiness.marketplaceTrust?.autoUpdateAllowed).toBe(false);
    expect(readiness.blockedCount).toBe(0);
    expect(readiness.statusLabel).toBe("Needs hardening");
  });

  it("blocks marketplace trust when signed index evidence is unsafe", () => {
    const readiness = buildPluginSystemReadiness({
      hostedMarketplaceConfigured: false,
      localDiscoveryConfigured: true,
      manifestCount: 1,
      marketplaceTrust: {
        autoUpdateAllowed: false,
        blockedCount: 1,
        catalogEntryCount: 1,
        downloadAllowed: true,
        entries: [
          {
            channel: "stable",
            issues: ["Marketplace trust review must not allow downloads."],
            manifestHash: "sha256:unsafe",
            moderationStatus: "approved",
            pluginId: "unsafe-plugin",
            registryStatus: "missing",
            revoked: false,
            status: "blocked",
            version: "1.0.0",
          },
        ],
        indexPath: "/tmp/unsafe-index.json",
        installAllowed: false,
        matchedDisabledPackageCount: 0,
        registryPath: "app-data/plugins/staged",
        reviewedAt: "2026-06-15T00:08:00.000Z",
        revokedCount: 0,
        signatureIssuer: "Unknown",
        signatureKeyId: "unknown",
        signatureVerified: false,
        sourceLabel: "Unsafe marketplace trust review",
      },
      permissionReviewConfigured: true,
      sandboxPrototypeAvailable: true,
      signedManifestCount: 1,
      updateChannelConfigured: true,
    });

    const marketplaceCheck = readiness.checks.find((check) => check.id === "marketplace");
    expect(marketplaceCheck?.status).toBe("blocked");
    expect(marketplaceCheck?.detail).toContain("unsafe marketplace trust evidence");
    expect(readiness.nextAction).toBe(
      "Fix signed marketplace/update index evidence before any marketplace work.",
    );
  });

  it("builds a deterministic plugin marketplace update-signing trust fixture", () => {
    const readiness = createVerifyPluginMarketplaceUpdateIndexTrustReadiness();

    expect(readiness.marketplaceTrust).toEqual(
      expect.objectContaining({
        autoUpdateAllowed: false,
        downloadAllowed: false,
        installAllowed: false,
        matchedDisabledPackageCount: 1,
        signatureVerified: true,
      }),
    );
    expect(readiness.checks.find((check) => check.id === "marketplace")?.status).toBe("warning");
    expect(readiness.blockedCount).toBe(0);
    expect(readiness.statusLabel).toBe("Needs hardening");
  });

  it("keeps runtime sandbox blocked when dry-run proof is unsafe or incomplete", () => {
    const readiness = buildPluginSystemReadiness({
      hostedMarketplaceConfigured: true,
      localDiscoveryConfigured: true,
      manifestCount: 1,
      permissionReviewConfigured: true,
      runtimeSandboxProof: {
        allowedExecutionCount: 1,
        auditFailedCount: 0,
        auditPassedCount: 1,
        codeExecuted: true,
        deniedEntrypointCount: 0,
        entries: [
          {
            denyReason: "Unsafe proof claimed execution.",
            entrypoint: "dist/main.js",
            issues: ["Runtime dry-run must not execute plugin code."],
            pluginId: "unsafe-plugin",
            registryPath: "app-data/plugins/staged/unsafe-plugin/1.0.0",
            status: "runtime-allowed",
            version: "1.0.0",
          },
        ],
        escapeAttempts: createRuntimeSandboxEscapeAttempts(),
        ipcAllowlistReady: false,
        permissionGrantReady: false,
        processBoundaryReady: false,
        provedAt: "2026-06-15T00:02:00.000Z",
        registryPath: "app-data/plugins/staged",
        sourceLabel: "Unsafe runtime proof",
      },
      sandboxPrototypeAvailable: false,
      signedManifestCount: 1,
      updateChannelConfigured: true,
    });

    const runtimeCheck = readiness.checks.find((check) => check.id === "runtime-sandbox");
    expect(runtimeCheck?.status).toBe("blocked");
    expect(runtimeCheck?.detail).toContain("unsafe runtime dry-run");
    expect(readiness.nextAction).toBe(
      "Fix runtime dry-run evidence before any plugin admission work.",
    );
  });

  it("blocks runtime sandbox admission when the escape fixture matrix is partial", () => {
    const readiness = buildRuntimeReadinessWithProof(
      createRuntimeSandboxProof({
        escapeAttempts: createRuntimeSandboxEscapeAttempts().slice(0, -1),
      }),
    );

    const runtimeCheck = readiness.checks.find((check) => check.id === "runtime-sandbox");
    expect(runtimeCheck?.status).toBe("blocked");
    expect(runtimeCheck?.detail).toContain("unsafe runtime dry-run");
    expect(readiness.nextAction).toBe(
      "Fix runtime dry-run evidence before any plugin admission work.",
    );
  });

  it("blocks runtime sandbox admission when escape fixture ids are duplicate or unknown", () => {
    const duplicateAttempts = createRuntimeSandboxEscapeAttempts();
    duplicateAttempts[duplicateAttempts.length - 1] = { ...duplicateAttempts[0] };

    const unknownAttempts = createRuntimeSandboxEscapeAttempts();
    unknownAttempts[0] = {
      ...unknownAttempts[0],
      id: "unknown-runtime-escape",
    };

    for (const escapeAttempts of [duplicateAttempts, unknownAttempts]) {
      const readiness = buildRuntimeReadinessWithProof(
        createRuntimeSandboxProof({ escapeAttempts }),
      );
      const runtimeCheck = readiness.checks.find((check) => check.id === "runtime-sandbox");

      expect(runtimeCheck?.status).toBe("blocked");
      expect(readiness.nextAction).toBe(
        "Fix runtime dry-run evidence before any plugin admission work.",
      );
    }
  });

  it("blocks runtime sandbox admission when proof counters do not match denied entries", () => {
    const readiness = buildRuntimeReadinessWithProof(
      createRuntimeSandboxProof({
        auditPassedCount: 2,
      }),
    );

    const runtimeCheck = readiness.checks.find((check) => check.id === "runtime-sandbox");
    expect(runtimeCheck?.status).toBe("blocked");
    expect(readiness.nextAction).toBe(
      "Fix runtime dry-run evidence before any plugin admission work.",
    );
  });

  it("blocks runtime sandbox admission when a dry-run proof claims runtime capability readiness", () => {
    const readiness = buildRuntimeReadinessWithProof(
      createRuntimeSandboxProof({
        ipcAllowlistReady: true,
        permissionGrantReady: true,
        processBoundaryReady: true,
      }),
    );

    const runtimeCheck = readiness.checks.find((check) => check.id === "runtime-sandbox");
    expect(runtimeCheck?.status).toBe("blocked");
    expect(readiness.nextAction).toBe(
      "Fix runtime dry-run evidence before any plugin admission work.",
    );
  });

  it("blocks runtime sandbox admission when runtime-blocked entries omit admission fields", () => {
    const proof = createRuntimeSandboxProof();
    const readiness = buildRuntimeReadinessWithProof(
      createRuntimeSandboxProof({
        entries: [
          {
            ...proof.entries[0],
            denyReason: "",
          },
        ],
      }),
    );

    const runtimeCheck = readiness.checks.find((check) => check.id === "runtime-sandbox");
    expect(runtimeCheck?.status).toBe("blocked");
    expect(readiness.nextAction).toBe(
      "Fix runtime dry-run evidence before any plugin admission work.",
    );
  });

  it("keeps failed disabled registry audits out of package trust readiness", () => {
    const readiness = buildPluginSystemReadiness({
      disabledRegistryAudit: {
        auditedAt: "2026-06-15T00:00:00.000Z",
        entries: [
          {
            entrypoint: "dist/main.js",
            fileCount: 1,
            issues: ["Plugin registry stage record must remain disabled."],
            keyId: "local-trusted",
            pluginId: "enabled-plugin",
            registryPath: "app-data/plugins/staged/enabled-plugin/1.0.0",
            signatureIssuer: "Local Test CA",
            status: "blocked",
            version: "1.0.0",
          },
        ],
        failedCount: 1,
        passedCount: 0,
        registryPath: "app-data/plugins/staged",
        sourceLabel: "Desktop disabled registry audit",
      },
      hostedMarketplaceConfigured: true,
      localDiscoveryConfigured: true,
      manifestCount: 1,
      permissionReviewConfigured: true,
      sandboxPrototypeAvailable: true,
      signedManifestCount: 1,
      updateChannelConfigured: true,
    });

    expect(readiness.checks.find((check) => check.id === "signed-package-staging")?.status).toBe(
      "blocked",
    );
    expect(readiness.checks.find((check) => check.id === "disabled-registry-audit")?.status).toBe(
      "blocked",
    );
    expect(readiness.nextAction).toBe(
      "Fix blocked disabled registry audit entries before runtime work.",
    );
  });

  it("marks staged review ready only when every gate has evidence", () => {
    const readiness = buildPluginSystemReadiness({
      hostedMarketplaceConfigured: true,
      localDiscoveryConfigured: true,
      manifestCount: 2,
      permissionReviewConfigured: true,
      sandboxPrototypeAvailable: true,
      signedManifestCount: 2,
      stagedSignedPackages: [
        {
          detail: "Verified local package.",
          entrypoint: "dist/main.js",
          fileCount: 1,
          keyId: "local-trusted",
          pluginId: "verified-plugin",
          registryPath: "app-data/plugins/staged/verified-plugin/1.0.0",
          signatureIssuer: "Local Test CA",
          status: "disabled",
          version: "1.0.0",
        },
      ],
      disabledRegistryAudit: {
        auditedAt: "2026-06-15T00:00:00.000Z",
        entries: [
          {
            entrypoint: "dist/main.js",
            fileCount: 1,
            issues: [],
            keyId: "local-trusted",
            pluginId: "verified-plugin",
            registryPath: "app-data/plugins/staged/verified-plugin/1.0.0",
            signatureIssuer: "Local Test CA",
            status: "disabled-audited",
            version: "1.0.0",
          },
        ],
        failedCount: 0,
        passedCount: 1,
        registryPath: "app-data/plugins/staged",
        sourceLabel: "Desktop disabled registry audit",
      },
      updateChannelConfigured: true,
    });

    expect(readiness.blockedCount).toBe(0);
    expect(readiness.warningCount).toBe(2);
    expect(readiness.statusLabel).toBe("Needs hardening");
    expect(readiness.progress).toBe(78);
  });

  it("reviews manifest schema, permissions, theme hooks, and signature metadata", () => {
    const readiness = buildPluginSystemReadiness({
      hostedMarketplaceConfigured: false,
      localDiscoveryConfigured: true,
      manifests: [
        {
          entrypoint: "plugin.js",
          id: "signed-plugin",
          name: "Signed Plugin",
          permissions: [],
          signed: true,
          signatureIssuer: "Local Test CA",
          themeHooks: [],
          updateChannel: "disabled",
          version: "1.0.0",
        },
        {
          entrypoint: "",
          id: "broken-plugin",
          name: "Broken Plugin",
          permissions: ["downloads:write", "process:spawn", "downloads:write"],
          signed: false,
          themeHooks: ["store-card"],
          version: "0.1.0",
        },
      ],
      manifestCount: 0,
      permissionReviewConfigured: true,
      sandboxPrototypeAvailable: false,
      signedManifestCount: 0,
      updateChannelConfigured: false,
    });

    expect(readiness.manifestReviews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "signed-plugin",
          signatureLabel: "Signed by Local Test CA",
          status: "ready",
          statusLabel: "Ready",
        }),
        expect.objectContaining({
          deniedPermissions: ["process:spawn"],
          detail: "Manifest policy issue: entrypoint.",
          id: "broken-plugin",
          permissions: ["downloads:write", "process:spawn"],
          schemaIssues: ["entrypoint"],
          status: "blocked",
          statusLabel: "Needs schema",
          themeHooks: ["store-card"],
        }),
      ]),
    );
    expect(readiness.permissionLedger).toEqual([
      {
        count: 1,
        detail: "1 manifest request downloads:write; approval remains manual and deny-by-default.",
        id: "downloads:write",
        label: "downloads:write",
        status: "warning",
      },
      {
        count: 1,
        detail: "1 manifest request process:spawn; approval remains manual and deny-by-default.",
        id: "process:spawn",
        label: "process:spawn",
        status: "warning",
      },
    ]);
    expect(readiness.policyLedger.find((item) => item.id === "permission-denials")?.status).toBe(
      "warning",
    );
  });

  it("parses local plugin manifest import payloads without unknown fields", () => {
    const payload = createPluginManifestImportPayload([
      {
        entrypoint: "dist/main.js",
        id: "local-import-demo",
        name: "Local Import Demo",
        permissions: ["library:read", "process:spawn", "library:read"],
        signed: true,
        signatureIssuer: "Local Test CA",
        themeHooks: ["profile-card"],
        updateChannel: "disabled",
        version: "1.0.0",
      },
    ]);

    const manifests = parsePluginManifestImportPayload(
      JSON.stringify({
        ...payload,
        manifests: [{ ...payload.manifests[0], executes: "never" }],
      }),
    );

    expect(manifests).toEqual([
      {
        entrypoint: "dist/main.js",
        id: "local-import-demo",
        name: "Local Import Demo",
        permissions: ["library:read", "process:spawn"],
        signed: true,
        signatureIssuer: "Local Test CA",
        themeHooks: ["profile-card"],
        updateChannel: "disabled",
        version: "1.0.0",
      },
    ]);

    const readiness = buildPluginSystemReadiness({
      hostedMarketplaceConfigured: false,
      localDiscoveryConfigured: true,
      manifests,
      manifestCount: 0,
      permissionReviewConfigured: true,
      sandboxPrototypeAvailable: false,
      signedManifestCount: 0,
      updateChannelConfigured: false,
    });

    expect(readiness.manifestReviews[0].deniedPermissions).toEqual(["process:spawn"]);
    expect(readiness.guardCopy).toContain("It does not load, execute, enable");
  });

  it("rejects unsupported plugin manifest import payloads", () => {
    expect(() => parsePluginManifestImportPayload("{broken")).toThrow(
      "Plugin manifest import must be valid JSON.",
    );
    expect(() =>
      parsePluginManifestImportPayload(
        JSON.stringify({ manifests: [], schema: "other", version: 1 }),
      ),
    ).toThrow("Plugin manifest import schema is not supported.");
  });
});
