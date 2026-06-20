import { describe, expect, it } from "vitest";

import {
  buildCrossStoreSaveSyncPlan,
  createVerifyCrossStoreSaveSyncCandidates,
} from "../cross-store-save-sync-planner";
import type { Game } from "../types";

function game(overrides: Partial<Game>): Game {
  return {
    id: "steam-mech",
    title: "Mech Arcade",
    description: "Test game",
    version: "1.0.0",
    launcher: "steam",
    status: "installed",
    platform: "windows",
    ...overrides,
  };
}

describe("buildCrossStoreSaveSyncPlan", () => {
  it("plans local review lanes between installed store variants with tracked saves", () => {
    const plan = buildCrossStoreSaveSyncPlan(createVerifyCrossStoreSaveSyncCandidates());

    expect(plan.status).toBe("ready");
    expect(plan.readyLaneCount).toBeGreaterThan(0);
    expect(plan.warningLaneCount).toBeGreaterThan(0);
    expect(plan.variantCount).toBe(3);
    expect(plan.trackedSaveFileCount).toBe(3);
    expect(plan.label).toBe("Review Plan Only");
    expect(plan.audit?.id).toBe("audit-steam-mech-arcade-to-gog-mech-arcade");
    expect(plan.audit?.noCopyPerformed).toBe(true);
    expect(plan.audit?.fileActionCount).toBe(2);
    expect(plan.audit?.conflictIds).toContain("conflict-steam-slot-1-gog-slot-1");
    expect(plan.audit?.rollbackPreview.executable).toBe(false);
    expect(plan.audit?.rollbackPreview.manifestId).toBe(
      "rollback-preview-steam-mech-arcade-to-gog-mech-arcade",
    );
    expect(plan.audit?.skippedActions.map((action) => action.id)).toContain("native-copy");
    expect(plan.providerCatalogProof).toMatchObject({
      coveredVariantCount: 2,
      id: "provider-catalog-mech-arcade",
      manualReviewCount: 1,
      status: "review-ready",
      title: "Mech Arcade",
    });
    expect(plan.providerCatalogProof?.entries).toHaveLength(3);
    expect(plan.providerCatalogProof?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          catalogKey: "steam:110011",
          externalId: "110011",
          provider: "Steam",
          saveFileCount: 2,
          status: "covered",
          variantId: "steam-mech-arcade",
        }),
        expect.objectContaining({
          catalogKey: "gog:mech-arcade",
          externalId: "mech-arcade",
          provider: "GOG",
          saveFileCount: 1,
          status: "covered",
          variantId: "gog-mech-arcade",
        }),
        expect.objectContaining({
          catalogKey: "epic:mech-arcade-epic",
          externalId: "mech-arcade-epic",
          provider: "Epic",
          saveFileCount: 0,
          status: "manual_review",
          variantId: "epic-mech-arcade",
        }),
      ]),
    );
    expect(plan.providerCatalogProof?.pairings).toHaveLength(6);
    expect(plan.providerCatalogProof?.pairings).toContainEqual(
      expect.objectContaining({
        label: "Steam -> GOG",
        sourceCatalogKey: "steam:110011",
        status: "local_pair",
        targetCatalogKey: "gog:mech-arcade",
      }),
    );
    expect(plan.providerCatalogProof?.blockedAfterProof).toContain(
      "Provider-approved catalog API validation is not run.",
    );
    expect(plan.providerPathIdMappingProof).toMatchObject({
      id: "provider-path-id-mapping-mech-arcade",
      manualReviewCount: 1,
      mappedVariantCount: 2,
      status: "review-ready",
      title: "Mech Arcade",
    });
    expect(plan.providerPathIdMappingProof?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          catalogKey: "steam:110011",
          externalId: "110011",
          installPath: "C:\\Games\\Steam\\steamapps\\common\\Mech Arcade",
          provider: "Steam",
          relativePathRuleCount: 2,
          saveFileCount: 2,
          saveRoot: "C:\\Users\\Player\\Saved Games\\Mech Arcade",
          saveRootShape: "steam_userdata_remote",
          status: "mapped",
          variantId: "steam-mech-arcade",
        }),
        expect.objectContaining({
          catalogKey: "gog:mech-arcade",
          externalId: "mech-arcade",
          installPath: "C:\\Games\\GOG Galaxy\\Games\\Mech Arcade",
          provider: "GOG",
          relativePathRuleCount: 2,
          saveFileCount: 1,
          saveRoot: "C:\\Users\\Player\\Documents\\GOG Galaxy\\Mech Arcade",
          saveRootShape: "gog_documents_game_folder",
          status: "mapped",
          variantId: "gog-mech-arcade",
        }),
        expect.objectContaining({
          catalogKey: "epic:mech-arcade-epic",
          externalId: "mech-arcade-epic",
          installPath: null,
          provider: "Epic",
          relativePathRuleCount: 2,
          saveFileCount: 0,
          saveRoot: null,
          saveRootShape: "epic_localappdata_saved",
          status: "manual_review",
          variantId: "epic-mech-arcade",
        }),
      ]),
    );
    expect(plan.providerPathIdMappingProof?.entries[0].checks).toContain(
      "No provider API validates this path/id fixture.",
    );
    expect(plan.providerPathIdMappingProof?.entries[2].blockers).toEqual([
      "Install path is missing.",
      "Save root cannot be derived from tracked save files.",
      "No tracked save files are available.",
    ]);
    expect(plan.providerPathIdMappingProof?.blockedAfterProof).toContain(
      "Provider save-root discovery APIs are not called.",
    );
    expect(plan.providerCloudContractProof).toMatchObject({
      id: "provider-cloud-contract-mech-arcade",
      requiredContractCount: 6,
      status: "blocked-contract",
      title: "Mech Arcade",
    });
    expect(plan.providerCloudContractProof?.entries).toHaveLength(3);
    expect(plan.providerCloudContractProof?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountScope: expect.stringContaining("Steam user auth"),
          catalogKey: "steam:110011",
          provider: "Steam",
          status: "provider_contract_required",
          variantId: "steam-mech-arcade",
        }),
        expect.objectContaining({
          accountScope: expect.stringContaining("GOG Galaxy account auth"),
          catalogKey: "gog:mech-arcade",
          provider: "GOG",
          status: "provider_contract_required",
          variantId: "gog-mech-arcade",
        }),
        expect.objectContaining({
          accountScope: expect.stringContaining("Epic/EOS user auth"),
          catalogKey: "epic:mech-arcade-epic",
          provider: "Epic",
          status: "provider_contract_required",
          variantId: "epic-mech-arcade",
        }),
      ]),
    );
    expect(plan.providerCloudContractProof?.blockedAfterProof).toContain(
      "Provider cloud save listing/export/import APIs are not called.",
    );
    expect(plan.pathMappingProof).toMatchObject({
      actionCount: 2,
      id: "path-map-steam-mech-arcade-to-gog-mech-arcade",
      sourceProvider: "Steam",
      sourceRoot: "C:\\Users\\Player\\Saved Games\\Mech Arcade",
      status: "review-ready",
      targetProvider: "GOG",
      targetRoot: "C:\\Users\\Player\\Documents\\GOG Galaxy\\Mech Arcade",
    });
    expect(plan.pathMappingProof?.targetCollisionProof).toMatchObject({
      collisionCount: 0,
      collisions: [],
      noSecretsRequired: true,
      status: "unique",
    });
    expect(plan.pathMappingProof?.mappedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conflictId: "conflict-steam-slot-1-gog-slot-1",
          mappingRuleId: "steam-profile",
          sourceRelativePath: "profile.sav",
          status: "conflict_review",
          targetPath: "C:\\Users\\Player\\Documents\\GOG Galaxy\\Mech Arcade\\profile.sav",
          targetRelativePath: "profile.sav",
        }),
        expect.objectContaining({
          conflictId: null,
          mappingRuleId: "steam-settings",
          sourceRelativePath: "settings.json",
          status: "mapped",
          targetPath: "C:\\Users\\Player\\Documents\\GOG Galaxy\\Mech Arcade\\settings.json",
          targetRelativePath: "settings.json",
        }),
      ]),
    );
    expect(plan.pathMappingProof?.nativeApplyHint).toContain("reviewed file actions");
    expect(plan.nativeApplyProof).toMatchObject({
      actionCount: 2,
      consentOperation: "cross_store_save_native_copy_apply",
      label: "Native Apply Proof",
      manifestFile: "og-cross-store-save-apply.json",
      rollbackConsentOperation: "cross_store_save_native_copy_rollback",
      status: "desktop-ready",
    });
    expect(plan.nativeApplyProof?.expectedVerification).toContain(
      "Copied file size/SHA-256 match after copy",
    );
    expect(plan.nativeApplyProof?.expectedVerification).toContain(
      "Rollback blocks if target hashes changed after apply",
    );
    expect(plan.nativeApplyProof?.rollbackPolicy).toContain("deletes newly copied files");
    expect(plan.nativeApplyProof?.blockedAfterProof).toContain(
      "Provider cloud transfer is not called.",
    );
    expect(plan.automaticPathMapApplyProof).toMatchObject({
      actionCount: 2,
      consentOperation: "cross_store_save_native_copy_apply",
      id: "auto-path-map-apply-steam-mech-arcade-to-gog-mech-arcade",
      noBrowserMutation: true,
      sourceLabel: "Steam",
      status: "consent-required",
      targetLabel: "GOG",
    });
    expect(plan.automaticPathMapApplyProof?.nativeRequestTemplate).toMatchObject({
      consent: {
        accepted: false,
        actionCount: 2,
        operation: "cross_store_save_native_copy_apply",
        sourceRoot: "C:\\Users\\Player\\Saved Games\\Mech Arcade",
        targetRoot: "C:\\Users\\Player\\Documents\\GOG Galaxy\\Mech Arcade",
      },
      gameId: "steam-mech-arcade->gog-mech-arcade",
      sourceLabel: "Steam",
      sourceRoot: "C:\\Users\\Player\\Saved Games\\Mech Arcade",
      targetLabel: "GOG",
      targetRoot: "C:\\Users\\Player\\Documents\\GOG Galaxy\\Mech Arcade",
    });
    expect(plan.automaticPathMapApplyProof?.nativeRequestTemplate.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          expectedSha256: null,
          expectedSizeBytes: 1_248_000,
          sourceRelativePath: "profile.sav",
          targetRelativePath: "profile.sav",
        }),
        expect.objectContaining({
          expectedSha256: null,
          expectedSizeBytes: 32_100,
          sourceRelativePath: "settings.json",
          targetRelativePath: "settings.json",
        }),
      ]),
    );
    expect(plan.automaticPathMapApplyProof?.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mode: "overwrite_review",
          sourcePath: "C:\\Users\\Player\\Saved Games\\Mech Arcade\\profile.sav",
          sourceRelativePath: "profile.sav",
          targetPath: "C:\\Users\\Player\\Documents\\GOG Galaxy\\Mech Arcade\\profile.sav",
          targetRelativePath: "profile.sav",
        }),
        expect.objectContaining({
          mode: "copy",
          sourcePath: "C:\\Users\\Player\\Saved Games\\Mech Arcade\\settings.json",
          sourceRelativePath: "settings.json",
          targetPath: "C:\\Users\\Player\\Documents\\GOG Galaxy\\Mech Arcade\\settings.json",
          targetRelativePath: "settings.json",
        }),
      ]),
    );
    expect(plan.automaticPathMapApplyProof?.blockedAfterProof).toContain(
      "Desktop user consent is still required before any native copy.",
    );
    expect(plan.postCopyVerificationProof).toMatchObject({
      actionCount: 2,
      conflictCount: 1,
      expectedManifestFile: "og-cross-store-save-apply.json",
      id: "post-copy-steam-mech-arcade-to-gog-mech-arcade",
      rollbackGuardCount: 2,
      status: "review-ready",
    });
    expect(plan.postCopyVerificationProof?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conflictId: "conflict-steam-slot-1-gog-slot-1",
          expectedTargetPath: "C:\\Users\\Player\\Documents\\GOG Galaxy\\Mech Arcade\\profile.sav",
          sourceRelativePath: "profile.sav",
          status: "overwrite_snapshot_review",
          targetRelativePath: "profile.sav",
        }),
        expect.objectContaining({
          conflictId: null,
          expectedTargetPath:
            "C:\\Users\\Player\\Documents\\GOG Galaxy\\Mech Arcade\\settings.json",
          sourceRelativePath: "settings.json",
          status: "hash_review",
          targetRelativePath: "settings.json",
        }),
      ]),
    );
    expect(plan.postCopyVerificationProof?.items[0].checks).toContain(
      "Pre-copy target snapshot exists before overwrite review.",
    );
    expect(plan.postCopyVerificationProof?.items[1].checks).toContain(
      "Post-copy target size and SHA-256 match the reviewed source file.",
    );
    expect(plan.postCopyVerificationProof?.blockedAfterProof).toContain(
      "Live Supabase/keychain bucket E2E is still not run.",
    );
    expect(plan.supabaseKeychainStagingProof).toMatchObject({
      bucketName: "game-saves",
      consentOperation: "cross_store_save_supabase_keychain_staging_proof",
      encryptedObjectCount: 2,
      hashVerificationCount: 2,
      id: "supabase-keychain-staging-steam-mech-arcade-to-gog-mech-arcade",
      keychainOperation: "get_or_create_user_keyring_key",
      metadataSidecarCount: 2,
      noKeyExport: true,
      providerTransferSkipped: true,
      sourceLabel: "Steam",
      status: "staging-contract",
      targetLabel: "GOG",
      title: "Mech Arcade",
    });
    expect(plan.supabaseKeychainStagingProof?.objectPrefix).toBe(
      "auth.uid()/cross-store-save-staging/mech-arcade/<redacted-proof>/",
    );
    expect(plan.supabaseKeychainStagingProof?.guard).toContain(
      "does not upload, download, decrypt, restore, or delete live bucket objects",
    );
    expect(plan.supabaseKeychainStagingProof?.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "keychain-redaction",
          status: "staging_contract",
        }),
        expect.objectContaining({
          id: "provider-transfer-skipped",
          status: "live_blocked",
        }),
        expect.objectContaining({
          id: "live-run-blocked",
          status: "live_blocked",
        }),
      ]),
    );
    expect(plan.supabaseKeychainStagingProof?.blockedAfterProof).toContain(
      "Live Supabase bucket E2E must run through the desktop command with a real authenticated user.",
    );
    expect(plan.migrationSessionRehearsalProof).toMatchObject({
      blockedStepCount: 3,
      id: "migration-session-rehearsal-steam-mech-arcade-to-gog-mech-arcade",
      localEvidenceCount: 9,
      sourceLabel: "Steam",
      status: "rehearsal-only",
      targetLabel: "GOG",
      title: "Mech Arcade",
    });
    expect(plan.migrationSessionRehearsalProof?.summary).toContain("Steam -> GOG");
    expect(plan.migrationSessionRehearsalProof?.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "provider-path-id-fixtures",
          status: "local_evidence",
        }),
        expect.objectContaining({
          id: "native-apply-consent",
          status: "local_evidence",
        }),
        expect.objectContaining({
          id: "automatic-path-map-apply-template",
          status: "local_evidence",
        }),
        expect.objectContaining({
          id: "supabase-keychain-staging-contract",
          status: "local_evidence",
        }),
        expect.objectContaining({
          id: "provider-transfer-execution",
          status: "external_blocked",
        }),
        expect.objectContaining({
          id: "real-user-session",
          status: "external_blocked",
        }),
      ]),
    );
    expect(plan.migrationSessionRehearsalProof?.blockedAfterProof).toContain(
      "Real user-data migration sessions are still not executed.",
    );
    expect(plan.guards).toContain("Dry-run audit before copy");
    expect(plan.guards).toContain("Native copy requires explicit desktop consent");
    expect(plan.guards).toContain("No automatic save migration");
    expect(plan.guards).toContain("No browser file mutation");
    expect(plan.guards).toContain("No provider cloud transfer");
    expect(plan.guards).toContain("Provider cloud contract review only");
    expect(plan.guards).toContain("Provider catalog coverage review only");
    expect(plan.guards).toContain("Provider path/id fixture review only");
    expect(plan.guards).toContain("Automatic path-map apply is consent-gated");
    expect(plan.guards).toContain("Post-copy verification review only");
    expect(plan.guards).toContain("Supabase/keychain staging proof review only");
    expect(plan.guards).toContain("Migration session rehearsal review only");
    expect(plan.guards).toContain("No automatic rollback execution");
    expect(plan.guards).toContain("No live Supabase/keychain bucket E2E");
    expect(plan.lanes.some((lane) => lane.summary.includes("Steam -> GOG"))).toBe(true);
    expect(plan.lanes.some((lane) => lane.summary.includes("no files will be copied"))).toBe(true);
  });

  it("blocks when there is only one store variant", () => {
    const plan = buildCrossStoreSaveSyncPlan([
      game({
        saveFiles: [
          {
            id: "save-1",
            path: "C:\\Users\\Player\\Saved Games\\Mech Arcade\\profile.sav",
          },
        ],
      }),
    ]);

    expect(plan.status).toBe("blocked");
    expect(plan.blockers).toContain("At least two store variants are required.");
    expect(plan.readyLaneCount).toBe(0);
    expect(plan.audit).toBeNull();
    expect(plan.providerCatalogProof?.entries).toHaveLength(1);
    expect(plan.providerPathIdMappingProof?.entries).toHaveLength(1);
    expect(plan.providerPathIdMappingProof?.entries[0]).toMatchObject({
      saveRoot: "C:\\Users\\Player\\Saved Games\\Mech Arcade",
      saveRootShape: "steam_userdata_remote",
      status: "manual_review",
    });
    expect(plan.providerCloudContractProof?.entries).toHaveLength(1);
    expect(plan.pathMappingProof).toBeNull();
    expect(plan.nativeApplyProof).toBeNull();
    expect(plan.automaticPathMapApplyProof).toBeNull();
    expect(plan.postCopyVerificationProof).toBeNull();
    expect(plan.supabaseKeychainStagingProof).toBeNull();
    expect(plan.migrationSessionRehearsalProof).toBeNull();
  });

  it("blocks duplicate target-relative-path collisions for duplicate basenames in source folders", () => {
    const plan = buildCrossStoreSaveSyncPlan([
      game({
        id: "steam-mech",
        launcher: "steam",
        installPath: "C:\\Steam\\Mech Arcade",
        saveFiles: [
          {
            id: "slot-a",
            label: "Profile A",
            path: "C:\\Users\\Player\\Saved Games\\Mech Arcade\\slot-a\\profile.sav",
            sizeBytes: 100,
          },
          {
            id: "slot-b",
            label: "Profile B",
            path: "C:\\Users\\Player\\Saved Games\\Mech Arcade\\slot-b\\profile.sav",
            sizeBytes: 120,
          },
        ],
      }),
      game({
        id: "gog-mech",
        launcher: "gog",
        installPath: "D:\\GOG\\Mech Arcade",
        saveFiles: [
          {
            id: "gog-profile",
            label: "GOG Profile",
            path: "D:\\GOG\\Mech Arcade\\Saves\\profile.sav",
            sizeBytes: 90,
          },
        ],
      }),
    ]);

    expect(plan.status).toBe("blocked");
    expect(plan.blockers).toContain("Duplicate targetRelativePath mapping blocked: profile.sav.");
    expect(plan.warnings).toContain(
      "Resolve duplicate targetRelativePath values before any desktop consent or native copy.",
    );
    expect(plan.audit?.conflictCount).toBe(2);
    expect(plan.pathMappingProof?.mappedActions.map((action) => action.sourceRelativePath)).toEqual(
      ["slot-a/profile.sav", "slot-b/profile.sav"],
    );
    expect(plan.pathMappingProof?.mappedActions.map((action) => action.targetRelativePath)).toEqual(
      ["profile.sav", "profile.sav"],
    );
    expect(
      plan.pathMappingProof?.mappedActions.every((action) => action.status === "conflict_review"),
    ).toBe(true);
    expect(plan.pathMappingProof?.targetCollisionProof).toMatchObject({
      collisionCount: 1,
      noSecretsRequired: true,
      status: "blocked",
    });
    const collision = plan.pathMappingProof?.targetCollisionProof.collisions[0];
    expect(collision).toMatchObject({
      labels: ["Profile A", "Profile B"],
      sourceRelativePaths: ["slot-a/profile.sav", "slot-b/profile.sav"],
      targetRelativePath: "profile.sav",
    });
    expect(collision).not.toHaveProperty("sourcePath");
    expect(collision).not.toHaveProperty("targetPath");
    expect(plan.nativeApplyProof).toBeNull();
    expect(plan.automaticPathMapApplyProof).toBeNull();
    expect(plan.postCopyVerificationProof).toBeNull();
    expect(plan.supabaseKeychainStagingProof).toBeNull();
    expect(plan.migrationSessionRehearsalProof).toBeNull();
  });

  it("keeps not-installed targets as warning-only local lanes", () => {
    const plan = buildCrossStoreSaveSyncPlan([
      game({
        id: "steam-mech",
        launcher: "steam",
        installPath: "C:\\Steam\\Mech Arcade",
        saveFiles: [
          {
            id: "save-1",
            path: "C:\\Users\\Player\\Saved Games\\Mech Arcade\\profile.sav",
          },
        ],
      }),
      game({
        id: "epic-mech",
        launcher: "epic",
        status: "not_installed",
        installPath: undefined,
      }),
    ]);

    expect(plan.status).toBe("warning");
    expect(plan.audit?.noCopyPerformed).toBe(true);
    expect(plan.warningLaneCount).toBe(1);
    expect(plan.lanes[0].warnings).toContain("Target variant is not installed yet.");
    expect(plan.summary).toContain("needs install/path review");
  });

  it("uses provider fixture rules before basename fallback for target relative paths", () => {
    const plan = buildCrossStoreSaveSyncPlan([
      game({
        id: "steam-mech",
        launcher: "steam",
        installPath: "C:\\Steam\\Mech Arcade",
        saveFiles: [
          {
            id: "profile",
            label: "Profile",
            path: "C:\\Users\\Player\\Saved Games\\Mech Arcade\\profile.sav",
          },
          {
            id: "settings",
            label: "Settings",
            path: "C:\\Users\\Player\\Saved Games\\Mech Arcade\\settings.json",
          },
        ],
      }),
      game({
        id: "epic-mech",
        launcher: "epic",
        installPath: "C:\\Games\\Epic Games\\MechArcade",
      }),
    ]);

    expect(plan.pathMappingProof?.mappedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mappingRuleId: "steam-profile",
          sourceRelativePath: "profile.sav",
          targetPath:
            "C:\\Games\\Epic Games\\MechArcade\\<reviewed-save-folder>\\Saved\\Profile.sav",
          targetRelativePath: "Saved/Profile.sav",
        }),
        expect.objectContaining({
          mappingRuleId: "steam-settings",
          sourceRelativePath: "settings.json",
          targetPath:
            "C:\\Games\\Epic Games\\MechArcade\\<reviewed-save-folder>\\Config\\settings.json",
          targetRelativePath: "Config/settings.json",
        }),
      ]),
    );
  });
});
