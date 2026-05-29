export type GameStatus = "installed" | "not_installed" | "update_available";
export type Platform = "windows" | "linux" | "macos";
export type LauncherType =
  | "steam"
  | "epic"
  | "ubisoft"
  | "ea"
  | "battlenet"
  | "gog"
  | "xbox"
  | "manual"
  | "unknown";
export type LogoPosition =
  | "bottomLeft"
  | "upperCenter"
  | "centerCenter"
  | "bottomCenter";
export type DownloadStatus =
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "error";

export interface UnifiedAchievement {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string;
  unlockedAt?: string | null;
  rarity?: number | null;
}

export interface SaveFile {
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
}

export interface SystemInfo {
  os: string;
  arch: string;
  appVersion: string;
}

export interface DiskInfo {
  name: string;
  mountPoint: string;
  totalSpace: number;
  availableSpace: number;
  fileSystem: string;
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

export interface VerifyGameFilesResult {
  gameId: string;
  checkedFiles: number;
  missingFiles: string[];
  status: "verified" | "repair_required";
}

export interface RepairGameFilesResponse {
  gameId: string;
  success: boolean;
  game: Game;
  repairedFiles: string[];
  message: string;
}

export interface CheckGameUpdatesResponse {
  updateCount: number;
  games: Game[];
  message: string;
}

export interface InstallGameUpdateResponse {
  gameId: string;
  success: boolean;
  game: Game;
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
  status: "started";
  message: string;
}

export interface UninstallGameResponse {
  gameId: string;
  success: boolean;
  removedFromLibrary: boolean;
  game?: Game | null;
  message: string;
}

export type * from "./types/profile";
