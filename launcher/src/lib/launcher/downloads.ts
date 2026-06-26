import type {
  DownloadItem,
  ProviderHealthStatus,
  ReconciliationResult,
  StartDownloadResponse,
} from "./types";
import { invokeCommand } from "./shared";

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
