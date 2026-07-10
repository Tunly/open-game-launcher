import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyCrossStoreSaveCopy,
  auditStagedPluginRegistry,
  clearBroadcastStreamKeySecret,
  ejectBackupExternalDrive,
  getBroadcastStreamKeyVaultStatus,
  getDiskInfo,
  getLatestBackupStatus,
  listInstalledGames,
  refreshInstalledGames,
  openAchievementCacheFolder,
  isSteamScrapedGamesEventForAccount,
  isSteamScrapeErrorEventForAccount,
  openEpicLoginWindow,
  openSteamLoginWindow,
  reviewPluginActivationPlan,
  reviewPluginMarketplaceUpdateIndexTrust,
  reviewPluginUpdateSigningEnvelope,
  provePluginRuntimeSandbox,
  proveCrossStoreSaveLocalE2E,
  proveBackupExternalDriveEjectSafety,
  proveBackupExternalDriveWrite,
  previewBackupPlan,
  previewRestorePlan,
  restoreBackup,
  rollbackCrossStoreSaveCopy,
  setBroadcastStreamKeySecret,
  runBackupPlan,
  scanLocalPluginManifests,
  stageSignedPluginPackage,
} from "../launcher";

describe("launcher browser guards", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockClear();
  });

  it("uses an honest empty installed-game inventory outside Tauri", async () => {
    await expect(listInstalledGames()).resolves.toEqual([]);
    await expect(refreshInstalledGames()).resolves.toEqual([]);
    await expect(openAchievementCacheFolder()).rejects.toThrow("desktop app");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("accepts Steam scraper events only for the current account", () => {
    expect(
      isSteamScrapedGamesEventForAccount(
        { games: [{ appid: 10, name: "Counter-Strike" }], steamId: "76561198000000001" },
        "76561198000000001",
      ),
    ).toBe(true);
    expect(
      isSteamScrapedGamesEventForAccount(
        { games: [{ appid: 10, name: "Counter-Strike" }], steamId: "76561198000000001" },
        "76561198000000002",
      ),
    ).toBe(false);
    expect(isSteamScrapedGamesEventForAccount([{ appid: 10 }], "76561198000000001")).toBe(false);
    expect(
      isSteamScrapedGamesEventForAccount(
        { games: [{ unexpected: true }], steamId: "76561198000000001" },
        "76561198000000001",
      ),
    ).toBe(false);
    expect(
      isSteamScrapedGamesEventForAccount(
        { games: [], steamId: "76561198000000001" },
        "76561198000000001",
      ),
    ).toBe(true);

    expect(
      isSteamScrapeErrorEventForAccount(
        { message: "Private profile", steamId: "76561198000000001" },
        "76561198000000001",
      ),
    ).toBe(true);
    expect(
      isSteamScrapeErrorEventForAccount(
        { message: "Private profile", steamId: "76561198000000001" },
        "76561198000000002",
      ),
    ).toBe(false);
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
          operation: "prove_plugin_runtime_sandbox_process_proof",
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
    expect(invoke).not.toHaveBeenCalled();
  });

  it("blocks native login windows outside Tauri", async () => {
    await expect(openSteamLoginWindow()).rejects.toThrow("desktop app");
    await expect(openEpicLoginWindow()).rejects.toThrow("desktop app");
    expect(invoke).not.toHaveBeenCalled();
  });
});
