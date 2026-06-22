import { STORAGE_KEYS } from "./storage-keys";
import type { RemoteInstallHandoff, RemoteInstallHandoffStatus } from "./remote-install-handoff";

export interface RemoteInstallHandoffHistoryRecord {
  downloadHost?: string;
  gameId: string;
  hasDownloadSha256: boolean;
  hasInstallManifestSha256: boolean;
  id: string;
  installManifestHost?: string;
  message?: string;
  source: "desktop-deep-link" | "web-dashboard" | "local-preview";
  status: RemoteInstallHandoffStatus;
  timestamp: number;
  title: string;
}

export const REMOTE_INSTALL_HANDOFF_HISTORY_LIMIT = 8;

interface RemoteInstallHandoffHistoryInput {
  gameId?: string;
  handoff?: RemoteInstallHandoff;
  message?: string;
  params?: Record<string, string | undefined>;
  source?: RemoteInstallHandoffHistoryRecord["source"];
  status: RemoteInstallHandoffStatus;
  timestamp?: number;
  title?: string;
}

export function createRemoteInstallHandoffHistoryRecord({
  gameId,
  handoff,
  message,
  params,
  source = handoff?.source ?? "desktop-deep-link",
  status,
  timestamp = Date.now(),
  title,
}: RemoteInstallHandoffHistoryInput): RemoteInstallHandoffHistoryRecord {
  const resolvedGameId =
    gameId ??
    handoff?.gameId ??
    readFirstParam(params, ["gameId", "game_id", "id"]) ??
    "remote-install";
  const resolvedTitle =
    title ??
    handoff?.title ??
    readFirstParam(params, ["title", "gameTitle", "game_title", "name"]) ??
    resolvedGameId;
  const downloadUrl =
    handoff?.downloadUrl ?? readFirstParam(params, ["downloadUrl", "download_url", "url"]);
  const manifestUrl =
    handoff?.installManifestUrl ??
    readFirstParam(params, [
      "installManifestUrl",
      "install_manifest_url",
      "manifestUrl",
      "manifest_url",
    ]);
  const downloadSha =
    handoff?.downloadSha256 ??
    readFirstParam(params, ["downloadSha256", "download_sha256", "sha256"]);
  const manifestSha =
    handoff?.installManifestSha256 ??
    readFirstParam(params, [
      "installManifestSha256",
      "install_manifest_sha256",
      "manifestSha256",
      "manifest_sha256",
    ]);

  return {
    downloadHost: getSafeUrlHost(downloadUrl),
    gameId: resolvedGameId,
    hasDownloadSha256: Boolean(downloadSha),
    hasInstallManifestSha256: Boolean(manifestSha),
    id: `${timestamp}-${status}-${resolvedGameId}`.replace(/[^a-z0-9:_-]+/gi, "-"),
    installManifestHost: getSafeUrlHost(manifestUrl),
    message: message?.trim().slice(0, 180) || undefined,
    source,
    status,
    timestamp,
    title: resolvedTitle,
  };
}

export function normalizeRemoteInstallHandoffHistory(
  value: unknown,
): RemoteInstallHandoffHistoryRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is RemoteInstallHandoffHistoryRecord => isHistoryRecord(entry))
    .slice(0, REMOTE_INSTALL_HANDOFF_HISTORY_LIMIT);
}

export function appendRemoteInstallHandoffHistory(
  record: RemoteInstallHandoffHistoryRecord,
  storage: Storage | undefined = getLocalStorage(),
) {
  if (!storage) return;

  const current = readRemoteInstallHandoffHistory(storage);
  writeRemoteInstallHandoffHistory([record, ...current], storage);
}

export function readRemoteInstallHandoffHistory(
  storage: Storage | undefined = getLocalStorage(),
): RemoteInstallHandoffHistoryRecord[] {
  if (!storage) return [];

  try {
    return normalizeRemoteInstallHandoffHistory(
      JSON.parse(storage.getItem(STORAGE_KEYS.REMOTE_INSTALL_HANDOFF_HISTORY) ?? "[]"),
    );
  } catch {
    return [];
  }
}

export function writeRemoteInstallHandoffHistory(
  records: RemoteInstallHandoffHistoryRecord[],
  storage: Storage | undefined = getLocalStorage(),
) {
  if (!storage) return;

  storage.setItem(
    STORAGE_KEYS.REMOTE_INSTALL_HANDOFF_HISTORY,
    JSON.stringify(normalizeRemoteInstallHandoffHistory(records)),
  );
}

function isHistoryRecord(value: unknown): value is RemoteInstallHandoffHistoryRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<RemoteInstallHandoffHistoryRecord>;
  return (
    typeof record.gameId === "string" &&
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    typeof record.timestamp === "number" &&
    (record.status === "pending" || record.status === "accepted" || record.status === "failed")
  );
}

function readFirstParam(
  params: Record<string, string | undefined> | undefined,
  keys: string[],
): string | undefined {
  if (!params) return undefined;
  for (const key of keys) {
    const value = params[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function getSafeUrlHost(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return url.host;
  } catch {
    return undefined;
  }
}

function getLocalStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
