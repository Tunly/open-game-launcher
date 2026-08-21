import { describe, expect, it } from "vitest";

import {
  getPlatformClientAssetCacheLookup,
  getPlatformClientInstallerMetadata,
  getPlatformClientModificationConfig,
  getPlatformClientPollingSettings,
  getPlatformClientUpdateStatus,
  pollPlatformClientHealth,
  previewClientManagerAutoApplyCapabilities,
  previewPlatformClientAutoApply,
  previewPlatformClientInstall,
  runScheduledPlatformClientUpdateChecks,
  savePlatformClientPollingSettings,
  toClientPlatformId,
} from "../launcher";

describe("client manager helpers", () => {
  it("normalizes common platform client names", () => {
    expect(toClientPlatformId("Battle.net")).toBe("battlenet");
    expect(toClientPlatformId("EA App")).toBe("ea");
    expect(toClientPlatformId("Epic Games")).toBe("epic");
    expect(toClientPlatformId("Ubisoft Connect")).toBe("ubisoft");
    expect(toClientPlatformId("Steam")).toBe("steam");
    expect(toClientPlatformId("unknown launcher")).toBeNull();
  });

  it("returns safe desktop-only installer metadata outside Tauri", async () => {
    await expect(getPlatformClientInstallerMetadata("steam")).resolves.toMatchObject({
      canOpenLocalInstaller: false,
      canOpenOfficialDownload: false,
      installActionLabel: "Desktop only",
      officialDownloadUri: "https://store.steampowered.com/about/",
      platformId: "steam",
    });
  });

  it("builds empty modification and update status fallbacks outside Tauri", async () => {
    await expect(getPlatformClientModificationConfig("gog")).resolves.toMatchObject({
      displayName: "GOG Galaxy",
      assetCaches: [],
      pathOverlays: [],
      platformId: "gog",
      updatePolicy: "manual",
    });

    await expect(getPlatformClientUpdateStatus("gog")).resolves.toMatchObject({
      displayName: "GOG Galaxy",
      history: [],
      installed: false,
      officialDownloadUri: "https://www.gog.com/galaxy",
      platformId: "gog",
      schedulerEnabled: false,
      statusLabel: "Desktop only",
    });
  });

  it("returns an empty asset-cache lookup outside Tauri", async () => {
    await expect(getPlatformClientAssetCacheLookup()).resolves.toMatchObject({
      conflicts: [],
      entries: [],
    });
  });

  it("returns and clamps polling settings outside Tauri", async () => {
    await expect(getPlatformClientPollingSettings()).resolves.toMatchObject({
      lifecyclePollIntervalSeconds: 10,
      updatedAt: null,
    });

    await expect(
      savePlatformClientPollingSettings({
        lifecyclePollIntervalSeconds: 2,
        updatedAt: null,
      }),
    ).resolves.toMatchObject({
      lifecyclePollIntervalSeconds: 5,
    });

    await expect(
      savePlatformClientPollingSettings({
        lifecyclePollIntervalSeconds: 999,
        updatedAt: null,
      }),
    ).resolves.toMatchObject({
      lifecyclePollIntervalSeconds: 120,
    });
  });

  it("includes empty window metadata in desktop-only health fallbacks", async () => {
    await expect(pollPlatformClientHealth()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platformId: "steam",
          statusLabel: "Desktop only",
          windowHandle: null,
          windowTitle: null,
        }),
      ]),
    );
  });

  it("returns a safe desktop-only install staging fallback outside Tauri", async () => {
    await expect(previewPlatformClientInstall("steam")).resolves.toMatchObject({
      canProceed: false,
      displayName: "Steam",
      platformId: "steam",
      stage: "desktopOnly",
      targetLabel: "Desktop app only",
    });
  });

  it("returns a blocked desktop-only auto-apply fallback outside Tauri", async () => {
    await expect(previewPlatformClientAutoApply("steam")).resolves.toMatchObject({
      allowsSilentExecution: false,
      canAutoApply: false,
      displayName: "Steam",
      platformId: "steam",
      requiresProviderMechanism: true,
      stage: "desktopOnly",
    });
  });

  it("returns a blocked desktop-only auto-apply capability fallback outside Tauri", async () => {
    await expect(
      previewClientManagerAutoApplyCapabilities({
        installTargetPath: "D:\\OGLauncher\\Games",
        platformId: "steam",
        requiredDiskBytes: 40 * 1024 * 1024 * 1024,
      }),
    ).resolves.toMatchObject({
      autoApplyStage: "desktopOnly",
      availableDiskBytes: null,
      canAutoApply: false,
      diskMountPoint: null,
      displayName: "Steam",
      platformId: "steam",
      targetPath: "D:\\OGLauncher\\Games",
      checks: expect.arrayContaining([
        expect.objectContaining({
          id: "desktop-runtime",
          status: "blocked",
        }),
        expect.objectContaining({
          id: "install-target",
          status: "warning",
        }),
        expect.objectContaining({
          id: "free-disk-space",
          status: "blocked",
        }),
        expect.objectContaining({
          id: "provider-mechanism",
          status: "blocked",
        }),
      ]),
    });
  });

  it("returns a safe scheduled update fallback outside Tauri", async () => {
    await expect(runScheduledPlatformClientUpdateChecks()).resolves.toMatchObject({
      checkedClients: [],
      nextCheckAt: null,
      skippedClients: expect.arrayContaining(["Steam: desktop only"]),
      updateCount: 0,
    });
  });
});
