import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyCrossStoreSaveCopy,
  auditStagedPluginRegistry,
  applyControllerLayout,
  cancelLanTransferCopyJob,
  clearControllerLayout,
  checkGameSaveConflicts,
  clearBroadcastStreamKeySecret,
  downloadGameSavesFromCloud,
  ejectBackupExternalDrive,
  generateCloudKey,
  getBroadcastStreamKeyVaultStatus,
  getControllerRuntimeStatus,
  getLanTransferCopyJobs,
  getDiskInfo,
  getLatestBackupStatus,
  isCloudKeyPresent,
  listControllers,
  openEpicLoginWindow,
  openSteamLoginWindow,
  reviewPluginActivationPlan,
  reviewPluginMarketplaceUpdateIndexTrust,
  reviewPluginUpdateSigningEnvelope,
  provePluginRuntimeSandbox,
  proveCrossStoreSaveLocalE2E,
  proveCrossStoreSaveSupabaseKeychainStaging,
  proveBackupExternalDriveEjectSafety,
  proveBackupExternalDriveWrite,
  previewLanTransferCopy,
  previewLanTransferPeerDiscoveryPreflight,
  previewLanTransferResumeCancelLedger,
  previewBackupPlan,
  previewRestorePlan,
  restoreGameSavesFromCloud,
  restoreBackup,
  rollbackCrossStoreSaveCopy,
  runLanTransferCopy,
  runLanTransferCleanupCandidates,
  runLanTransferResumeCopy,
  setBroadcastStreamKeySecret,
  startLanTransferCopyJob,
  rotateCloudKey,
  runBackupPlan,
  scanLocalPluginManifests,
  uploadGameSavesToCloud,
  stageSignedPluginPackage,
} from "../launcher";

describe("launcher browser guards", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockClear();
  });

  it("blocks backup and restore native commands outside Tauri", async () => {
    const backupRequest = {
      compression: "none" as const,
      includeLibraryData: true,
      targetPath: "/tmp/og-backups",
    };
    const restoreRequest = {
      includeLibraryData: true,
      targetPath: "/tmp/og-backups",
    };

    await expect(previewBackupPlan(backupRequest)).rejects.toThrow("desktop app");
    await expect(runBackupPlan(backupRequest)).rejects.toThrow("desktop app");
    await expect(previewRestorePlan(restoreRequest)).rejects.toThrow("desktop app");
    await expect(restoreBackup(restoreRequest)).rejects.toThrow("desktop app");
    await expect(
      proveBackupExternalDriveWrite({
        consent: {
          accepted: true,
          operation: "sentinel_write_read_checksum_delete",
          targetPath: "/tmp/og-backups",
        },
        expectedMountPoint: "/tmp",
        targetPath: "/tmp/og-backups",
      }),
    ).rejects.toThrow("desktop app");
    await expect(
      proveBackupExternalDriveEjectSafety({
        consent: {
          accepted: true,
          operation: "flush_write_delete_before_eject_review",
          targetPath: "/tmp/og-backups",
        },
        expectedMountPoint: "/tmp",
        targetPath: "/tmp/og-backups",
      }),
    ).rejects.toThrow("desktop app");
    await expect(
      ejectBackupExternalDrive({
        consent: {
          accepted: true,
          operation: "os_eject_unmount_removable_target",
          targetPath: "/tmp/og-backups",
        },
        expectedMountPoint: "/tmp",
        preflightProofId: "preflight-proof-1",
        targetPath: "/tmp/og-backups",
      }),
    ).rejects.toThrow("desktop app");
    await expect(getLatestBackupStatus("/tmp/og-backups")).rejects.toThrow("desktop app");
    await expect(getDiskInfo()).rejects.toThrow("desktop app");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("blocks plugin registry native commands outside Tauri", async () => {
    await expect(scanLocalPluginManifests("/tmp/plugins")).rejects.toThrow("desktop app");
    await expect(
      stageSignedPluginPackage({
        consent: {
          accepted: true,
          operation: "stage_plugin_package:demo@1.0.0",
        },
        packagePath: "/tmp/plugin-package",
      }),
    ).rejects.toThrow("desktop app");
    await expect(auditStagedPluginRegistry()).rejects.toThrow("desktop app");
    await expect(
      provePluginRuntimeSandbox({
        consent: {
          accepted: true,
          operation: "prove_plugin_runtime_sandbox_dry_run",
        },
      }),
    ).rejects.toThrow("desktop app");
    await expect(
      reviewPluginActivationPlan({
        pluginId: "library-tags-exporter",
        version: "1.0.0",
        consent: {
          accepted: true,
          operation: "review_plugin_activation_plan:library-tags-exporter@1.0.0",
        },
      }),
    ).rejects.toThrow("desktop app");
    await expect(
      reviewPluginMarketplaceUpdateIndexTrust({
        consent: {
          accepted: true,
          operation: "review_plugin_marketplace_update_index_trust",
        },
        indexPath: "/tmp/og-plugin-index.json",
      }),
    ).rejects.toThrow("desktop app");
    await expect(
      reviewPluginUpdateSigningEnvelope({
        consent: {
          accepted: true,
          operation: "review_plugin_update_signing_envelope",
        },
        envelopePath: "/tmp/og-plugin-update-envelope.json",
      }),
    ).rejects.toThrow("desktop app");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("blocks LAN transfer native copy commands outside Tauri", async () => {
    const request = {
      consent: {
        accepted: true,
        operation: "lan_native_copy_verify_manifest" as const,
        sourcePath: "/mnt/peer/Arcade",
        targetPath: "/home/user/Games/Arcade",
      },
      gameId: "arcade-1",
      sourcePath: "/mnt/peer/Arcade",
      targetPath: "/home/user/Games/Arcade",
      title: "Arcade",
    };

    await expect(previewLanTransferCopy(request)).rejects.toThrow("desktop app");
    await expect(
      previewLanTransferPeerDiscoveryPreflight({
        consent: {
          accepted: true,
          operation: "lan_peer_discovery_preflight_review",
        },
        manualSourcePath: request.sourcePath,
      }),
    ).rejects.toThrow("desktop app");
    await expect(
      previewLanTransferResumeCancelLedger({
        gameId: request.gameId,
        sourcePath: request.sourcePath,
        targetPath: request.targetPath,
        title: request.title,
      }),
    ).rejects.toThrow("desktop app");
    await expect(runLanTransferCopy(request)).rejects.toThrow("desktop app");
    await expect(getLanTransferCopyJobs()).rejects.toThrow("desktop app");
    await expect(startLanTransferCopyJob(request)).rejects.toThrow("desktop app");
    await expect(cancelLanTransferCopyJob("lan-copy-arcade-1")).rejects.toThrow("desktop app");
    await expect(
      runLanTransferResumeCopy({
        ...request,
        consent: {
          ...request.consent,
          operation: "lan_native_resume_copy_verify_manifest",
        },
      }),
    ).rejects.toThrow("desktop app");
    await expect(
      runLanTransferCleanupCandidates({
        ...request,
        consent: {
          accepted: true,
          cleanupCandidateCount: 1,
          operation: "lan_native_cleanup_candidates_delete",
          sourcePath: request.sourcePath,
          targetPath: request.targetPath,
        },
      }),
    ).rejects.toThrow("desktop app");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("keeps broadcast stream-key vault writes desktop-only outside Tauri", async () => {
    const request = {
      channelId: "local-preview",
      consent: {
        accepted: true,
        channelId: "local-preview",
        operation: "broadcast_stream_key_vault_save" as const,
        provider: "twitch" as const,
      },
      provider: "twitch" as const,
      secret: "stream-key-secret-123",
    };

    await expect(
      getBroadcastStreamKeyVaultStatus({
        channelId: request.channelId,
        provider: request.provider,
      }),
    ).resolves.toMatchObject({
      channelId: request.channelId,
      configured: false,
      provider: request.provider,
      secretHint: null,
    });
    await expect(setBroadcastStreamKeySecret(request)).rejects.toThrow("desktop app");
    await expect(
      clearBroadcastStreamKeySecret({
        channelId: request.channelId,
        consent: {
          ...request.consent,
          operation: "broadcast_stream_key_vault_clear",
        },
        provider: request.provider,
      }),
    ).rejects.toThrow("desktop app");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("keeps controller runtime activation desktop-only outside Tauri", async () => {
    await expect(
      applyControllerLayout({
        gameId: "global-controller-preview",
        layout: {
          authorName: "Local Browser",
          bindings: [],
          controllerType: "xbox",
          createdAt: "2026-06-12T00:00:00.000Z",
          gameId: null,
          gyroEnabled: false,
          hapticsEnabled: true,
          id: "local-xbox-default",
          isCommunity: false,
          isDefault: true,
          name: "Local Default",
          template: "gamepad",
          updatedAt: "2026-06-12T00:00:00.000Z",
          userId: "local-controller-user",
        },
      }),
    ).rejects.toThrow("desktop app");
    await expect(clearControllerLayout()).rejects.toThrow("desktop app");
    await expect(listControllers()).rejects.toThrow("desktop app");
    await expect(getControllerRuntimeStatus()).resolves.toMatchObject({
      activeLayoutName: "Browser Preview Only",
      keyboardMouseEmulationReady: false,
      nativePassthroughReady: false,
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("blocks cross-store save native copy outside Tauri", async () => {
    await expect(
      applyCrossStoreSaveCopy({
        actions: [
          {
            id: "profile",
            sourceRelativePath: "profile.sav",
            targetRelativePath: "profile.sav",
          },
        ],
        consent: {
          accepted: true,
          actionCount: 1,
          operation: "cross_store_save_native_copy_apply",
          sourceRoot: "/tmp/steam-saves",
          targetRoot: "/tmp/gog-saves",
        },
        gameId: "mech-arcade",
        sourceLabel: "Steam",
        sourceRoot: "/tmp/steam-saves",
        targetLabel: "GOG",
        targetRoot: "/tmp/gog-saves",
      }),
    ).rejects.toThrow("desktop app");
    await expect(
      rollbackCrossStoreSaveCopy({
        consent: {
          accepted: true,
          fileCount: 1,
          manifestPath: "/tmp/gog-saves/og-cross-store-save-apply.json",
          operation: "cross_store_save_native_copy_rollback",
          rollbackManifestId: "cross-store-rollback-1",
          targetRoot: "/tmp/gog-saves",
        },
        gameId: "mech-arcade",
        manifestPath: "/tmp/gog-saves/og-cross-store-save-apply.json",
        rollbackManifestId: "cross-store-rollback-1",
        targetRoot: "/tmp/gog-saves",
      }),
    ).rejects.toThrow("desktop app");
    await expect(proveCrossStoreSaveLocalE2E()).rejects.toThrow("desktop app");
    await expect(
      proveCrossStoreSaveSupabaseKeychainStaging("mech-arcade", {
        accessToken: "supabase-access-token",
        userId: "user-1",
      }),
    ).rejects.toThrow("desktop app");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("blocks cloud keychain commands outside Tauri", async () => {
    await expect(isCloudKeyPresent("user-1")).rejects.toThrow("desktop app");
    await expect(generateCloudKey("user-1")).rejects.toThrow("desktop app");
    await expect(rotateCloudKey("user-1")).rejects.toThrow("desktop app");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("blocks cloud-save sync wrappers outside Tauri", async () => {
    const options = {
      accessToken: "supabase-access-token",
      userId: "user-1",
    };

    await expect(
      uploadGameSavesToCloud("game-1", {
        ...options,
        deleteCloudRelativePaths: ["old/profile.sav"],
        savePaths: ["/games/game-1/saves"],
        selectedRelativePaths: ["profile.sav"],
      }),
    ).rejects.toThrow("desktop app");
    await expect(downloadGameSavesFromCloud("game-1", options)).rejects.toThrow("desktop app");
    await expect(
      restoreGameSavesFromCloud("game-1", {
        ...options,
        deleteLocalPaths: ["/games/game-1/saves/old.sav"],
        savePaths: ["/games/game-1/saves"],
        selectedRelativePaths: ["profile.sav"],
      }),
    ).rejects.toThrow("desktop app");
    await expect(
      checkGameSaveConflicts("game-1", {
        ...options,
        savePaths: ["/games/game-1/saves"],
      }),
    ).rejects.toThrow("desktop app");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("blocks native login windows outside Tauri", async () => {
    await expect(openSteamLoginWindow()).rejects.toThrow("desktop app");
    await expect(openEpicLoginWindow()).rejects.toThrow("desktop app");
    expect(invoke).not.toHaveBeenCalled();
  });
});
