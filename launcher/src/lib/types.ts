type GameStatus = "installed" | "not_installed" | "update_available";
export type Platform =
  | "windows"
  | "linux"
  | "macos"
  | "Steam"
  | "GOG"
  | "Epic Games"
  | "Xbox"
  | "EA"
  | "Ubisoft"
  | "Battle.net";
export type CatalogSource = "pc_game_pass";
type LauncherType =
  "steam" | "epic" | "ubisoft" | "ea" | "battlenet" | "gog" | "xbox" | "ogl" | "manual" | "unknown";
export type ClientPlatformId = "steam" | "epic" | "gog" | "xbox" | "ubisoft" | "battlenet" | "ea";
type LogoPosition = "bottomLeft" | "upperCenter" | "centerCenter" | "bottomCenter";
export type DownloadStatus =
  | "queued"
  | "starting"
  | "downloading"
  | "paused"
  | "pausing"
  | "resuming"
  | "installing"
  | "completed"
  | "failed"
  | "cancelled"
  | "error";

interface UnifiedAchievement {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string;
  unlockedAt?: string | null;
  rarity?: number | null;
  source?: string;
  sourceAchievementId?: string;
  providerConfidence?: "official" | "unofficial" | "local";
}

export type { UnifiedAchievement };

export interface AchievementSummary {
  unlocked: number;
  total: number;
  isPerfect: boolean;
  source: string;
}

interface SaveFile {
  id: string;
  path: string;
  label?: string;
  sizeBytes?: number | null;
  modifiedAt?: string | null;
  syncedAt?: string | null;
}

export interface Game {
  id: string;
  title: string;
  slug?: string;
  catalogSource?: CatalogSource;
  description: string;
  version: string;
  launcher?: LauncherType;
  externalId?: string;
  coverUrl?: string;
  iconUrl?: string;
  iconUrls?: string[];
  logoUrl?: string;
  logoUrls?: string[];
  logoPosition?: LogoPosition;
  logoWidthPercent?: number;
  logoHeightPercent?: number;
  status: GameStatus;
  platform: Platform;
  installPath?: string;
  executablePath?: string;
  downloadUrl?: string;
  downloadSha256?: string;
  processNames?: string[];
  launchUri?: string;
  cloudGamingUrl?: string;
  lastPlayed?: string;
  lastPlayedAt?: string | null;
  playtimeMinutes?: number;
  sizeGb?: number;
  players?: string[];
  features?: string[];
  genres?: string[];
  categories?: string[];
  categoryLabels?: string[];
  tags?: string[];
  tagLabels?: string[];
  productCategory?: string; // e.g. "game", "software", "video", "dlc", "soundtrack", "demo", "beta"
  steamDeckCompatibility?: "verified" | "playable" | "unsupported" | "unknown";
  protonCompatible?: boolean;
  developer?: string;
  publisher?: string;
  releaseDate?: string;
  rating?: number | null;
  achievements?: UnifiedAchievement[];
  achievementSummary?: AchievementSummary;
  achievementsSyncedAt?: string | null;
  achievementBasisSource?: string | null;
  achievementBasisGameId?: string | null;
  achievementProviderStatuses?: Array<{
    source: string;
    status: "available" | "not_connected" | "no_api" | "private" | "failed" | "unsupported";
    stability: "official" | "unofficial" | "local";
    message: string;
  }>;
  saveFiles?: SaveFile[];
  friendsPlaying?: string[];
}

export interface StoreGame {
  id: string;
  slug?: string;
  title: string;
  description: string;
  coverImageUrl?: string;
  downloadsCount?: number;
  price: number;
  priceAvailable?: boolean;
  originalPrice?: number;
  discountPercent?: number;
  isFree?: boolean;
  temporaryFreeUntil?: string;
  platform: Platform[];
  developer?: string;
  publisher?: string;
  rating?: number;
  ratingsCount?: number;
  releaseDate?: string;
  genres?: string[];
  tagLine: string;
  downloadUrl?: string;
  downloadSha256?: string;
}

export interface DownloadItem {
  id: string;
  gameId: string;
  title: string;
  progress: number;
  speed: string;
  status: DownloadStatus;
  eta?: number;
  platform?: string;
  phase?: string;
  bytesDownloaded?: number | null;
  bytesTotal?: number | null;
  canPause?: boolean;
  canCancel?: boolean;
  external?: boolean;
  lastUpdatedAt?: number;
  eventRevision?: number;
  provider?: string;
  rawStatus?: string;
  progressSource?: string;
  error?: string | null;
}

export interface ProviderHealthStatus {
  provider: string;
  installed: boolean;
  dataReadable: boolean;
  details: string;
  manifestsCount: number;
}

export interface PlatformClientHealth {
  platformId: ClientPlatformId;
  displayName: string;
  installed: boolean;
  running: boolean;
  installPath?: string | null;
  pid?: number | null;
  processName?: string | null;
  uptimeSeconds?: number | null;
  windowHandle?: string | null;
  windowTitle?: string | null;
  statusLabel: string;
  canLaunch: boolean;
  lastCheckedAt: string;
}

export interface PlatformClientLifecycleEvent extends PlatformClientHealth {
  event: "client_started" | "client_stopped" | "client_window_updated";
  occurredAt: string;
}

export interface GameLifecycleEvent {
  event: "game_started" | "game_stopped";
  gameId: string;
  title: string;
  launcher: string;
  running: boolean;
  pid?: number | null;
  processName?: string | null;
  uptimeSeconds?: number | null;
  lastInputSeconds?: number | null;
  windowHandle?: string | null;
  windowTitle?: string | null;
  lastPlayed?: string | null;
  playtimeMinutes?: number | null;
  occurredAt: string;
}

export interface GameRuntimeStatus {
  gameId: string;
  title: string;
  launcher: string;
  running: boolean;
  pid?: number | null;
  processName?: string | null;
  uptimeSeconds?: number | null;
  lastInputSeconds?: number | null;
  windowHandle?: string | null;
  windowTitle?: string | null;
  occurredAt: string;
}

export type GameRuntimeUpdate = GameRuntimeStatus;

export interface ClientPathOverlay {
  id: string;
  label: string;
  sourcePath: string;
  targetPath: string;
  enabled: boolean;
  readOnly: boolean;
  notes?: string | null;
}

export interface ClientAssetCacheEntry {
  id: string;
  label: string;
  cacheKey: string;
  cachePath: string;
  enabled: boolean;
  priority: number;
  notes?: string | null;
}

export type ClientUpdatePolicy = "manual" | "notifyOnly" | "openClient" | "autoApply";

export interface ClientModificationConfig {
  platformId: ClientPlatformId;
  displayName: string;
  localInstallerPath?: string | null;
  localUpdaterPath?: string | null;
  latestKnownVersion?: string | null;
  updatePolicy: ClientUpdatePolicy;
  pathOverlays: ClientPathOverlay[];
  assetCaches: ClientAssetCacheEntry[];
  updatedAt?: string | null;
}

export interface ClientAssetCacheLookupEntry {
  cacheKey: string;
  ownerPlatformId: ClientPlatformId;
  ownerDisplayName: string;
  entryId: string;
  label: string;
  cachePath: string;
  priority: number;
  conflictCount: number;
}

export interface ClientAssetCacheConflictEntry {
  ownerPlatformId: ClientPlatformId;
  ownerDisplayName: string;
  entryId: string;
  label: string;
  cachePath: string;
  priority: number;
}

export interface ClientAssetCacheConflict {
  cacheKey: string;
  entries: ClientAssetCacheConflictEntry[];
}

export interface ClientAssetCacheLookup {
  generatedAt: string;
  entries: ClientAssetCacheLookupEntry[];
  conflicts: ClientAssetCacheConflict[];
}

export interface ClientPollingSettings {
  lifecyclePollIntervalSeconds: number;
  updatedAt?: string | null;
}

export interface ClientUpdateHistoryItem {
  id: string;
  platformId: ClientPlatformId;
  checkedAt: string;
  action: string;
  status: string;
  installedVersion?: string | null;
  latestKnownVersion?: string | null;
  message: string;
}

export interface ClientUpdateStatus {
  platformId: ClientPlatformId;
  displayName: string;
  installed: boolean;
  running: boolean;
  installedVersion?: string | null;
  latestKnownVersion?: string | null;
  updateAvailable: boolean;
  statusLabel: string;
  detail: string;
  canOpenUpdater: boolean;
  officialDownloadUri?: string | null;
  localUpdaterPath?: string | null;
  updatePolicy: ClientUpdatePolicy;
  schedulerEnabled: boolean;
  lastScheduledCheckAt?: string | null;
  nextScheduledCheckAt?: string | null;
  lastCheckedAt: string;
  history: ClientUpdateHistoryItem[];
}

export interface ScheduledClientUpdateChecksResponse {
  checkedAt: string;
  nextCheckAt?: string | null;
  checkedClients: ClientUpdateStatus[];
  skippedClients: string[];
  updateCount: number;
  message: string;
}

export interface ClientUpdateSchedulerRunStatus {
  checkedAt: string;
  checkedClients?: ClientUpdateStatus[];
  success: boolean;
  message: string;
  updateCount: number;
  checkedCount: number;
  skippedCount: number;
  nextCheckAt?: string | null;
}

export interface ClientUpdateSchedulerStatus {
  supported: boolean;
  installed: boolean;
  provider: string;
  configPath: string;
  statusPath: string;
  lastRun?: ClientUpdateSchedulerRunStatus | null;
  message: string;
}

export interface ClientInstallerMetadata {
  platformId: ClientPlatformId;
  displayName: string;
  officialDownloadUri?: string | null;
  updaterUri?: string | null;
  localInstallerPath?: string | null;
  localUpdaterPath?: string | null;
  canOpenOfficialDownload: boolean;
  canOpenLocalInstaller: boolean;
  canOpenUpdater: boolean;
  installActionLabel: string;
  updateActionLabel: string;
  installNotes: string;
  updateNotes: string;
}

export interface ClientInstallStageCheck {
  label: string;
  status: "pass" | "warning" | "blocked";
  detail: string;
}

export interface ClientInstallStagePlan {
  platformId: ClientPlatformId;
  displayName: string;
  stage: "alreadyInstalled" | "localInstaller" | "officialDownload" | "blocked" | "desktopOnly";
  targetLabel: string;
  targetUri?: string | null;
  targetPath?: string | null;
  canProceed: boolean;
  requiresUserConsent: boolean;
  requiresLicenseReview: boolean;
  requiresAdminReview: boolean;
  checks: ClientInstallStageCheck[];
  message: string;
}

export interface ClientAutoApplyCheck {
  label: string;
  status: "pass" | "warning" | "blocked";
  detail: string;
}

export interface ClientAutoApplyPlan {
  platformId: ClientPlatformId;
  displayName: string;
  policy: ClientUpdatePolicy;
  stage:
    "policyOff" | "noUpdate" | "safeOpenOnly" | "blocked" | "unsupported" | "ready" | "desktopOnly";
  safeTargetLabel?: string | null;
  canAutoApply: boolean;
  canOpenSafeUpdater: boolean;
  allowsSilentExecution: boolean;
  requiresProviderMechanism: boolean;
  requiresUserConsent: boolean;
  checks: ClientAutoApplyCheck[];
  message: string;
}

export interface ClientManagerAutoApplyCapabilityRequest {
  platformId: ClientPlatformId;
  installTargetPath?: string | null;
  requiredDiskBytes?: number | null;
}

export interface ClientManagerAutoApplyCapabilityCheck {
  id: string;
  label: string;
  status: "pass" | "warning" | "blocked";
  detail: string;
  evidence: string;
}

export interface ClientManagerAutoApplyCapabilityPreview {
  platformId: ClientPlatformId;
  displayName: string;
  generatedAt: string;
  targetPath?: string | null;
  requiredDiskBytes: number;
  availableDiskBytes?: number | null;
  diskMountPoint?: string | null;
  autoApplyStage: ClientAutoApplyPlan["stage"];
  canAutoApply: boolean;
  checks: ClientManagerAutoApplyCapabilityCheck[];
  message: string;
}

export interface ClientManagerMountApplySandboxConsent {
  accepted: boolean;
  sourcePath: string;
  targetPath: string;
  operation: "client_manager_mount_apply_sandbox_proof";
}

export interface ClientManagerMountApplySandboxRequest {
  sourcePath: string;
  targetPath: string;
  consent: ClientManagerMountApplySandboxConsent;
}

export interface ClientManagerMountApplySandboxFile {
  relativePath: string;
  sizeBytes: number;
  sha256: string;
}

export interface ClientManagerMountApplySandboxProof {
  proofId: string;
  sourcePath: string;
  targetPath: string;
  manifestPath: string;
  fileCount: number;
  bytesCopied: number;
  verifiedFiles: number;
  rollbackVerified: boolean;
  targetCreated: boolean;
  symlinkFree: boolean;
  providerPathsTouched: boolean;
  adminElevationUsed: boolean;
  mountedPathsCreated: boolean;
  files: ClientManagerMountApplySandboxFile[];
  message: string;
}

export interface ClientManagerActionResult {
  platformId: ClientPlatformId;
  action: string;
  openedTarget: string;
  message: string;
  historyItem: ClientUpdateHistoryItem;
}

export type BroadcastStreamProvider = "custom" | "twitch" | "youtube";

export interface BroadcastStreamKeyVaultConsent {
  accepted: boolean;
  channelId: string;
  operation: "broadcast_stream_key_vault_save" | "broadcast_stream_key_vault_clear";
  provider: BroadcastStreamProvider;
}

export interface BroadcastStreamKeyVaultStatusRequest {
  channelId: string;
  provider: BroadcastStreamProvider;
}

export interface BroadcastStreamKeyVaultSaveRequest {
  channelId: string;
  consent: BroadcastStreamKeyVaultConsent;
  provider: BroadcastStreamProvider;
  secret: string;
}

export interface BroadcastStreamKeyVaultClearRequest {
  channelId: string;
  consent: BroadcastStreamKeyVaultConsent;
  provider: BroadcastStreamProvider;
}

export interface BroadcastStreamKeyVaultStatus {
  channelId: string;
  configured: boolean;
  message: string;
  provider: BroadcastStreamProvider;
  secretHint?: string | null;
  storage: string;
}

export interface ReconciliationResult {
  installedRemoved: string[];
  activeRestored: string[];
  staleCleaned: string[];
  errors: string[];
}

export interface SystemInfo {
  os: string;
  arch: string;
  appVersion: string;
}

export interface DiskInfo {
  availableSpace: number;
  fileSystem: string;
  isReadOnly: boolean;
  isRemovable: boolean;
  kind: string;
  mountPoint: string;
  name: string;
  totalSpace: number;
}

export interface HardwareInfo {
  cpu: string | null;
  gpu: string | null;
  ram: string | null;
  monitor: string | null;
  keyboard: string | null;
  mouse: string | null;
  headset: string | null;
  source: "native" | "browser";
}

export interface LaunchGameResponse {
  gameId: string;
  success: boolean;
  message: string;
}

export interface StopGameResponse {
  gameId: string;
  success: boolean;
  pid: number;
  message: string;
}

export interface SyncGameAchievementsResponse {
  achievementSource?: "steam_authenticated_session" | "steam_community_fallback";
  achievementPersistence?: "hosted" | "local";
  gameId: string;
  success: boolean;
  game: Game;
  syncedAchievements: number;
  unlockedAchievements: number;
  message: string;
}

export interface StartDownloadResponse {
  gameId: string;
  downloadId: string;
  status: "started" | "already_queued" | "already_installed";
  message: string;
}

export interface CrossStoreSaveApplyConsent {
  accepted: boolean;
  operation: "cross_store_save_native_copy_apply";
  sourceRoot: string;
  targetRoot: string;
  actionCount: number;
}

export interface CrossStoreSaveApplyAction {
  id: string;
  sourceRelativePath: string;
  targetRelativePath: string;
  expectedSha256?: string | null;
  expectedSizeBytes?: number | null;
}

export interface CrossStoreSaveApplyRequest {
  actions: CrossStoreSaveApplyAction[];
  consent: CrossStoreSaveApplyConsent;
  gameId: string;
  sourceLabel: string;
  sourceRoot: string;
  targetLabel: string;
  targetRoot: string;
}

export interface CrossStoreSaveAppliedFile {
  id: string;
  sourceRelativePath: string;
  targetRelativePath: string;
  sizeBytes: number;
  sha256: string;
  backedUp: boolean;
  backupRelativePath?: string | null;
  backupSizeBytes?: number | null;
  backupSha256?: string | null;
}

export interface CrossStoreSaveApplyResult {
  backupCount: number;
  bytesCopied: number;
  fileCount: number;
  files: CrossStoreSaveAppliedFile[];
  gameId: string;
  manifestPath: string;
  message: string;
  rollbackManifestId: string;
  sourceLabel: string;
  sourceRoot: string;
  targetLabel: string;
  targetRoot: string;
  verifiedFiles: number;
}

export interface CrossStoreSaveRollbackConsent {
  accepted: boolean;
  operation: "cross_store_save_native_copy_rollback";
  targetRoot: string;
  manifestPath: string;
  rollbackManifestId: string;
  fileCount: number;
}

export interface CrossStoreSaveRollbackRequest {
  consent: CrossStoreSaveRollbackConsent;
  gameId: string;
  manifestPath: string;
  rollbackManifestId: string;
  targetRoot: string;
}

export interface CrossStoreSaveRollbackFile {
  id: string;
  targetRelativePath: string;
  action: string;
  sizeBytes: number;
  sha256?: string | null;
}

export interface CrossStoreSaveRollbackResult {
  deletedFiles: number;
  files: CrossStoreSaveRollbackFile[];
  gameId: string;
  manifestPath: string;
  message: string;
  restoredFiles: number;
  rollbackManifestId: string;
  targetRoot: string;
  verifiedFiles: number;
}

export interface CrossStoreSaveLocalE2EProofResult {
  apply: CrossStoreSaveApplyResult;
  appliedFiles: number;
  bytesCopied: number;
  deletedFiles: number;
  keychainRestoreSkipped: boolean;
  manifestPath: string;
  message: string;
  proofId: string;
  providerTransferSkipped: boolean;
  rollback: CrossStoreSaveRollbackResult;
  rollbackManifestId: string;
  rolledBackFiles: number;
  restoredFiles: number;
  sandboxCleaned: boolean;
  sandboxRoot: string;
  sourceRoot: string;
  supabaseBucketSkipped: boolean;
  targetRoot: string;
  verifiedApplyFiles: number;
  verifiedRollbackFiles: number;
}

export interface LocalSyncStatus {
  databasePath: string;
  schemaVersion: number;
  entityCount: number;
  pendingChanges: number;
}

export interface LocalEntityPayload {
  kind: "games" | "downloads";
  id: string;
  entity: Record<string, unknown>;
  updatedAt: number;
  deletedAt?: number | null;
  syncToken: string;
}

export interface LocalEntityKey {
  kind: "games" | "downloads";
  id: string;
  syncToken: string;
}

export interface PlaySession {
  id: string;
  gameId: string;
  startedAt: number;
  endedAt: number;
  durationMinutes: number;
  platform: "windows" | "linux" | "macos" | "web" | "unknown";
  launcherDeviceId: string;
  syncedAt?: number | null;
}

export interface UninstallGameResponse {
  gameId: string;
  success: boolean;
  removedFromLibrary: boolean;
  game?: Game | null;
  message: string;
}

export type VerificationStatus = "verified" | "repair_required";
export type ManifestTrustStatus = "missing" | "unsigned" | "signed" | "invalid";

export interface VerifyGameFilesResponse {
  gameId: string;
  checkedFiles: number;
  missingFiles: string[];
  manifestTrust: ManifestTrustStatus;
  status: VerificationStatus;
}

export interface RepairGameFilesResponse {
  gameId: string;
  success: boolean;
  game: Game;
  repairedFiles: string[];
  message: string;
}

export interface SyncGameSavesResponse {
  gameId: string;
  success: boolean;
  game: Game;
  syncedFiles: string[];
  missingFiles: string[];
  syncRoot: string;
  message: string;
}

export type * from "./types/profile";
export type * from "./types/backup";
