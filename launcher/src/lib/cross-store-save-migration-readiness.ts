export type CrossStoreSaveMigrationReadinessStatus = "blocked" | "ready" | "warning";

export interface CrossStoreSaveMigrationReadinessInput {
  conflictAuditReady: boolean;
  dryRunAuditReady: boolean;
  keychainRestoreReady: boolean;
  localPlanReady: boolean;
  localSandboxProofReady: boolean;
  migrationSessionRehearsalReady: boolean;
  nativeCopyEngineReady: boolean;
  pathMappingReady: boolean;
  providerCatalogReady: boolean;
  providerCloudContractReady: boolean;
  providerCloudTransferReady: boolean;
  rollbackSnapshotReady: boolean;
  supabaseBucketE2EReady: boolean;
  supabaseKeychainStagingProofReady: boolean;
  variantMetadataReady: boolean;
}

export interface CrossStoreSaveMigrationReadinessGate {
  action: string;
  detail: string;
  id: string;
  label: string;
  status: CrossStoreSaveMigrationReadinessStatus;
}

export interface CrossStoreSaveKeychainRestoreRule {
  boundary: string;
  evidence: string;
  id: string;
  label: string;
}

export interface CrossStoreSaveKeychainRestoreEvidence {
  guards: string[];
  label: string;
  restoreRules: CrossStoreSaveKeychainRestoreRule[];
  status: Extract<CrossStoreSaveMigrationReadinessStatus, "warning">;
  summary: string;
}

export interface CrossStoreSaveMigrationReadiness {
  blockedCount: number;
  gates: CrossStoreSaveMigrationReadinessGate[];
  guardCopy: string;
  guards: string[];
  keychainRestoreEvidence: CrossStoreSaveKeychainRestoreEvidence | null;
  nextAction: string;
  progress: number;
  readyCount: number;
  statusLabel: string;
  summary: string;
  warningCount: number;
}

const CROSS_STORE_SAVE_MIGRATION_GUARDS = [
  "Local readiness only",
  "Dry-run audit before copy",
  "Native copy requires explicit desktop consent",
  "No automatic migration run",
  "Provider catalog coverage review only",
  "Provider cloud contract review only",
  "Provider path mapping review only",
  "Post-copy verification review only",
  "Local sandbox proof uses temp files only",
  "Migration session rehearsal review only",
  "Supabase/keychain staging proof review only",
  "No provider cloud transfer",
  "No live Supabase bucket E2E",
  "Keychain restore contract review only",
  "Rollback restore requires explicit desktop consent",
];

const CROSS_STORE_SAVE_MIGRATION_GUARD_COPY =
  "Cross-store save sync E2E review is local only. Native desktop copy and rollback now require explicit user consent, source/target root review, target snapshots, unchanged target hashes, local provider catalog coverage review, local provider cloud contract review, a temp-file local sandbox proof, migration session rehearsal review, redacted Supabase/keychain staging-contract review, keychain restore contract review, and post-copy hash verification review; this panel still does not run automatic migration, provider-approved catalog validation, auto-apply provider path mappings, transfer provider cloud saves, use a live Supabase bucket, export key material, or restore live keychain material.";

const CROSS_STORE_SAVE_KEYCHAIN_RESTORE_EVIDENCE: CrossStoreSaveKeychainRestoreEvidence = {
  guards: [
    "No key export",
    "No plaintext save secret",
    "No live keychain restore run",
    "Restore requires explicit desktop consent",
    "Bucket object handles stay redacted",
    "Provider cloud transfer stays skipped",
  ],
  label: "Keychain Restore Contract",
  restoreRules: [
    {
      boundary: "React receives only restore status labels, counts, and redacted object handles.",
      evidence: "No plaintext key, ciphertext, access token, API key, or user id is returned.",
      id: "redacted-react-boundary",
      label: "Redacted React Boundary",
    },
    {
      boundary: "Desktop command must unlock local secure storage inside Tauri before decrypting.",
      evidence:
        "The verify route documents the handoff but never asks browser state for key material.",
      id: "desktop-vault-boundary",
      label: "Desktop Vault Boundary",
    },
    {
      boundary: "Restore can only target reviewed migration sessions after live bucket E2E passes.",
      evidence:
        "Local readiness keeps provider cloud transfer and live Supabase bucket E2E blocked.",
      id: "session-consent-boundary",
      label: "Session Consent Boundary",
    },
  ],
  status: "warning",
  summary:
    "Keychain restore is local contract evidence only: the launcher reviews redaction, desktop-vault boundaries, object-handle scope, and consent requirements, but it does not export keys, decrypt live bucket objects, restore credentials, or write migrated save files.",
};

export function buildCrossStoreSaveMigrationReadiness(
  input: CrossStoreSaveMigrationReadinessInput,
): CrossStoreSaveMigrationReadiness {
  const gates: CrossStoreSaveMigrationReadinessGate[] = [
    {
      action: input.localPlanReady
        ? "Keep the local lane planner as evidence for future migration staging."
        : "Restore the local cross-store lane planner before native migration work.",
      detail: input.localPlanReady
        ? "Store variants and tracked save metadata can be reviewed in the launcher without touching files."
        : "No deterministic local source/target save plan is available.",
      id: "local-save-plan",
      label: "Local Save Plan",
      status: input.localPlanReady ? "ready" : "blocked",
    },
    {
      action: input.variantMetadataReady
        ? "Use store/source metadata as read-only fixture input for path-map design."
        : "Add store/source metadata fixtures before testing path rules.",
      detail: input.variantMetadataReady
        ? "Steam, GOG, and Epic-shaped variants are staged as local verification fixtures."
        : "Store-specific variant metadata is missing from the readiness fixture.",
      id: "variant-metadata",
      label: "Variant Metadata",
      status: input.variantMetadataReady ? "ready" : "blocked",
    },
    {
      action: input.providerCatalogReady
        ? "Keep provider catalog IDs behind local review until provider-approved coverage is staged."
        : "Stage local Steam/GOG/Epic catalog IDs before provider cloud or migration work.",
      detail: input.providerCatalogReady
        ? "Local Steam/GOG/Epic catalog IDs and source metadata are staged, but provider-approved validation is not run."
        : "No local provider catalog coverage packet exists for store variants.",
      id: "provider-catalog-coverage",
      label: "Provider Catalog Coverage",
      status: input.providerCatalogReady ? "warning" : "blocked",
    },
    {
      action: input.providerCloudContractReady
        ? "Keep provider cloud import/export contracts as review notes until provider approval exists."
        : "Draft provider cloud import/export contract requirements before cloud-transfer staging.",
      detail: input.providerCloudContractReady
        ? "Steam, GOG, and Epic cloud import/export scopes are listed locally, but no provider API is called."
        : "No local provider cloud import/export contract packet exists.",
      id: "provider-cloud-contract",
      label: "Provider Cloud Contract Packet",
      status: input.providerCloudContractReady ? "warning" : "blocked",
    },
    {
      action: input.dryRunAuditReady
        ? "Keep the dry-run audit packet as review evidence before native copy work."
        : "Add a dry-run audit packet with planned file actions, conflict IDs, and rollback preview.",
      detail: input.dryRunAuditReady
        ? "The planner renders source/target variants, planned file actions, conflict IDs, skipped mutation steps, and rollback preview without copying files."
        : "No deterministic dry-run audit packet exists for source/target save lanes.",
      id: "dry-run-audit",
      label: "Dry-Run Audit Packet",
      status: input.dryRunAuditReady ? "ready" : "blocked",
    },
    {
      action: input.nativeCopyEngineReady
        ? "Keep native copy desktop-only, consent-gated, and separated from provider path mapping."
        : "Build a native copy engine with dry-run, checksum, cancel, and permission handling.",
      detail: input.nativeCopyEngineReady
        ? "A desktop command can copy reviewed relative save files, snapshot overwritten targets, write an apply manifest, and verify SHA-256 after copy."
        : "No native file-copy engine is wired for cross-store save migration.",
      id: "native-copy-engine",
      label: "Native Copy Engine",
      status: input.nativeCopyEngineReady ? "warning" : "blocked",
    },
    {
      action: input.pathMappingReady
        ? "Keep provider path maps behind manual review and explicit consent."
        : "Define provider-specific source/destination path mapping with preview and user approval.",
      detail: input.pathMappingReady
        ? "Local mapping matrix evidence exists, but explicit user review and consent are still required before native apply."
        : "No provider-specific save path mapping is applied or validated.",
      id: "path-mapping",
      label: "Path Mapping Matrix",
      status: input.pathMappingReady ? "warning" : "blocked",
    },
    {
      action: input.providerCloudTransferReady
        ? "Keep provider cloud transfers disabled until provider contracts are approved."
        : "Stage provider-approved cloud import/export contracts before any remote transfer.",
      detail: input.providerCloudTransferReady
        ? "Provider cloud transfer evidence exists, but live transfer is disabled."
        : "No Steam/GOG/Epic/provider cloud save transfer path is implemented.",
      id: "provider-cloud-transfer",
      label: "Provider Cloud Transfer",
      status: input.providerCloudTransferReady ? "warning" : "blocked",
    },
    {
      action: input.supabaseKeychainStagingProofReady
        ? "Keep the staging proof redacted and require a real authenticated desktop run before live E2E is marked complete."
        : "Add a redacted Supabase/keychain staging contract before running live bucket E2E.",
      detail: input.supabaseKeychainStagingProofReady
        ? "A user-scoped bucket prefix, encrypted object and metadata sidecar contract, keychain no-export rule, hash verification plan, cleanup contract, and provider-transfer skip are staged for review."
        : "No redacted Supabase/keychain staging contract exists between local copy proof and live bucket E2E.",
      id: "supabase-keychain-staging-proof",
      label: "Supabase/Keychain Staging Contract",
      status: input.supabaseKeychainStagingProofReady ? "ready" : "blocked",
    },
    {
      action: input.supabaseBucketE2EReady
        ? "Keep live bucket writes behind migration rollback review."
        : "Run a live Supabase bucket E2E with upload, restore, RLS, and encryption evidence.",
      detail: input.supabaseBucketE2EReady
        ? "Supabase bucket E2E evidence exists, but it is not connected to migration."
        : "No live Supabase bucket migration E2E has been run for cross-store saves.",
      id: "supabase-bucket-e2e",
      label: "Supabase Bucket E2E",
      status: input.supabaseBucketE2EReady ? "warning" : "blocked",
    },
    {
      action: input.keychainRestoreReady
        ? "Review keychain restore boundaries without exporting keys or decrypting live bucket objects."
        : "Validate keychain unlock/restore flow before encrypted save migration staging.",
      detail: input.keychainRestoreReady
        ? "Local restore contract evidence covers redacted object handles, desktop-vault scope, no key export, and explicit migration-session consent."
        : "No keychain restore or encrypted migration credential flow is validated.",
      id: "keychain-restore",
      label: "Keychain Restore",
      status: input.keychainRestoreReady ? "warning" : "blocked",
    },
    {
      action: input.rollbackSnapshotReady
        ? "Keep rollback restore desktop-only and require unchanged target hashes before restoring."
        : "Create pre-copy snapshots and rollback verification before native copy is allowed.",
      detail: input.rollbackSnapshotReady
        ? "The native rollback command restores backed-up target files and deletes newly copied files only when the current target still matches the apply manifest."
        : "No rollback snapshot is created or restored for cross-store save migration.",
      id: "rollback-snapshot",
      label: "Rollback Restore",
      status: input.rollbackSnapshotReady ? "warning" : "blocked",
    },
    {
      action: input.localSandboxProofReady
        ? "Use the temp-file sandbox proof as local evidence before any real save migration session."
        : "Add a local sandbox proof that applies, verifies, rolls back, and cleans up temp save files.",
      detail: input.localSandboxProofReady
        ? "The native proof command creates temporary Steam/GOG save roots, applies reviewed files, verifies hashes and manifest output, rolls back restored/deleted files, and removes the sandbox without Supabase, provider cloud, or keychain access."
        : "No credential-free local sandbox proof exercises the native apply and rollback path end to end.",
      id: "local-sandbox-proof",
      label: "Local Sandbox E2E Proof",
      status: input.localSandboxProofReady ? "ready" : "blocked",
    },
    {
      action: input.conflictAuditReady
        ? "Keep post-copy conflict verification manual until real migration sessions are staged."
        : "Add conflict audit, checksum diff, user choice, and post-copy verification.",
      detail: input.conflictAuditReady
        ? "Local conflict and post-copy verification evidence exists, but auto-merge and live migration verification remain disabled."
        : "No conflict audit or post-copy verification exists for migrated saves.",
      id: "conflict-audit",
      label: "Post-Copy Conflict Audit",
      status: input.conflictAuditReady ? "warning" : "blocked",
    },
    {
      action: input.migrationSessionRehearsalReady
        ? "Keep rehearsal evidence separate from real migration-session approval."
        : "Add a local rehearsal packet before staging real user-data migration sessions.",
      detail: input.migrationSessionRehearsalReady
        ? "Local session rehearsal evidence lists consent, path-map, native apply, verification, rollback, and external blocker steps without executing a real migration."
        : "No local migration-session rehearsal packet exists.",
      id: "migration-session-rehearsal",
      label: "Migration Session Rehearsal",
      status: input.migrationSessionRehearsalReady ? "warning" : "blocked",
    },
  ];
  const readyCount = gates.filter((gate) => gate.status === "ready").length;
  const warningCount = gates.filter((gate) => gate.status === "warning").length;
  const blockedCount = gates.filter((gate) => gate.status === "blocked").length;
  const nextGate =
    gates.find((gate) => gate.status === "blocked") ??
    gates.find((gate) => gate.status === "warning") ??
    null;

  return {
    blockedCount,
    gates,
    guardCopy: CROSS_STORE_SAVE_MIGRATION_GUARD_COPY,
    guards: [...CROSS_STORE_SAVE_MIGRATION_GUARDS],
    keychainRestoreEvidence: input.keychainRestoreReady
      ? {
          ...CROSS_STORE_SAVE_KEYCHAIN_RESTORE_EVIDENCE,
          guards: [...CROSS_STORE_SAVE_KEYCHAIN_RESTORE_EVIDENCE.guards],
          restoreRules: CROSS_STORE_SAVE_KEYCHAIN_RESTORE_EVIDENCE.restoreRules.map((rule) => ({
            ...rule,
          })),
        }
      : null,
    nextAction: nextGate?.action ?? "Cross-store save migration can enter controlled staging.",
    progress: Math.round((readyCount / gates.length) * 100),
    readyCount,
    statusLabel:
      blockedCount > 0 ? "Local only" : warningCount > 0 ? "Needs staging" : "Review ready",
    summary:
      blockedCount > 0
        ? "Cross-store save sync has a local planner, provider catalog coverage packet, provider cloud contract packet, dry-run audit packet, provider path-map review matrix, consent-gated native copy proof, rollback restore proof, temp-file local sandbox E2E proof, post-copy conflict verification packet, redacted Supabase/keychain staging contract, keychain restore contract, and migration-session rehearsal packet. Provider cloud transfer, provider-approved catalog validation, live Supabase/keychain E2E, and real migration sessions remain open."
        : warningCount > 0
          ? "Cross-store migration staging evidence exists, but file mutation and provider transfer still need review."
          : "Cross-store save migration can enter controlled staging.",
    warningCount,
  };
}

export function createVerifyCrossStoreSaveMigrationReadiness(): CrossStoreSaveMigrationReadiness {
  return buildCrossStoreSaveMigrationReadiness({
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
}
