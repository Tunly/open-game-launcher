import { isTauri } from "@tauri-apps/api/core";

import type {
  DownloadItem,
  ProviderHealthStatus,
  ReconciliationResult,
  StartDownloadResponse,
} from "./types";
import { invokeCommand } from "./shared";

const DESKTOP_DOWNLOAD_ACTIONS_REQUIRED =
  "Game installs and updates are available only in the OG-Launcher desktop app.";

export function startDownload(
  gameId: string,
  title?: string,
  downloadUrl?: string,
  downloadSha256?: string,
  installManifestUrl?: string,
  installManifestSha256?: string,
): Promise<StartDownloadResponse> {
  if (!isTauri()) {
    return Promise.reject(new Error(DESKTOP_DOWNLOAD_ACTIONS_REQUIRED));
  }

  return invokeCommand<StartDownloadResponse>("start_download", {
    gameId,
    gameTitle: title,
    downloadUrl,
    downloadSha256,
    installManifestUrl,
    installManifestSha256,
  });
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

export function removeDownloadHistoryItem(gameId: string): Promise<void> {
  return invokeCommand<void>("remove_download_history_item", { gameId });
}

export function getDownloadQueue(): Promise<DownloadItem[]> {
  return invokeCommand<DownloadItem[]>("get_download_queue");
}

export function getXboxAppDownloads(): Promise<DownloadItem[]> {
  return invokeCommand<DownloadItem[]>("get_xbox_app_downloads");
}

export function checkProviderHealth(): Promise<ProviderHealthStatus[]> {
  return invokeCommand<ProviderHealthStatus[]>("check_provider_health");
}

export function reconcileDownloads(): Promise<ReconciliationResult> {
  return invokeCommand<ReconciliationResult>("reconcile_downloads");
}

export interface DownloadSettings {
  bandwidthLimitKbps: number | null;
  maxConcurrentDownloads: number;
  installRoot: string | null;
}

export function getDownloadSettings(): Promise<DownloadSettings> {
  return invokeCommand<DownloadSettings>("get_download_settings_command");
}

export function saveDownloadSettings(settings: DownloadSettings): Promise<DownloadSettings> {
  return invokeCommand<DownloadSettings>("save_download_settings_command", { settings });
}
