import { invoke, isTauri } from "@tauri-apps/api/core";

import { getGameSource } from "./formatters";
import { writeActivePerformanceGameContext } from "./performance-context";
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
  BroadcastStreamKeyVaultClearRequest,
  BroadcastStreamKeyVaultSaveRequest,
  BroadcastStreamKeyVaultStatus,
  BroadcastStreamKeyVaultStatusRequest,
  CrossStoreSaveApplyRequest,
  CrossStoreSaveApplyResult,
  CrossStoreSaveLocalE2EProofResult,
  CrossStoreSaveRollbackRequest,
  CrossStoreSaveRollbackResult,
  CrossStoreSaveSupabaseKeychainStagingProofConsent,
  CrossStoreSaveSupabaseKeychainStagingProofResult,
  DiskInfo,
  HardwareInfo,
  LanTransferCleanupCandidatesRequest,
  LanTransferCleanupCandidatesResult,
  LanTransferCopyJob,
  LanTransferCopyPreview,
  LanTransferCopyRequest,
  LanTransferCopyResult,
  LanTransferPeerDiscoveryPreflightRequest,
  LanTransferPeerDiscoveryPreflightResult,
  LanTransferResumeCancelLedger,
  LanTransferResumeCancelLedgerRequest,
  LanTransferResumeCopyResult,
  LaunchGameResponse,
  Game,
  DownloadItem,
  LocalEntityKey,
  LocalEntityPayload,
  LocalSyncStatus,
  PlaySession,
  ProviderHealthStatus,
  ReconciliationResult,
  StartDownloadResponse,
  SystemInfo,
  SyncGameAchievementsResponse,
  UninstallGameResponse,
  VerifyGameFilesResponse,
  RepairGameFilesResponse,
  ScheduledClientUpdateChecksResponse,
  SyncGameSavesResponse,
  UploadGameSavesToCloudResponse,
  DownloadGameSavesFromCloudResponse,
  RestoreGameSavesFromCloudResponse,
  CheckGameSaveConflictsResponse,
  PlatformClientHealth,
} from "./types";
import type {
  ControllerDevice,
  ControllerLayout,
  ControllerRuntimeStatus,
} from "./types/controllers";
import type {
  BackupExecutionResult,
  BackupExternalDriveEjectSafetyRequest,
  BackupExternalDriveEjectSafetyResult,
  BackupExternalDriveOsEjectRequest,
  BackupExternalDriveOsEjectResult,
  BackupExternalDriveWriteProofRequest,
  BackupExternalDriveWriteProofResult,
  BackupManifestStatus,
  BackupPlanPreview,
  BackupPlanRequest,
  BackupSchedulerConfig,
  BackupSchedulerRunStatus,
  BackupSchedulerStatus,
  RestoreExecutionResult,
  RestorePlanPreview,
  RestorePlanRequest,
} from "./types/backup";
import type {
  PluginActivationPlanReviewEvidence,
  PluginActivationPlanReviewRequest,
  PluginDisabledRegistryAuditEvidence,
  PluginManifestEvidence,
  PluginMarketplaceTrustEvidence,
  PluginRuntimeSandboxProofEvidence,
  PluginUpdateSigningReviewEvidence,
} from "./plugin-system-readiness";

export type { Game };

export interface RemotePlayRequest {
  gameId: string | null;
  launcher: string | null;
  externalId: string | null;
  launchUri: string | null;
  cloudGamingUrl: string | null;
}

export interface RemotePlayLaunchResult {
  provider: string;
  mode: string;
  uri: string;
  message: string;
}

export interface RemotePlayDescriptor {
  supported: boolean;
  providerLabel: string;
  actionLabel: string;
  statusLabel: string;
  detail: string;
  request: RemotePlayRequest | null;
}

export interface RemoteCompanionDeviceSecretInput {
  deviceId: string;
  deviceSecret: string;
  deviceSecretHint?: string | null;
}

export interface RemoteCompanionDeviceSecretStatus {
  deviceId: string | null;
  deviceSecretHint: string | null;
  hasSecret: boolean;
  updatedAtEpochMs: number | null;
}

export interface PluginManifestDiscoveryResult {
  discoveryPath: string;
  loadedAt: string;
  manifests: PluginManifestEvidence[];
  maxDepth: number;
  scannedFileCount: number;
  skippedEntries: string[];
  sourceLabel: string;
}

export interface SignedPluginPackageStageConsent {
  accepted: boolean;
  operation: string;
}

export interface SignedPluginPackageStageRequest {
  consent: SignedPluginPackageStageConsent;
  packagePath: string;
}

export interface StagedSignedPluginPackageResult {
  entrypoint: string;
  fileCount: number;
  keyId: string;
  message: string;
  pluginId: string;
  registryPath: string;
  signatureIssuer: string;
  status: "disabled";
  version: string;
}

export type StagedPluginRegistryAuditResult = PluginDisabledRegistryAuditEvidence;

export interface PluginRuntimeSandboxProofRequest {
  consent: {
    accepted: boolean;
    operation: string;
  };
}

export type PluginRuntimeSandboxProofResult = PluginRuntimeSandboxProofEvidence;

export type PluginActivationPlanReviewResult = PluginActivationPlanReviewEvidence;

export interface PluginMarketplaceUpdateIndexTrustRequest {
  consent: {
    accepted: boolean;
    operation: string;
  };
  indexPath: string;
}

export type PluginMarketplaceUpdateIndexTrustResult = PluginMarketplaceTrustEvidence;

export interface PluginUpdateSigningEnvelopeReviewRequest {
  consent: {
    accepted: boolean;
    operation: string;
  };
  envelopePath: string;
}

export type PluginUpdateSigningEnvelopeReviewResult = PluginUpdateSigningReviewEvidence;

export interface RemoteCompanionPollJobResult {
  gameId: string;
  jobId: string;
  localQueueId: string | null;
  message: string;
  status: "failed" | "started" | string;
}

export interface RemoteCompanionPollOnceResult {
  claimed: number;
  configured: boolean;
  failed: number;
  jobs: RemoteCompanionPollJobResult[];
  started: number;
}

import type { PlatformFriend } from "./types/friends";
import type {
  InstalledModInfo,
  ModInstallQueueItem,
  ModInstallRequest,
  ModInstallResult,
  ModProvider,
  NexusModInfo,
  NexusSearchResult,
} from "./types/mods";
import type { StoreLicenseValidationResult } from "./types/store";

type CommandArgs = Record<string, unknown>;

const CLIENT_PLATFORM_IDS = ["steam", "epic", "gog", "xbox", "ubisoft", "battlenet", "ea"] as const;
const CLIENT_HEALTH_CACHE_MAX_AGE_MS = 5_000;
const REMOTE_PLAY_ALLOWED_URI_PREFIXES = [
  "steam://",
  "com.epicgames.launcher://",
  "goggalaxy://",
  "ms-xbl-38966778-3f57-4f6e-a6e9-3b81c79fbb3f://",
  "battlenet://",
  "origin2://",
  "uplay://",
  "psjoin://",
  "switchgame://",
  "https://",
] as const;
let clientHealthCache: { checkedAt: number; value: PlatformClientHealth[] } | null = null;
let clientHealthInflight: Promise<PlatformClientHealth[]> | null = null;

const CLIENT_DISPLAY_NAMES: Record<ClientPlatformId, string> = {
  battlenet: "Battle.net",
  ea: "EA app",
  epic: "Epic Games",
  gog: "GOG Galaxy",
  steam: "Steam",
  ubisoft: "Ubisoft Connect",
  xbox: "Xbox",
};

const CLIENT_OFFICIAL_DOWNLOAD_URIS: Record<ClientPlatformId, string> = {
  battlenet: "https://download.battle.net/en-us/desktop",
  ea: "https://www.ea.com/ea-app",
  epic: "https://store.epicgames.com/download",
  gog: "https://www.gog.com/galaxy",
  steam: "https://store.steampowered.com/about/",
  ubisoft: "https://www.ubisoft.com/en-us/ubisoft-connect/download",
  xbox: "https://www.xbox.com/apps/xbox-app-for-pc",
};

class LauncherCommandError extends Error {
  constructor(
    public readonly command: string,
    cause: unknown,
  ) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`${command} failed: ${message}`);
    this.name = "LauncherCommandError";
  }
}

async function invokeCommand<T>(command: string, args?: CommandArgs): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw new LauncherCommandError(command, error);
  }
}

export function isClientPlatformId(value: string | null | undefined): value is ClientPlatformId {
  return CLIENT_PLATFORM_IDS.includes(value as ClientPlatformId);
}

export function toClientPlatformId(value: string | null | undefined): ClientPlatformId | null {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized === "battle" || normalized === "battlenet" || normalized === "battlenetapp") {
    return "battlenet";
  }
  if (normalized === "ea" || normalized === "eaapp" || normalized === "origin") {
    return "ea";
  }
  if (normalized === "epicgames") {
    return "epic";
  }
  if (normalized === "ubisoftconnect" || normalized === "uplay") {
    return "ubisoft";
  }
  return isClientPlatformId(normalized) ? normalized : null;
}

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
    modRoots: [],
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

export function getSystemInfo(): Promise<SystemInfo> {
  if (!isTauri()) {
    return Promise.resolve({
      appVersion: "0.1.0",
      arch: "web",
      os: "Browser Preview",
    });
  }

  return invokeCommand<SystemInfo>("get_system_info");
}

export function getDiskInfo(): Promise<DiskInfo[]> {
  if (!isTauri()) {
    return Promise.reject(new Error("Disk information is available in the desktop app."));
  }

  return invokeCommand<DiskInfo[]>("get_disk_info");
}

export function getDefaultInstallDir(): Promise<string> {
  if (!isTauri()) {
    return Promise.reject(new Error("Native install folders are available in the desktop app."));
  }

  return invokeCommand<string>("get_default_install_dir");
}

export function scanLocalPluginManifests(rootPath: string): Promise<PluginManifestDiscoveryResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Local plugin manifest discovery is available in the desktop app."),
    );
  }

  return invokeCommand<PluginManifestDiscoveryResult>("scan_local_plugin_manifests", {
    rootPath,
  });
}

export function stageSignedPluginPackage(
  input: SignedPluginPackageStageRequest,
): Promise<StagedSignedPluginPackageResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Signed plugin package staging is available in the desktop app."),
    );
  }

  return invokeCommand<StagedSignedPluginPackageResult>("stage_signed_plugin_package", { input });
}

export function auditStagedPluginRegistry(): Promise<StagedPluginRegistryAuditResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Plugin disabled registry audit is available in the desktop app."),
    );
  }

  return invokeCommand<StagedPluginRegistryAuditResult>("audit_staged_plugin_registry");
}

export function provePluginRuntimeSandbox(
  input: PluginRuntimeSandboxProofRequest,
): Promise<PluginRuntimeSandboxProofResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Plugin runtime sandbox proof is available in the desktop app."),
    );
  }

  return invokeCommand<PluginRuntimeSandboxProofResult>("prove_plugin_runtime_sandbox", { input });
}

export function reviewPluginActivationPlan(
  input: PluginActivationPlanReviewRequest,
): Promise<PluginActivationPlanReviewResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Plugin activation plan review is available in the desktop app."),
    );
  }

  return invokeCommand<PluginActivationPlanReviewResult>("review_plugin_activation_plan", {
    input,
  });
}

export function reviewPluginMarketplaceUpdateIndexTrust(
  input: PluginMarketplaceUpdateIndexTrustRequest,
): Promise<PluginMarketplaceUpdateIndexTrustResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Plugin marketplace update-index trust review is available in the desktop app."),
    );
  }

  return invokeCommand<PluginMarketplaceUpdateIndexTrustResult>(
    "review_plugin_marketplace_update_index_trust",
    { input },
  );
}

export function reviewPluginUpdateSigningEnvelope(
  input: PluginUpdateSigningEnvelopeReviewRequest,
): Promise<PluginUpdateSigningEnvelopeReviewResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Plugin update-signing envelope review is available in the desktop app."),
    );
  }

  return invokeCommand<PluginUpdateSigningEnvelopeReviewResult>(
    "review_plugin_update_signing_envelope",
    { input },
  );
}

export function validateLicense(token: string): Promise<StoreLicenseValidationResult> {
  return invokeCommand<StoreLicenseValidationResult>("validate_license", { token });
}

export function getLicenseDeviceId(): Promise<string> {
  return invokeCommand<string>("get_license_device_id");
}

export function getLauncherDeviceId(): Promise<string | null> {
  if (!isTauri()) {
    return Promise.resolve(null);
  }

  return invokeCommand<string>("get_launcher_device_id");
}

export function previewBackupPlan(input: BackupPlanRequest): Promise<BackupPlanPreview> {
  if (!isTauri()) {
    return Promise.reject(new Error("Backup preview is available in the desktop app."));
  }

  return invokeCommand<BackupPlanPreview>("preview_backup_plan", { input });
}

export function runBackupPlan(input: BackupPlanRequest): Promise<BackupExecutionResult> {
  if (!isTauri()) {
    return Promise.reject(new Error("Backup execution is available in the desktop app."));
  }

  return invokeCommand<BackupExecutionResult>("run_backup_plan", { input });
}

export function proveBackupExternalDriveWrite(
  input: BackupExternalDriveWriteProofRequest,
): Promise<BackupExternalDriveWriteProofResult> {
  if (!isTauri()) {
    return Promise.reject(new Error("External drive write proof is available in the desktop app."));
  }

  return invokeCommand<BackupExternalDriveWriteProofResult>("prove_backup_external_drive_write", {
    input,
  });
}

export function proveBackupExternalDriveEjectSafety(
  input: BackupExternalDriveEjectSafetyRequest,
): Promise<BackupExternalDriveEjectSafetyResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("External drive eject-safety proof is available in the desktop app."),
    );
  }

  return invokeCommand<BackupExternalDriveEjectSafetyResult>(
    "prove_backup_external_drive_eject_safety",
    {
      input,
    },
  );
}

export function ejectBackupExternalDrive(
  input: BackupExternalDriveOsEjectRequest,
): Promise<BackupExternalDriveOsEjectResult> {
  if (!isTauri()) {
    return Promise.reject(new Error("External drive OS eject is available in the desktop app."));
  }

  return invokeCommand<BackupExternalDriveOsEjectResult>("eject_backup_external_drive", {
    input,
  });
}

export function previewRestorePlan(input: RestorePlanRequest): Promise<RestorePlanPreview> {
  if (!isTauri()) {
    return Promise.reject(new Error("Restore preview is available in the desktop app."));
  }

  return invokeCommand<RestorePlanPreview>("preview_restore_plan", { input });
}

export function restoreBackup(input: RestorePlanRequest): Promise<RestoreExecutionResult> {
  if (!isTauri()) {
    return Promise.reject(new Error("Restore execution is available in the desktop app."));
  }

  return invokeCommand<RestoreExecutionResult>("restore_backup", { input });
}

export function getLatestBackupStatus(targetPath: string): Promise<BackupManifestStatus | null> {
  if (!isTauri()) {
    return Promise.reject(new Error("Backup status is available in the desktop app."));
  }

  return invokeCommand<BackupManifestStatus | null>("get_latest_backup_status", { targetPath });
}

export function getBackupSchedulerStatus(): Promise<BackupSchedulerStatus> {
  return invokeCommand<BackupSchedulerStatus>("get_backup_scheduler_status");
}

export function saveBackupSchedulerConfig(
  input: BackupSchedulerConfig,
): Promise<BackupSchedulerStatus> {
  return invokeCommand<BackupSchedulerStatus>("save_backup_scheduler_config", { input });
}

export function installBackupScheduler(
  input: BackupSchedulerConfig,
): Promise<BackupSchedulerStatus> {
  return invokeCommand<BackupSchedulerStatus>("install_backup_scheduler", { input });
}

export function uninstallBackupScheduler(): Promise<BackupSchedulerStatus> {
  return invokeCommand<BackupSchedulerStatus>("uninstall_backup_scheduler");
}

export function runBackupSchedulerNow(): Promise<BackupSchedulerRunStatus> {
  return invokeCommand<BackupSchedulerRunStatus>("run_backup_scheduler_now");
}

function getHardwareInfo(): Promise<HardwareInfo> {
  return invokeCommand<HardwareInfo>("get_hardware_info");
}

export async function detectHardwareInfo(): Promise<HardwareInfo> {
  try {
    return await getHardwareInfo();
  } catch {
    return getBrowserHardwareInfo();
  }
}

export function listInstalledGames(): Promise<Game[]> {
  return invokeCommand<Game[]>("list_installed_games");
}

export function listControllers(): Promise<ControllerDevice[]> {
  if (!isTauri()) {
    return Promise.reject(new Error("Controller detection is available in the desktop app."));
  }

  return invokeCommand<ControllerDevice[]>("list_controllers");
}

export function refreshInstalledGames(): Promise<Game[]> {
  return invokeCommand<Game[]>("refresh_installed_games");
}

export function updateAchievementProviderStatus(input: {
  gameId: string;
  status: NonNullable<Game["achievementProviderStatuses"]>[number];
}): Promise<Game> {
  return invokeCommand<Game>("update_achievement_provider_status", { input });
}

export function openAchievementCacheFolder(provider?: string): Promise<string> {
  return invokeCommand<string>("open_achievement_cache_folder", { provider });
}

export function addManualGame(input: { title: string; installPath: string }): Promise<Game> {
  return invokeCommand<Game>("add_manual_game", { input });
}

export function moveGame(input: { gameId: string; newPath: string }): Promise<void> {
  return invokeCommand<void>("move_game", { input });
}

export function verifyGameFiles(gameId: string): Promise<VerifyGameFilesResponse> {
  if (!isTauri()) {
    return Promise.resolve({
      gameId,
      checkedFiles: 0,
      missingFiles: ["Desktop app required for native file verification."],
      manifestTrust: "missing",
      status: "repair_required",
    });
  }

  return invokeCommand<VerifyGameFilesResponse>("verify_game_files", { gameId });
}

export function repairGameFiles(gameId: string): Promise<RepairGameFilesResponse> {
  if (!isTauri()) {
    return Promise.reject(new Error("File repair is available in the desktop app."));
  }

  return invokeCommand<RepairGameFilesResponse>("repair_game_files", { gameId });
}

export async function launchGame(gameId: string): Promise<LaunchGameResponse> {
  await activateBestControllerLayoutForGame(gameId);
  const response = await invokeCommand<LaunchGameResponse>("launch_game", { gameId });
  writeActivePerformanceGameContext({ gameId });
  return response;
}

export function getRemotePlayDescriptor(game: Game | null | undefined): RemotePlayDescriptor {
  if (!game) {
    return unsupportedRemotePlay("No game selected.");
  }

  const request = remotePlayRequestForGame(game);
  const steamAppId = resolveRemoteSteamAppId(game);
  if (steamAppId) {
    return {
      supported: true,
      providerLabel: "Steam",
      actionLabel: "Remote Play",
      statusLabel: `Steam AppID ${steamAppId}`,
      detail: "Official Steam delegation",
      request,
    };
  }

  const delegate = resolveRemoteDelegate(game);
  if (delegate) {
    return {
      supported: true,
      providerLabel: delegate.providerLabel,
      actionLabel: delegate.actionLabel,
      statusLabel: delegate.statusLabel,
      detail: delegate.detail,
      request,
    };
  }

  return unsupportedRemotePlay("No supported Remote Play URI.");
}

export function startRemotePlay(game: Game): Promise<RemotePlayLaunchResult> {
  const descriptor = getRemotePlayDescriptor(game);
  if (!descriptor.supported || !descriptor.request) {
    return Promise.reject(new Error(descriptor.detail));
  }
  if (!isTauri()) {
    return Promise.reject(new Error("Remote Play delegation is available in the desktop app."));
  }

  return invokeCommand<RemotePlayLaunchResult>("start_remote_play", {
    input: descriptor.request,
  });
}

function unsupportedRemotePlay(detail: string): RemotePlayDescriptor {
  return {
    supported: false,
    providerLabel: "Remote Play",
    actionLabel: "Remote Play",
    statusLabel: "Unavailable",
    detail,
    request: null,
  };
}

function remotePlayRequestForGame(game: Game): RemotePlayRequest {
  return {
    gameId: cleanOptionalString(game.id),
    launcher: cleanOptionalString(getGameSource(game) || game.launcher || null),
    externalId: cleanOptionalString(game.externalId ?? null),
    launchUri: cleanOptionalString(game.launchUri ?? null),
    cloudGamingUrl: cleanOptionalString(game.cloudGamingUrl ?? null),
  };
}

function resolveRemoteSteamAppId(game: Game): string | null {
  const source = getGameSource(game);
  if (source === "steam") {
    const externalId = normalizeSteamAppId(game.externalId);
    if (externalId) return externalId;

    const gameId = normalizeSteamAppId(game.id);
    if (gameId) return gameId;
  }

  return steamAppIdFromLaunchUri(game.launchUri);
}

function resolveRemoteDelegate(game: Game): {
  providerLabel: string;
  actionLabel: string;
  statusLabel: string;
  detail: string;
} | null {
  const cloudUrl = cleanOptionalString(game.cloudGamingUrl ?? null);
  if (cloudUrl && isRemoteDelegateUriAllowed(cloudUrl)) {
    return {
      providerLabel: "Cloud",
      actionLabel: "Remote Play",
      statusLabel: "HTTPS cloud endpoint",
      detail: "Configured cloud stream",
    };
  }

  const launchUri = cleanOptionalString(game.launchUri ?? null);
  if (launchUri && isRemoteDelegateUriAllowed(launchUri)) {
    return {
      providerLabel: "Launcher",
      actionLabel: "Remote Play",
      statusLabel: remoteStatusForUri(launchUri),
      detail: "Official launcher URI",
    };
  }

  return null;
}

function isRemoteDelegateUriAllowed(uri: string): boolean {
  const trimmed = uri.trim();
  if (trimmed.startsWith("http://")) return false;
  return REMOTE_PLAY_ALLOWED_URI_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function remoteStatusForUri(uri: string): string {
  if (uri.startsWith("steam://")) return "Steam URI";
  if (uri.startsWith("com.epicgames.launcher://")) return "Epic URI";
  if (uri.startsWith("goggalaxy://")) return "GOG URI";
  if (uri.startsWith("ms-xbl-38966778-3f57-4f6e-a6e9-3b81c79fbb3f://")) return "Xbox URI";
  if (uri.startsWith("battlenet://")) return "Battle.net URI";
  if (uri.startsWith("origin2://")) return "EA URI";
  if (uri.startsWith("uplay://")) return "Ubisoft URI";
  if (uri.startsWith("https://")) return "HTTPS endpoint";
  return "Launcher URI";
}

function cleanOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeSteamAppId(value: string | null | undefined): string | null {
  const trimmed = cleanOptionalString(value);
  if (!trimmed) return null;
  const candidate = trimmed.toLowerCase().startsWith("steam-") ? trimmed.slice(6) : trimmed;
  if (!/^[1-9]\d{0,9}$/.test(candidate)) return null;
  return candidate;
}

function steamAppIdFromLaunchUri(uri: string | null | undefined): string | null {
  const trimmed = cleanOptionalString(uri);
  if (!trimmed) return null;
  const match = /^steam:\/\/(?:run|rungameid)\/([^/?#&]+)/.exec(trimmed);
  return normalizeSteamAppId(match?.[1]);
}

export function applyControllerLayout(input: {
  gameId: string;
  layout: ControllerLayout;
}): Promise<ControllerRuntimeStatus> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Controller runtime activation is available in the desktop app."),
    );
  }

  return invokeCommand<ControllerRuntimeStatus>("apply_controller_layout", { input });
}

export function clearControllerLayout(): Promise<ControllerRuntimeStatus> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Controller runtime clearing is available in the desktop app."),
    );
  }

  return invokeCommand<ControllerRuntimeStatus>("clear_controller_layout");
}

export function getControllerRuntimeStatus(): Promise<ControllerRuntimeStatus> {
  if (!isTauri()) {
    return Promise.resolve({
      activeGameId: null,
      activeLayoutName: "Browser Preview Only",
      activeTemplate: null,
      configPath: "browser:controller-runtime-preview",
      driverMessage:
        "Browser preview: layout editing is local. Runtime activation requires the desktop app.",
      keyboardMouseEmulationReady: false,
      nativePassthroughReady: false,
      vigemBusDetected: false,
    });
  }

  return invokeCommand<ControllerRuntimeStatus>("get_controller_runtime_status");
}

async function activateBestControllerLayoutForGame(gameId: string): Promise<void> {
  try {
    const { listControllerLayouts } = await import("./supabase/controllers");
    const layouts = await listControllerLayouts({
      gameId,
      controllerType: "all",
      includeGlobal: true,
    });
    const layout =
      layouts.find((candidate) => candidate.gameId === gameId && candidate.isDefault) ??
      layouts.find((candidate) => candidate.gameId === gameId) ??
      layouts.find((candidate) => candidate.gameId === null && candidate.isDefault) ??
      layouts.find((candidate) => candidate.gameId === null);

    if (layout) {
      await applyControllerLayout({ gameId, layout });
    } else {
      await clearControllerLayout();
    }
  } catch (error) {
    console.warn("Controller layout activation skipped", error);
  }
}

export function syncGameAchievements(
  game: Game,
  steamId?: string,
): Promise<SyncGameAchievementsResponse> {
  if (game.launcher === "xbox") {
    const titleId = game.externalId?.trim() || game.id || game.title;
    // Xbox uses its own sync command
    return invokeCommand<SyncGameAchievementsResponse>("sync_xbox_achievements", {
      gameId: game.id,
      titleId,
    });
  }
  if (["gog", "epic", "ea", "ubisoft", "battlenet"].includes(game.launcher ?? "")) {
    return invokeCommand<SyncGameAchievementsResponse>("sync_local_game_achievements", {
      gameId: game.id,
      provider: game.launcher,
    });
  }
  return invokeCommand<SyncGameAchievementsResponse>("sync_game_achievements", {
    gameId: game.id,
    steamId,
  });
}

export function uninstallGame(gameId: string): Promise<UninstallGameResponse> {
  return invokeCommand<UninstallGameResponse>("uninstall_game", { gameId });
}

export function syncGameSaves(gameId: string): Promise<SyncGameSavesResponse> {
  return invokeCommand<SyncGameSavesResponse>("sync_game_saves", { gameId });
}

export async function readCachedSupabaseAccessToken(): Promise<string | null> {
  return invokeCommand<string | null>("read_cached_supabase_access_token");
}

export function saveRemoteCompanionDeviceSecret(
  input: RemoteCompanionDeviceSecretInput,
): Promise<RemoteCompanionDeviceSecretStatus> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Remote companion device secrets can only be saved in the desktop app."),
    );
  }

  return invokeCommand<RemoteCompanionDeviceSecretStatus>("save_remote_companion_device_secret", {
    input,
  });
}

export function getRemoteCompanionDeviceSecretStatus(): Promise<RemoteCompanionDeviceSecretStatus> {
  if (!isTauri()) {
    return Promise.resolve({
      deviceId: null,
      deviceSecretHint: null,
      hasSecret: false,
      updatedAtEpochMs: null,
    });
  }

  return invokeCommand<RemoteCompanionDeviceSecretStatus>(
    "get_remote_companion_device_secret_status",
  );
}

export function clearRemoteCompanionDeviceSecret(): Promise<RemoteCompanionDeviceSecretStatus> {
  if (!isTauri()) {
    return Promise.resolve({
      deviceId: null,
      deviceSecretHint: null,
      hasSecret: false,
      updatedAtEpochMs: null,
    });
  }

  return invokeCommand<RemoteCompanionDeviceSecretStatus>("clear_remote_companion_device_secret");
}

export function getBroadcastStreamKeyVaultStatus(
  input: BroadcastStreamKeyVaultStatusRequest,
): Promise<BroadcastStreamKeyVaultStatus> {
  if (!isTauri()) {
    return Promise.resolve({
      channelId: input.channelId,
      configured: false,
      message: "Broadcast stream-key vault is available in the desktop app.",
      provider: input.provider,
      secretHint: null,
      storage: "desktop keychain slot",
    });
  }

  return invokeCommand<BroadcastStreamKeyVaultStatus>("get_broadcast_stream_key_vault_status", {
    input,
  });
}

export function setBroadcastStreamKeySecret(
  input: BroadcastStreamKeyVaultSaveRequest,
): Promise<BroadcastStreamKeyVaultStatus> {
  if (!isTauri()) {
    return Promise.reject(new Error("Broadcast stream keys can only be saved in the desktop app."));
  }

  return invokeCommand<BroadcastStreamKeyVaultStatus>("set_broadcast_stream_key_secret", {
    input,
  });
}

export function clearBroadcastStreamKeySecret(
  input: BroadcastStreamKeyVaultClearRequest,
): Promise<BroadcastStreamKeyVaultStatus> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Broadcast stream keys can only be cleared in the desktop app."),
    );
  }

  return invokeCommand<BroadcastStreamKeyVaultStatus>("clear_broadcast_stream_key_secret", {
    input,
  });
}

export async function pollRemoteCompanionInstallJobsOnce(
  limit?: number,
): Promise<RemoteCompanionPollOnceResult> {
  if (!isTauri()) {
    return {
      claimed: 0,
      configured: false,
      failed: 0,
      jobs: [],
      started: 0,
    };
  }

  const { supabaseUrl, supabaseAnonKey, supabaseConfigError } = await import("./supabase/config");
  if (supabaseConfigError || !supabaseUrl || !supabaseAnonKey) {
    throw new CloudNotConfiguredError(
      supabaseConfigError ??
        "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY for remote companion polling.",
    );
  }

  return invokeCommand<RemoteCompanionPollOnceResult>("remote_companion_poll_once", {
    input: {
      apiKey: supabaseAnonKey,
      limit,
      supabaseUrl,
    },
  });
}

export function isCloudKeyPresent(userId: string): Promise<boolean> {
  if (!isTauri()) {
    return Promise.reject(new Error("Cloud key inspection is available in the desktop app."));
  }

  return invokeCommand<boolean>("is_cloud_key_present", { userId });
}

export function generateCloudKey(userId: string): Promise<string> {
  if (!isTauri()) {
    return Promise.reject(new Error("Cloud key generation is available in the desktop app."));
  }

  return invokeCommand<string>("generate_cloud_key", { userId });
}

export function rotateCloudKey(userId: string): Promise<string> {
  if (!isTauri()) {
    return Promise.reject(new Error("Cloud key rotation is available in the desktop app."));
  }

  return invokeCommand<string>("rotate_cloud_key", { userId });
}

export class CloudNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudNotConfiguredError";
  }
}

async function buildCloudArgs(
  gameId: string,
  accessToken: string | null,
  userId: string,
): Promise<CommandArgs> {
  if (!accessToken) {
    throw new CloudNotConfiguredError(
      "Sign in required for cloud sync. No cached access token found.",
    );
  }
  const { supabaseUrl, supabaseAnonKey, supabaseConfigError } = await import("./supabase/config");
  if (supabaseConfigError || !supabaseUrl || !supabaseAnonKey) {
    throw new CloudNotConfiguredError(
      supabaseConfigError ?? "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY for cloud sync.",
    );
  }
  return {
    input: {
      gameId,
      supabaseUrl,
      apiKey: supabaseAnonKey,
      accessToken,
      userId,
    },
  };
}

export async function uploadGameSavesToCloud(
  gameId: string,
  options: {
    accessToken: string | null;
    deleteCloudRelativePaths?: string[];
    savePaths?: string[];
    selectedRelativePaths?: string[];
    userId: string;
  },
): Promise<UploadGameSavesToCloudResponse> {
  if (!isTauri()) {
    throw new Error("Cloud save upload is available in the desktop app.");
  }

  const args = await buildCloudArgs(gameId, options.accessToken, options.userId);
  const input = args.input && typeof args.input === "object" ? args.input : {};
  return invokeCommand<UploadGameSavesToCloudResponse>("upload_game_saves_to_cloud", {
    input: {
      ...input,
      deleteCloudRelativePaths: options.deleteCloudRelativePaths ?? [],
      savePaths: options.savePaths ?? [],
      ...(options.selectedRelativePaths
        ? { selectedRelativePaths: options.selectedRelativePaths }
        : {}),
    },
  });
}

export async function downloadGameSavesFromCloud(
  gameId: string,
  options: { accessToken: string | null; userId: string },
): Promise<DownloadGameSavesFromCloudResponse> {
  if (!isTauri()) {
    throw new Error("Cloud save download is available in the desktop app.");
  }

  const args = await buildCloudArgs(gameId, options.accessToken, options.userId);
  return invokeCommand<DownloadGameSavesFromCloudResponse>("download_game_saves_from_cloud", args);
}

export async function restoreGameSavesFromCloud(
  gameId: string,
  options: {
    accessToken: string | null;
    deleteLocalPaths?: string[];
    savePaths?: string[];
    selectedRelativePaths?: string[];
    userId: string;
  },
): Promise<RestoreGameSavesFromCloudResponse> {
  if (!isTauri()) {
    throw new Error("Cloud save restore is available in the desktop app.");
  }

  const args = await buildCloudArgs(gameId, options.accessToken, options.userId);
  const input = args.input && typeof args.input === "object" ? args.input : {};
  return invokeCommand<RestoreGameSavesFromCloudResponse>("restore_game_saves_from_cloud", {
    input: {
      ...input,
      deleteLocalPaths: options.deleteLocalPaths ?? [],
      savePaths: options.savePaths ?? [],
      ...(options.selectedRelativePaths
        ? { selectedRelativePaths: options.selectedRelativePaths }
        : {}),
    },
  });
}

export async function checkGameSaveConflicts(
  gameId: string,
  options: { accessToken: string | null; userId: string; savePaths?: string[] },
): Promise<CheckGameSaveConflictsResponse> {
  if (!isTauri()) {
    throw new Error("Cloud save conflict checks are available in the desktop app.");
  }

  const args = await buildCloudArgs(gameId, options.accessToken, options.userId);
  const input = args.input && typeof args.input === "object" ? args.input : {};
  return invokeCommand<CheckGameSaveConflictsResponse>("check_game_save_conflicts", {
    input: {
      ...input,
      savePaths: options.savePaths ?? [],
    },
  });
}

export function startDownload(
  gameId: string,
  title?: string,
  downloadUrl?: string,
  downloadSha256?: string,
  installManifestUrl?: string,
  installManifestSha256?: string,
): Promise<StartDownloadResponse> {
  return invokeCommand<StartDownloadResponse>("start_download", {
    gameId,
    gameTitle: title,
    downloadUrl,
    downloadSha256,
    installManifestUrl,
    installManifestSha256,
  });
}

export function previewLanTransferCopy(
  input: LanTransferCopyRequest,
): Promise<LanTransferCopyPreview> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("LAN transfer native copy preview is available in the desktop app."),
    );
  }

  return invokeCommand<LanTransferCopyPreview>("preview_lan_transfer_copy", { input });
}

export function previewLanTransferResumeCancelLedger(
  input: LanTransferResumeCancelLedgerRequest,
): Promise<LanTransferResumeCancelLedger> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("LAN transfer resume/cancel ledger is available in the desktop app."),
    );
  }

  return invokeCommand<LanTransferResumeCancelLedger>("preview_lan_transfer_resume_cancel_ledger", {
    input,
  });
}

export function previewLanTransferPeerDiscoveryPreflight(
  input: LanTransferPeerDiscoveryPreflightRequest,
): Promise<LanTransferPeerDiscoveryPreflightResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("LAN peer discovery preflight is available in the desktop app."),
    );
  }

  return invokeCommand<LanTransferPeerDiscoveryPreflightResult>(
    "preview_lan_transfer_peer_discovery_preflight",
    { input },
  );
}

export function getLanTransferCopyJobs(): Promise<LanTransferCopyJob[]> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("LAN transfer copy job status is available in the desktop app."),
    );
  }

  return invokeCommand<LanTransferCopyJob[]>("get_lan_transfer_copy_jobs");
}

export function startLanTransferCopyJob(
  input: LanTransferCopyRequest,
): Promise<LanTransferCopyJob> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("LAN transfer cancellable copy jobs are available in the desktop app."),
    );
  }

  return invokeCommand<LanTransferCopyJob>("start_lan_transfer_copy_job", { input });
}

export function cancelLanTransferCopyJob(jobId: string): Promise<LanTransferCopyJob> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("LAN transfer copy job cancellation is available in the desktop app."),
    );
  }

  return invokeCommand<LanTransferCopyJob>("cancel_lan_transfer_copy_job", { jobId });
}

export function runLanTransferCopy(input: LanTransferCopyRequest): Promise<LanTransferCopyResult> {
  if (!isTauri()) {
    return Promise.reject(new Error("LAN transfer native copy is available in the desktop app."));
  }

  return invokeCommand<LanTransferCopyResult>("run_lan_transfer_copy", { input });
}

export function runLanTransferResumeCopy(
  input: LanTransferCopyRequest,
): Promise<LanTransferResumeCopyResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("LAN transfer native resume copy is available in the desktop app."),
    );
  }

  return invokeCommand<LanTransferResumeCopyResult>("run_lan_transfer_resume_copy", { input });
}

export function runLanTransferCleanupCandidates(
  input: LanTransferCleanupCandidatesRequest,
): Promise<LanTransferCleanupCandidatesResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("LAN transfer cleanup candidates deletion is available in the desktop app."),
    );
  }

  return invokeCommand<LanTransferCleanupCandidatesResult>("run_lan_transfer_cleanup_candidates", {
    input,
  });
}

export function applyCrossStoreSaveCopy(
  input: CrossStoreSaveApplyRequest,
): Promise<CrossStoreSaveApplyResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Cross-store save native copy is available in the desktop app."),
    );
  }

  return invokeCommand<CrossStoreSaveApplyResult>("apply_cross_store_save_copy", { input });
}

export function rollbackCrossStoreSaveCopy(
  input: CrossStoreSaveRollbackRequest,
): Promise<CrossStoreSaveRollbackResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Cross-store save native rollback is available in the desktop app."),
    );
  }

  return invokeCommand<CrossStoreSaveRollbackResult>("rollback_cross_store_save_copy", {
    input,
  });
}

export function proveCrossStoreSaveLocalE2E(): Promise<CrossStoreSaveLocalE2EProofResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Cross-store save local E2E proof is available in the desktop app."),
    );
  }

  return invokeCommand<CrossStoreSaveLocalE2EProofResult>("prove_cross_store_save_local_e2e");
}

export async function proveCrossStoreSaveSupabaseKeychainStaging(
  gameId: string,
  options: {
    accessToken: string | null;
    consent?: CrossStoreSaveSupabaseKeychainStagingProofConsent;
    userId: string;
  },
): Promise<CrossStoreSaveSupabaseKeychainStagingProofResult> {
  if (!isTauri()) {
    throw new Error(
      "Cross-store save Supabase/keychain staging proof is available in the desktop app.",
    );
  }

  const args = await buildCloudArgs(gameId, options.accessToken, options.userId);
  const input = args.input && typeof args.input === "object" ? args.input : {};
  return invokeCommand<CrossStoreSaveSupabaseKeychainStagingProofResult>(
    "prove_cross_store_save_supabase_keychain_staging",
    {
      input: {
        ...input,
        consent: options.consent ?? {
          accepted: true,
          gameId,
          operation: "cross_store_save_supabase_keychain_staging_proof",
          userId: options.userId,
        },
      },
    },
  );
}

export function openSteamLoginWindow(): Promise<void> {
  if (!isTauri()) {
    return Promise.reject(new Error("Steam login is available in the desktop app."));
  }

  return invokeCommand<void>("open_steam_login_window");
}

export async function openSteamScraperWindow(steamId: string) {
  return invokeCommand<void>("open_steam_scraper_window", { steamId });
}

export async function fetchSteamProfileName(steamId: string) {
  return invokeCommand<string | null>("fetch_steam_profile_name", { steamId });
}

export async function fetchSteamNewsForApp(appId: string): Promise<unknown> {
  return invokeCommand<unknown>("fetch_steam_news", { appId });
}

export function openExternalUrl(url: string): Promise<void> {
  return invokeCommand<void>("open_external_url", { url });
}

export function openGogLoginWindow(): Promise<void> {
  if (!isTauri()) {
    return Promise.reject(new Error("GOG login is available in the desktop app."));
  }

  return invokeCommand<void>("open_gog_login_window");
}

export interface GogToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
}

export function gogExchangeCode(code: string): Promise<GogToken> {
  return invokeCommand<GogToken>("gog_exchange_code", { code });
}

export function gogRefreshToken(): Promise<GogToken> {
  return invokeCommand<GogToken>("gog_refresh_token_command");
}

export function gogGetToken(): Promise<GogToken | null> {
  return invokeCommand<GogToken | null>("gog_get_token");
}

export function gogLogout(): Promise<void> {
  return invokeCommand<void>("gog_logout");
}

function gogFetchOwnedGames(): Promise<OwnedGame[]> {
  return invokeCommand<OwnedGame[]>("gog_fetch_owned_games");
}

export interface EaToken {
  accessToken: string;
  capturedAt: number;
}

export function openEaLoginWindow(): Promise<void> {
  if (!isTauri()) {
    return Promise.reject(new Error("EA App login is available in the desktop app."));
  }

  return invokeCommand<void>("open_ea_login_window");
}

export function eaGetToken(): Promise<EaToken | null> {
  return invokeCommand<EaToken | null>("ea_get_token");
}

export function eaLogout(): Promise<void> {
  return invokeCommand<void>("ea_logout");
}

export function eaFetchOwnedGames(): Promise<OwnedGame[]> {
  return invokeCommand<OwnedGame[]>("ea_fetch_owned_games");
}

export async function openEpicLoginWindow(): Promise<void> {
  if (!isTauri()) {
    return Promise.reject(new Error("Epic Games login is available in the desktop app."));
  }

  return invokeCommand<void>("open_epic_login_window");
}

export async function authenticateEpicLegendary(code: string): Promise<string> {
  return invokeCommand<string>("authenticate_epic_legendary", { code });
}

export function openXboxLoginWindow(): Promise<void> {
  if (!isTauri()) {
    return Promise.reject(new Error("Xbox login is available in the desktop app."));
  }

  return invokeCommand<void>("open_xbox_login_window");
}

export interface XboxFetchResult {
  games: OwnedGame[];
  gamertag?: string | null;
}

export function fetchXboxOwnedGames(code: string): Promise<XboxFetchResult> {
  return invokeCommand<XboxFetchResult>("fetch_xbox_owned_games", { code });
}

export function launchXboxGame(pfn: string): Promise<void> {
  return invokeCommand<void>("launch_xbox_game", { pfn });
}

export function installXboxGame(pfn: string): Promise<void> {
  return invokeCommand<void>("install_xbox_game", { pfn });
}

export function fetchGamePassCatalog(): Promise<OwnedGame[]> {
  return invokeCommand<OwnedGame[]>("fetch_game_pass_catalog");
}

export interface OwnedGame {
  id: string;
  externalId?: string | null;
  title: string;
  description: string;
  coverUrl: string | null;
  logoUrl: string | null;
  iconUrl?: string;
  playtimeMinutes: number;
  lastPlayedAt?: string | null;
  cloudGamingUrl?: string | null;
}

type SteamRawGame = Record<string, unknown>;

function readString(record: SteamRawGame, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
}

function readNumber(record: SteamRawGame, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number.parseFloat(value.replace(/,/g, ""));
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

function steamImageUrl(appId: string, asset: string) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/${asset}`;
}

export function normalizeSteamOwnedGames(games: unknown): OwnedGame[] {
  if (!Array.isArray(games)) {
    return [];
  }

  return games.flatMap((game): OwnedGame[] => {
    if (!game || typeof game !== "object") {
      return [];
    }

    const record = game as SteamRawGame;
    const appId =
      readString(record, ["appid", "appId", "app_id"]) ||
      readString(record, ["id"]).replace(/^steam-owned-/, "");
    const title = readString(record, ["title", "name"]);

    if (!appId || !title) {
      return [];
    }

    const existingId = readString(record, ["id"]);
    const hours = readNumber(record, ["hours_forever", "hours", "playtimeHours"]);
    const playtimeMinutes =
      readNumber(record, ["playtimeMinutes", "playtime_minutes"]) || Math.round(hours * 60);

    return [
      {
        id: existingId.startsWith("steam-owned-") ? existingId : `steam-owned-${appId}`,
        title,
        description: readString(record, ["description"]) || `Steam game (Owned). AppID: ${appId}`,
        coverUrl:
          readString(record, ["heroUrl", "hero_url", "bannerUrl", "banner_url"]) ||
          steamImageUrl(appId, "library_hero.jpg"),
        logoUrl: readString(record, ["logoUrl", "logo_url"]) || steamImageUrl(appId, "header.jpg"),
        iconUrl: readString(record, ["iconUrl", "icon_url"]) || undefined,
        externalId: readString(record, ["externalId", "external_id"]) || appId,
        playtimeMinutes,
        lastPlayedAt: readString(record, ["lastPlayedAt", "last_played_at"]) || null,
      },
    ];
  });
}

export function fetchSteamOwnedGames(steamId: string): Promise<OwnedGame[]> {
  return invokeCommand<OwnedGame[]>("fetch_steam_owned_games", { steamId });
}

export function fetchGogOwnedGames(): Promise<OwnedGame[]> {
  // Use the backend's token-aware command instead of passing token from frontend
  return gogFetchOwnedGames();
}

export async function fetchEpicOwnedGames(): Promise<OwnedGame[]> {
  return invokeCommand<OwnedGame[]>("fetch_epic_owned_games");
}

export async function fetchUbisoftOwnedGames(): Promise<OwnedGame[]> {
  return invokeCommand<OwnedGame[]>("fetch_ubisoft_owned_games");
}

export async function openBattleNetLoginWindow(): Promise<void> {
  if (!isTauri()) {
    return Promise.reject(new Error("Battle.net login is available in the desktop app."));
  }

  return invokeCommand<void>("open_battlenet_login_window");
}

export async function processBattleNetGamesPayload(payloadB64: string): Promise<OwnedGame[]> {
  return invokeCommand<OwnedGame[]>("process_battlenet_games_payload", { payloadB64 });
}

export function pauseDownload(gameId: string): Promise<void> {
  return invokeCommand<void>("pause_download", { gameId });
}

export function cancelDownload(gameId: string): Promise<void> {
  return invokeCommand<void>("cancel_download", { gameId });
}

export function archiveDownload(gameId: string): Promise<void> {
  return invokeCommand<void>("archive_download", { gameId });
}

export function getDownloadQueue(): Promise<DownloadItem[]> {
  return invokeCommand<DownloadItem[]>("get_download_queue");
}

export function checkProviderHealth(): Promise<ProviderHealthStatus[]> {
  return invokeCommand<ProviderHealthStatus[]>("check_provider_health");
}

export function reconcileDownloads(): Promise<ReconciliationResult> {
  return invokeCommand<ReconciliationResult>("reconcile_downloads");
}

export function startModInstall(input: ModInstallRequest): Promise<ModInstallResult> {
  return invokeCommand<ModInstallResult>("start_mod_install", { input });
}

export function getModQueue(): Promise<ModInstallQueueItem[]> {
  return invokeCommand<ModInstallQueueItem[]>("get_mod_queue");
}

export function pauseModInstall(installId: string): Promise<void> {
  return invokeCommand<void>("pause_mod_install", { installId });
}

export function cancelModInstall(installId: string): Promise<void> {
  return invokeCommand<void>("cancel_mod_install", { installId });
}

export function scanGameMods(gameId: string): Promise<InstalledModInfo[]> {
  return invokeCommand<InstalledModInfo[]>("scan_game_mods", { gameId });
}

export function enableMod(installId: string): Promise<InstalledModInfo> {
  return invokeCommand<InstalledModInfo>("enable_mod", { installId });
}

export function disableMod(installId: string): Promise<InstalledModInfo> {
  return invokeCommand<InstalledModInfo>("disable_mod", { installId });
}

export function uninstallMod(installId: string): Promise<void> {
  return invokeCommand<void>("uninstall_mod", { installId });
}

export function setModProviderSecret(provider: ModProvider, secret: string): Promise<void> {
  return invokeCommand<void>("set_mod_provider_secret", { provider, secret });
}

export function scrapeNexusModInfo(url: string): Promise<NexusModInfo> {
  return invokeCommand<NexusModInfo>("scrape_nexus_mod_info", { url });
}

export function searchNexusMods(
  game: string,
  query: string,
  page?: number,
): Promise<NexusSearchResult[]> {
  return invokeCommand<NexusSearchResult[]>("search_nexus_mods", { game, query, page: page ?? 1 });
}

export function getLocalDatabasePath(): Promise<string> {
  return invokeCommand<string>("get_local_database_path");
}

export function getLocalSyncStatus(): Promise<LocalSyncStatus> {
  return invokeCommand<LocalSyncStatus>("get_local_sync_status");
}

export function getPendingLocalEntities(): Promise<LocalEntityPayload[]> {
  return invokeCommand<LocalEntityPayload[]>("get_pending_local_entities");
}

export function getAllLocalEntities(): Promise<LocalEntityPayload[]> {
  return invokeCommand<LocalEntityPayload[]>("get_all_local_entities");
}

export function markLocalEntitiesSynced(entities: LocalEntityKey[]): Promise<void> {
  return invokeCommand<void>("mark_local_entities_synced", { entities });
}

export function applyRemoteLocalEntities(entities: LocalEntityPayload[]): Promise<void> {
  return invokeCommand<void>("apply_remote_local_entities", { entities });
}

export function getUnsyncedPlaySessions(): Promise<PlaySession[]> {
  return invokeCommand<PlaySession[]>("get_unsynced_play_sessions");
}

export function markPlaySessionsSynced(ids: string[]): Promise<number> {
  return invokeCommand<number>("mark_play_sessions_synced", { ids });
}

export function upsertPlaySession(session: PlaySession): Promise<void> {
  return invokeCommand<void>("upsert_play_session", { session });
}

export function updatePlaySession(
  id: string,
  startedAt?: number | null,
  endedAt?: number | null,
  durationMinutes?: number | null,
): Promise<void> {
  return invokeCommand<void>("update_play_session", {
    id,
    startedAt,
    endedAt,
    durationMinutes,
  });
}

export function deletePlaySession(id: string): Promise<number> {
  return invokeCommand<number>("delete_play_session", { id });
}

export function getPlaySession(id: string): Promise<PlaySession | null> {
  return invokeCommand<PlaySession | null>("get_play_session", { id });
}

export function setCachedGamePlaytime(gameId: string, playtimeMinutes: number): Promise<void> {
  return invokeCommand<void>("set_cached_game_playtime", {
    gameId,
    playtimeMinutes,
  });
}

function getBrowserHardwareInfo(): HardwareInfo {
  const navigatorWithMemory = navigator as Navigator & {
    deviceMemory?: number;
  };
  const cores = navigator.hardwareConcurrency;
  const memory = navigatorWithMemory.deviceMemory;
  const monitor =
    typeof window !== "undefined" && window.screen
      ? `${window.screen.width}x${window.screen.height}`
      : null;

  return {
    controller: null,
    cpu: cores ? `${cores} logical cores` : null,
    gpu: getBrowserGpuName(),
    headset: null,
    keyboard: null,
    monitor,
    mouse: null,
    ram: memory ? `${memory} GB` : null,
    source: "browser",
  };
}

function getBrowserGpuName() {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  const gl =
    canvas.getContext("webgl") ??
    (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);

  if (!gl) return null;

  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  if (!debugInfo) return null;

  const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
  return typeof renderer === "string" && renderer.trim()
    ? normalizeBrowserGpuName(renderer.trim())
    : null;
}

function normalizeBrowserGpuName(renderer: string) {
  const angleMatch = renderer.match(/^ANGLE \([^,]+,\s*([^,(]+)/);
  if (angleMatch?.[1]) {
    return angleMatch[1].trim();
  }

  return renderer.length > 120 ? `${renderer.slice(0, 117)}...` : renderer;
}

// ============================================================================
// Platform Friends Commands
// ============================================================================

export function fetchSteamFriends(steamId: string): Promise<PlatformFriend[]> {
  return invokeCommand<PlatformFriend[]>("fetch_steam_friends", { steamId });
}

export function fetchGogFriends(): Promise<PlatformFriend[]> {
  return invokeCommand<PlatformFriend[]>("fetch_gog_friends");
}

export function fetchEpicFriends(): Promise<PlatformFriend[]> {
  return invokeCommand<PlatformFriend[]>("fetch_epic_friends");
}

export function fetchXboxFriends(xboxToken: string): Promise<PlatformFriend[]> {
  return invokeCommand<PlatformFriend[]>("fetch_xbox_friends", { xboxToken });
}

export function captureScreenshot(): Promise<string> {
  return invokeCommand<string>("capture_screenshot");
}

export function launchCrossPlayJoin(platform: string, gameSlug: string): Promise<string> {
  return invokeCommand<string>("launch_cross_play_join", { platform, gameSlug });
}

export function resolveGameExternalId(gameId: string, platform: string): Promise<string> {
  return invokeCommand<string>("resolve_game_external_id", { gameId, platform });
}
