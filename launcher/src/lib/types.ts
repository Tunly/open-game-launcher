type GameStatus = "installed" | "not_installed" | "update_available";
export type Platform = "windows" | "linux" | "macos";
type LauncherType =
  | "steam"
  | "epic"
  | "ubisoft"
  | "ea"
  | "battlenet"
  | "gog"
  | "xbox"
  | "manual"
  | "unknown";
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
}

export type { UnifiedAchievement };

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
  productCategory?: string; // e.g. "game", "software", "video", "dlc", "soundtrack", "demo", "beta"
  steamDeckCompatibility?: "verified" | "playable" | "unsupported" | "unknown";
  protonCompatible?: boolean;
  developer?: string;
  publisher?: string;
  releaseDate?: string;
  rating?: number | null;
  achievements?: UnifiedAchievement[];
  achievementsSyncedAt?: string | null;
  saveFiles?: SaveFile[];
  friendsPlaying?: string[];
}

export interface StoreGame {
  id: string;
  title: string;
  description: string;
  price: number;
  originalPrice?: number;
  discountPercent?: number;
  isFree?: boolean;
  platform: Platform[];
  developer?: string;
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

export interface HardwareInfo {
  cpu: string | null;
  gpu: string | null;
  ram: string | null;
  monitor: string | null;
  keyboard: string | null;
  mouse: string | null;
  headset: string | null;
  controller: string | null;
  source: "native" | "browser";
}

export interface LaunchGameResponse {
  gameId: string;
  success: boolean;
  message: string;
}

export interface SyncGameAchievementsResponse {
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
  status: "started" | "already_installed";
  message: string;
}

export interface LocalSyncStatus {
  databasePath: string;
  schemaVersion: number;
  entityCount: number;
  pendingChanges: number;
}

export interface LocalEntityPayload {
  kind: "games" | "downloads" | "mod_install_queue" | "mod_installs";
  id: string;
  entity: Record<string, unknown>;
  updatedAt: number;
}

export interface LocalEntityKey {
  kind: "games" | "downloads" | "mod_install_queue" | "mod_installs";
  id: string;
}

export interface UninstallGameResponse {
  gameId: string;
  success: boolean;
  removedFromLibrary: boolean;
  game?: Game | null;
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

export interface UploadGameSavesToCloudResponse {
  gameId: string;
  success: boolean;
  game: Game;
  uploadedFiles: string[];
  missingFiles: string[];
  failedFiles: string[];
  message: string;
}

export interface DownloadGameSavesFromCloudResponse {
  gameId: string;
  success: boolean;
  restoreRoot: string;
  downloadedFiles: string[];
  failedFiles: string[];
  message: string;
}

export interface RestoreGameSavesFromCloudResponse {
  gameId: string;
  success: boolean;
  restoredFiles: string[];
  backedUpFiles: string[];
  skippedFiles: string[];
  failedFiles: string[];
  message: string;
}

export type CloudSyncMode = "manual" | "on_launch" | "on_exit" | "scheduled";

export const CLOUD_SYNC_MODES: readonly CloudSyncMode[] = [
  "manual",
  "on_launch",
  "on_exit",
  "scheduled",
] as const;

export interface CloudSaveSet {
  id: string;
  userId: string;
  localGameKey: string;
  launcher: string;
  externalId: string | null;
  title: string;
  platform: string;
  syncMode: CloudSyncMode;
  lastSyncedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CloudSaveFile {
  id: string;
  saveSetId: string;
  userId: string;
  label: string | null;
  localPath: string;
  storageObjectPath: string | null;
  checksumSha256: string | null;
  sizeBytes: number | null;
  modifiedAt: string | null;
  syncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type * from "./types/profile";
