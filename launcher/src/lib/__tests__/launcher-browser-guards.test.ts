import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addManualGame,
  applyCrossStoreSaveCopy,
  auditStagedPluginRegistry,
  clearBroadcastStreamKeySecret,
  eaFetchOwnedGames,
  eaGetToken,
  fetchEpicOwnedGames,
  fetchGamePassCatalog,
  fetchSteamOwnedGames,
  fetchUbisoftOwnedGames,
  getBroadcastStreamKeyVaultStatus,
  listInstalledGames,
  gogGetToken,
  moveGame,
  refreshInstalledGames,
  openAchievementCacheFolder,
  isSteamScrapedGamesEventForAccount,
  isSteamScrapeErrorEventForAccount,
  launchGame,
  launchXboxGame,
  stopGame,
  openEpicLoginWindow,
  openSteamLoginWindow,
  reviewPluginActivationPlan,
  reviewPluginMarketplaceUpdateIndexTrust,
  reviewPluginUpdateSigningEnvelope,
  provePluginRuntimeSandbox,
  proveCrossStoreSaveLocalE2E,
  rollbackCrossStoreSaveCopy,
  setBroadcastStreamKeySecret,
  scanLocalPluginManifests,
  startDownload,
  stageSignedPluginPackage,
  syncGameSaves,
} from "../launcher";

describe("launcher browser guards", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockClear();
  });

  it("uses an honest empty installed-game inventory outside Tauri", async () => {
    await expect(listInstalledGames()).resolves.toEqual([]);
    await expect(refreshInstalledGames()).resolves.toEqual([]);
    await expect(gogGetToken()).resolves.toBeNull();
    await expect(eaGetToken()).resolves.toBeNull();
    await expect(eaFetchOwnedGames()).resolves.toEqual([]);
    await expect(fetchSteamOwnedGames("76561198000000001")).resolves.toEqual([]);
    await expect(fetchEpicOwnedGames()).resolves.toEqual([]);
    await expect(fetchUbisoftOwnedGames()).resolves.toEqual([]);
    await expect(fetchGamePassCatalog()).resolves.toEqual([]);
    await expect(openAchievementCacheFolder()).rejects.toThrow("desktop app");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("blocks local registration, play, and install commands outside Tauri", async () => {
    await expect(
      addManualGame({ title: "Browser Game", installPath: "C:\\Games\\browser.exe" }),
    ).rejects.toThrow("desktop app");
    await expect(launchGame("manual-browser-game")).rejects.toThrow("desktop app");
    await expect(stopGame("manual-browser-game")).rejects.toThrow("desktop app");
    await expect(moveGame({ gameId: "manual-browser-game", newPath: "C:\\Games" })).rejects.toThrow(
      "desktop app",
    );
    await expect(syncGameSaves("manual-browser-game")).rejects.toThrow("desktop app");
    await expect(launchXboxGame("Microsoft.Test_8wekyb3d8bbwe")).rejects.toThrow("desktop app");
    await expect(startDownload("steam-owned-440", "Team Fortress 2")).rejects.toThrow(
      "desktop app",
    );
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
