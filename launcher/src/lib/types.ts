export type GameStatus = "installed" | "not_installed" | "update_available";
export type Platform = "windows" | "linux" | "macos";
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
  status: GameStatus;
  platform: Platform;
  installPath?: string;
  lastPlayed?: string;
  playtimeMinutes?: number;
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
