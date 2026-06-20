export type RemoteInstallHandoffStatus = "pending" | "accepted" | "failed";

export interface RemoteInstallHandoff {
  downloadSha256?: string;
  downloadUrl?: string;
  gameId: string;
  installManifestSha256?: string;
  installManifestUrl?: string;
  source?: "desktop-deep-link" | "web-dashboard";
  title?: string;
}

export type RemoteInstallHandoffParseResult =
  | { status: "absent" }
  | { message: string; status: "invalid" }
  | { handoff: RemoteInstallHandoff; status: "valid" };

export interface RemoteInstallHandoffNotice {
  detail: string;
  status: RemoteInstallHandoffStatus;
  title: string;
}

const GAME_ID_KEYS = ["gameId", "game_id", "id"];
const DOWNLOAD_URL_KEYS = ["downloadUrl", "download_url", "url"];
const DOWNLOAD_SHA_KEYS = ["downloadSha256", "download_sha256", "sha256"];
const INSTALL_MANIFEST_URL_KEYS = [
  "installManifestUrl",
  "install_manifest_url",
  "manifestUrl",
  "manifest_url",
];
const INSTALL_MANIFEST_SHA_KEYS = [
  "installManifestSha256",
  "install_manifest_sha256",
  "manifestSha256",
  "manifest_sha256",
];
const TITLE_KEYS = ["title", "gameTitle", "game_title", "name"];
const SOURCE_KEYS = ["source", "handoffSource", "handoff_source"];
const EXTERNAL_INSTALL_PREFIXES = [
  "steam-",
  "steam-owned-",
  "epic-owned-",
  "ea-owned-",
  "ubisoft-owned-",
  "battlenet-owned-",
  "gog-",
  "gog-owned-",
];

export function parseRemoteInstallHandoff(
  params: Record<string, string>,
): RemoteInstallHandoffParseResult {
  const gameId = readFirstParam(params, GAME_ID_KEYS);
  if (!gameId) {
    return { status: "absent" };
  }

  const downloadUrl = readFirstParam(params, DOWNLOAD_URL_KEYS);
  if (!downloadUrl && !isExternalInstallGameId(gameId)) {
    return {
      message: "Remote install handoff requires an HTTP(S) download URL for internal downloads.",
      status: "invalid",
    };
  }

  if (downloadUrl && !isHttpDownloadUrl(downloadUrl)) {
    return {
      message: "Remote install handoff rejected a non-HTTP(S) download URL.",
      status: "invalid",
    };
  }
  const installManifestUrl = readFirstParam(params, INSTALL_MANIFEST_URL_KEYS);
  if (installManifestUrl && !isHttpDownloadUrl(installManifestUrl)) {
    return {
      message: "Remote install handoff rejected a non-HTTP(S) install manifest URL.",
      status: "invalid",
    };
  }

  const source = readHandoffSource(readFirstParam(params, SOURCE_KEYS));
  return {
    handoff: {
      downloadSha256: readFirstParam(params, DOWNLOAD_SHA_KEYS),
      downloadUrl,
      gameId,
      installManifestSha256: readFirstParam(params, INSTALL_MANIFEST_SHA_KEYS),
      installManifestUrl,
      ...(source ? { source } : {}),
      title: readFirstParam(params, TITLE_KEYS),
    },
    status: "valid",
  };
}

export function buildRemoteInstallHandoffSearch(input: {
  gameId?: string;
  message?: string;
  status: RemoteInstallHandoffStatus;
  title?: string;
}) {
  const params = new URLSearchParams();
  params.set("remoteHandoff", input.status);
  if (input.gameId) params.set("gameId", input.gameId);
  if (input.title) params.set("title", input.title);
  if (input.message) params.set("message", input.message.slice(0, 240));
  return params.toString();
}

export function buildRemoteInstallDeepLink(handoff: RemoteInstallHandoff) {
  const params = new URLSearchParams();
  params.set("gameId", handoff.gameId);
  if (handoff.title) params.set("title", handoff.title);
  if (handoff.downloadUrl) params.set("downloadUrl", handoff.downloadUrl);
  if (handoff.downloadSha256) params.set("downloadSha256", handoff.downloadSha256);
  if (handoff.installManifestUrl) params.set("installManifestUrl", handoff.installManifestUrl);
  if (handoff.installManifestSha256) {
    params.set("installManifestSha256", handoff.installManifestSha256);
  }
  if (handoff.source) params.set("source", handoff.source);
  return `oglauncher://install?${params.toString()}`;
}

export function getRemoteInstallHandoffNotice(
  params: URLSearchParams,
): RemoteInstallHandoffNotice | null {
  const status = params.get("remoteHandoff");
  if (status !== "pending" && status !== "accepted" && status !== "failed") {
    return null;
  }

  const gameLabel = params.get("title") || params.get("gameId") || "Remote install";
  const message = params.get("message");
  const title =
    status === "pending"
      ? "Remote handoff pending"
      : status === "accepted"
        ? "Remote handoff accepted"
        : "Remote handoff failed";
  const fallbackDetail =
    status === "pending"
      ? `${gameLabel} is being passed to the download engine.`
      : status === "accepted"
        ? `${gameLabel} is queued in Downloads.`
        : `${gameLabel} was not queued.`;

  return {
    detail: message ? `${gameLabel}: ${message}` : fallbackDetail,
    status,
    title,
  };
}

function readFirstParam(params: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = params[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function isExternalInstallGameId(gameId: string) {
  return EXTERNAL_INSTALL_PREFIXES.some((prefix) => gameId.startsWith(prefix));
}

function isHttpDownloadUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function readHandoffSource(value: string | undefined): RemoteInstallHandoff["source"] {
  return value === "web-dashboard" || value === "desktop-deep-link" ? value : undefined;
}
