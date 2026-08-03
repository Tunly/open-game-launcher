import { isTauri } from "@tauri-apps/api/core";
import type {
  ClientAssetCacheLookup,
  ClientAutoApplyPlan,
  ClientInstallerMetadata,
  ClientInstallStagePlan,
  ClientManagerActionResult,
  ClientManagerAutoApplyCapabilityPreview,
  ClientManagerAutoApplyCapabilityRequest,
  ClientManagerMountApplySandboxProof,
  ClientManagerMountApplySandboxRequest,
  ClientModificationConfig,
  ClientPollingSettings,
  ClientPlatformId,
  ClientUpdateSchedulerRunStatus,
  ClientUpdateSchedulerStatus,
  ClientUpdateStatus,
  PlatformClientHealth,
  ScheduledClientUpdateChecksResponse,
} from "./types";
import {
  CLIENT_DISPLAY_NAMES,
  CLIENT_HEALTH_CACHE_MAX_AGE_MS,
  CLIENT_OFFICIAL_DOWNLOAD_URIS,
  CLIENT_PLATFORM_IDS,
  LauncherCommandError,
  invokeCommand,
} from "./shared";

// Mutable health cache state (owned by this module)
let clientHealthCache: { checkedAt: number; value: PlatformClientHealth[] } | null = null;
let clientHealthInflight: Promise<PlatformClientHealth[]> | null = null;

export function pollPlatformClientHealth(options?: {
  maxAgeMs?: number;
}): Promise<PlatformClientHealth[]> {
  if (!isTauri()) {
    const now = new Date().toISOString();
    return Promise.resolve(
      CLIENT_PLATFORM_IDS.map((platformId) => ({
        canLaunch: false,
        displayName: CLIENT_DISPLAY_NAMES[platformId],
        installed: false,
        installPath: null,
        lastCheckedAt: now,
        pid: null,
        platformId,
        processName: null,
        running: false,
        statusLabel: "Desktop only",
        uptimeSeconds: null,
        windowHandle: null,
        windowTitle: null,
      })),
    );
  }

  const maxAgeMs = options?.maxAgeMs ?? CLIENT_HEALTH_CACHE_MAX_AGE_MS;
  if (maxAgeMs > 0 && clientHealthCache && Date.now() - clientHealthCache.checkedAt <= maxAgeMs) {
    return Promise.resolve(clientHealthCache.value);
  }
  if (clientHealthInflight) {
    return clientHealthInflight;
  }

  clientHealthInflight = invokeCommand<PlatformClientHealth[]>("poll_platform_client_health")
    .then((value) => {
      clientHealthCache = { checkedAt: Date.now(), value };
      return value;
    })
    .finally(() => {
      clientHealthInflight = null;
    });

  return clientHealthInflight;
}

export function launchPlatformClient(platformId: ClientPlatformId): Promise<void> {
  if (!isTauri()) {
    return Promise.reject(new Error("Platform clients can only be launched in the desktop app."));
  }

  clientHealthCache = null;
  return invokeCommand<void>("launch_platform_client", { platformId });
}

function defaultClientModificationConfig(platformId: ClientPlatformId): ClientModificationConfig {
  return {
    displayName: CLIENT_DISPLAY_NAMES[platformId],
    latestKnownVersion: null,
    localInstallerPath: null,
    localUpdaterPath: null,
    assetCaches: [],
    pathOverlays: [],
    platformId,
    updatePolicy: "manual",
    updatedAt: null,
  };
}

function desktopOnlyClientUpdateStatus(platformId: ClientPlatformId): ClientUpdateStatus {
  const now = new Date().toISOString();
  return {
    canOpenUpdater: false,
    detail: "Client update checks are available in the desktop app.",
    displayName: CLIENT_DISPLAY_NAMES[platformId],
    history: [],
    installed: false,
    installedVersion: null,
    lastCheckedAt: now,
    latestKnownVersion: null,
    localUpdaterPath: null,
    officialDownloadUri: CLIENT_OFFICIAL_DOWNLOAD_URIS[platformId],
    platformId,
    running: false,
    schedulerEnabled: false,
    statusLabel: "Desktop only",
    updateAvailable: false,
    updatePolicy: "manual",
  };
}

function desktopOnlyClientUpdateSchedulerStatus(): ClientUpdateSchedulerStatus {
  return {
    configPath: "Desktop app only",
    installed: false,
    lastRun: null,
    message: "Headless platform-client update timers are available in the desktop app.",
    provider: "Desktop app",
    statusPath: "Desktop app only",
    supported: false,
  };
}

function desktopOnlyInstallerMetadata(platformId: ClientPlatformId): ClientInstallerMetadata {
  return {
    canOpenLocalInstaller: false,
    canOpenOfficialDownload: false,
    canOpenUpdater: false,
    displayName: CLIENT_DISPLAY_NAMES[platformId],
    installActionLabel: "Desktop only",
    installNotes: "Installer actions are available in the desktop app.",
    localInstallerPath: null,
    localUpdaterPath: null,
    officialDownloadUri: CLIENT_OFFICIAL_DOWNLOAD_URIS[platformId],
    platformId,
    updateActionLabel: "Desktop only",
    updaterUri: null,
    updateNotes: "Updater actions are available in the desktop app.",
  };
}

function desktopOnlyInstallStagePlan(platformId: ClientPlatformId): ClientInstallStagePlan {
  return {
    canProceed: false,
    checks: [
      {
        detail: "Platform-client install staging is available in the desktop app.",
        label: "Desktop runtime",
        status: "blocked",
      },
      {
        detail: "OG-Launcher does not download third-party client binaries in the browser.",
        label: "Binary source",
        status: "pass",
      },
    ],
    displayName: CLIENT_DISPLAY_NAMES[platformId],
    message: "Open the desktop app to stage this provider installer safely.",
    platformId,
    requiresAdminReview: false,
    requiresLicenseReview: true,
    requiresUserConsent: true,
    stage: "desktopOnly",
    targetLabel: "Desktop app only",
    targetPath: null,
    targetUri: CLIENT_OFFICIAL_DOWNLOAD_URIS[platformId],
  };
}

function desktopOnlyAutoApplyPlan(platformId: ClientPlatformId): ClientAutoApplyPlan {
  return {
    allowsSilentExecution: false,
    canAutoApply: false,
    canOpenSafeUpdater: false,
    checks: [
      {
        detail: "Platform-client auto-apply checks are available in the desktop app.",
        label: "Desktop runtime",
        status: "blocked",
      },
      {
        detail: "OG-Launcher does not download or silently run third-party client updaters.",
        label: "Provider mechanism",
        status: "blocked",
      },
    ],
    displayName: CLIENT_DISPLAY_NAMES[platformId],
    message: "Open the desktop app to inspect guarded auto-apply readiness.",
    platformId,
    policy: "manual",
    requiresProviderMechanism: true,
    requiresUserConsent: true,
    safeTargetLabel: null,
    stage: "desktopOnly",
  };
}

function desktopOnlyClientManagerAutoApplyCapabilities(
  input: ClientManagerAutoApplyCapabilityRequest,
): ClientManagerAutoApplyCapabilityPreview {
  const targetPath = input.installTargetPath?.trim() || null;
  const requiredDiskBytes = input.requiredDiskBytes ?? 40 * 1024 * 1024 * 1024;

  return {
    autoApplyStage: "desktopOnly",
    availableDiskBytes: null,
    canAutoApply: false,
    checks: [
      {
        detail: "Client Manager auto-apply capability checks require the desktop app.",
        evidence: "Browser Preview",
        id: "desktop-runtime",
        label: "Runtime presence",
        status: "blocked",
      },
      {
        detail: "Browser preview cannot inspect local provider-client install signals.",
        evidence: "No native client scan",
        id: "client-presence",
        label: "Client presence",
        status: "blocked",
      },
      {
        detail: targetPath
          ? "Install target is display-only in browser preview; filesystem metadata is not inspected."
          : "No native install target is available in browser preview.",
        evidence: targetPath ?? "No target path",
        id: "install-target",
        label: "Install target",
        status: targetPath ? "warning" : "blocked",
      },
      {
        detail: "Browser preview cannot match a target path to native disk free-space metadata.",
        evidence: "No matched mount point",
        id: "free-disk-space",
        label: "Free disk space",
        status: "blocked",
      },
      {
        detail:
          "No elevated token is requested; provider updater elevation stays a manual consent review.",
        evidence: "Read-only preview",
        id: "admin-review",
        label: "Admin review",
        status: "warning",
      },
      {
        detail: "OG-Launcher does not download or silently run third-party client updaters.",
        evidence: "desktopOnly",
        id: "provider-mechanism",
        label: "Provider mechanism",
        status: "blocked",
      },
    ],
    diskMountPoint: null,
    displayName: CLIENT_DISPLAY_NAMES[input.platformId],
    generatedAt: new Date().toISOString(),
    message: "Open the desktop app to inspect read-only Client Manager auto-apply capabilities.",
    platformId: input.platformId,
    requiredDiskBytes,
    targetPath,
  };
}

function desktopOnlyClientAssetCacheLookup(): ClientAssetCacheLookup {
  return {
    conflicts: [],
    entries: [],
    generatedAt: new Date().toISOString(),
  };
}

function desktopOnlyClientPollingSettings(): ClientPollingSettings {
  return {
    lifecyclePollIntervalSeconds: 10,
    updatedAt: null,
  };
}

export function getPlatformClientInstallerMetadata(
  platformId: ClientPlatformId,
): Promise<ClientInstallerMetadata> {
  if (!isTauri()) {
    return Promise.resolve(desktopOnlyInstallerMetadata(platformId));
  }

  return invokeCommand<ClientInstallerMetadata>("get_platform_client_installer_metadata", {
    platformId,
  });
}

export function previewPlatformClientInstall(
  platformId: ClientPlatformId,
): Promise<ClientInstallStagePlan> {
  if (!isTauri()) {
    return Promise.resolve(desktopOnlyInstallStagePlan(platformId));
  }

  return invokeCommand<ClientInstallStagePlan>("preview_platform_client_install", { platformId });
}

export function getPlatformClientModificationConfig(
  platformId: ClientPlatformId,
): Promise<ClientModificationConfig> {
  if (!isTauri()) {
    return Promise.resolve(defaultClientModificationConfig(platformId));
  }

  return invokeCommand<ClientModificationConfig>("get_platform_client_modification_config", {
    platformId,
  });
}

export function savePlatformClientModificationConfig(
  input: ClientModificationConfig,
): Promise<ClientModificationConfig> {
  if (!isTauri()) {
    return Promise.resolve({
      ...input,
      displayName: CLIENT_DISPLAY_NAMES[input.platformId],
      updatedAt: new Date().toISOString(),
    });
  }

  return invokeCommand<ClientModificationConfig>("save_platform_client_modification_config", {
    input,
  });
}

export function getPlatformClientAssetCacheLookup(): Promise<ClientAssetCacheLookup> {
  if (!isTauri()) {
    return Promise.resolve(desktopOnlyClientAssetCacheLookup());
  }

  return invokeCommand<ClientAssetCacheLookup>("get_platform_client_asset_cache_lookup");
}

export function getPlatformClientPollingSettings(): Promise<ClientPollingSettings> {
  if (!isTauri()) {
    return Promise.resolve(desktopOnlyClientPollingSettings());
  }

  return invokeCommand<ClientPollingSettings>("get_platform_client_polling_settings");
}

export function savePlatformClientPollingSettings(
  input: ClientPollingSettings,
): Promise<ClientPollingSettings> {
  const payload: ClientPollingSettings = {
    lifecyclePollIntervalSeconds: Math.max(5, Math.min(120, input.lifecyclePollIntervalSeconds)),
    updatedAt: input.updatedAt ?? null,
  };

  if (!isTauri()) {
    return Promise.resolve({
      ...payload,
      updatedAt: new Date().toISOString(),
    });
  }

  return invokeCommand<ClientPollingSettings>("save_platform_client_polling_settings", {
    input: payload,
  });
}

export function getPlatformClientUpdateStatus(
  platformId: ClientPlatformId,
): Promise<ClientUpdateStatus> {
  if (!isTauri()) {
    return Promise.resolve(desktopOnlyClientUpdateStatus(platformId));
  }

  return invokeCommand<ClientUpdateStatus>("get_platform_client_update_status", { platformId });
}

export function previewPlatformClientAutoApply(
  platformId: ClientPlatformId,
): Promise<ClientAutoApplyPlan> {
  if (!isTauri()) {
    return Promise.resolve(desktopOnlyAutoApplyPlan(platformId));
  }

  return invokeCommand<ClientAutoApplyPlan>("preview_platform_client_auto_apply", { platformId });
}

export function previewClientManagerAutoApplyCapabilities(
  input: ClientManagerAutoApplyCapabilityRequest,
): Promise<ClientManagerAutoApplyCapabilityPreview> {
  if (!isTauri()) {
    return Promise.resolve(desktopOnlyClientManagerAutoApplyCapabilities(input));
  }

  return invokeCommand<ClientManagerAutoApplyCapabilityPreview>(
    "preview_client_manager_auto_apply_capabilities",
    { input },
  );
}

export function proveClientManagerMountApplySandbox(
  input: ClientManagerMountApplySandboxRequest,
): Promise<ClientManagerMountApplySandboxProof> {
  if (!isTauri()) {
    return Promise.reject(
      new LauncherCommandError(
        "prove_client_manager_mount_apply_sandbox",
        "Client Manager sandbox proof is available in the desktop app.",
      ),
    );
  }

  return invokeCommand<ClientManagerMountApplySandboxProof>(
    "prove_client_manager_mount_apply_sandbox",
    { input },
  );
}

export function checkPlatformClientUpdate(
  platformId: ClientPlatformId,
): Promise<ClientUpdateStatus> {
  if (!isTauri()) {
    return Promise.resolve(desktopOnlyClientUpdateStatus(platformId));
  }

  return invokeCommand<ClientUpdateStatus>("check_platform_client_update", { platformId });
}

export function runScheduledPlatformClientUpdateChecks(): Promise<ScheduledClientUpdateChecksResponse> {
  const now = new Date().toISOString();
  if (!isTauri()) {
    return Promise.resolve({
      checkedAt: now,
      checkedClients: [],
      message: "Scheduled platform-client update checks are available in the desktop app.",
      nextCheckAt: null,
      skippedClients: CLIENT_PLATFORM_IDS.map(
        (platformId) => `${CLIENT_DISPLAY_NAMES[platformId]}: desktop only`,
      ),
      updateCount: 0,
    });
  }

  return invokeCommand<ScheduledClientUpdateChecksResponse>(
    "run_scheduled_platform_client_update_checks",
  );
}

export function getPlatformClientUpdateSchedulerStatus(): Promise<ClientUpdateSchedulerStatus> {
  if (!isTauri()) {
    return Promise.resolve(desktopOnlyClientUpdateSchedulerStatus());
  }

  return invokeCommand<ClientUpdateSchedulerStatus>("get_platform_client_update_scheduler_status");
}

export function installPlatformClientUpdateScheduler(): Promise<ClientUpdateSchedulerStatus> {
  if (!isTauri()) {
    return Promise.resolve(desktopOnlyClientUpdateSchedulerStatus());
  }

  return invokeCommand<ClientUpdateSchedulerStatus>("install_platform_client_update_scheduler");
}

export function uninstallPlatformClientUpdateScheduler(): Promise<ClientUpdateSchedulerStatus> {
  if (!isTauri()) {
    return Promise.resolve(desktopOnlyClientUpdateSchedulerStatus());
  }

  return invokeCommand<ClientUpdateSchedulerStatus>("uninstall_platform_client_update_scheduler");
}

export function runPlatformClientUpdateSchedulerNow(): Promise<ClientUpdateSchedulerRunStatus> {
  if (!isTauri()) {
    return Promise.resolve({
      checkedAt: new Date().toISOString(),
      checkedClients: [],
      checkedCount: 0,
      message: "Headless platform-client update timers are available in the desktop app.",
      nextCheckAt: null,
      skippedCount: CLIENT_PLATFORM_IDS.length,
      success: false,
      updateCount: 0,
    });
  }

  return invokeCommand<ClientUpdateSchedulerRunStatus>("run_platform_client_update_scheduler_now");
}

export function openPlatformClientInstaller(
  platformId: ClientPlatformId,
): Promise<ClientManagerActionResult> {
  if (!isTauri()) {
    return Promise.reject(new Error("Client installer actions are available in the desktop app."));
  }

  clientHealthCache = null;
  return invokeCommand<ClientManagerActionResult>("open_platform_client_installer", { platformId });
}

export function openPlatformClientUpdater(
  platformId: ClientPlatformId,
): Promise<ClientManagerActionResult> {
  if (!isTauri()) {
    return Promise.reject(new Error("Client updater actions are available in the desktop app."));
  }

  clientHealthCache = null;
  return invokeCommand<ClientManagerActionResult>("open_platform_client_updater", { platformId });
}
