export type GameStatus = "installed" | "not_installed" | "update_available";
export type Platform = "windows" | "linux" | "macos";
export type LogoPosition =
  | "bottomLeft"
  | "upperCenter"
  | "centerCenter"
  | "bottomCenter";
export type DownloadStatus =
  | "downloading"
  | "paused"
  | "completed"
  | "failed";

export interface Game {
  id: string;
  title: string;
  description: string;
  version: string;
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
}

export interface StoreGame {
  id: string;
  title: string;
  description: string;
  price: number;
  isFree?: boolean;
  platform: Platform[];
  tagLine: string;
}

export interface DownloadItem {
  id: string;
  gameId: string;
  title: string;
  progress: number;
  speed: string;
  status: DownloadStatus;
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

export interface VerifyGameFilesResult {
  gameId: string;
  checkedFiles: number;
  missingFiles: string[];
  status: "verified" | "repair_required";
}

export interface StartDownloadResponse {
  gameId: string;
  downloadId: string;
  status: "started";
  message: string;
}

export type * from "./types/profile";
