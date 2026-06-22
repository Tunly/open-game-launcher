export type RemoteDownloadReadinessTone = "ready" | "warning" | "blocked";
export type RemoteDownloadCompanionStatus = "missing" | "pairing" | "linked" | "expired";

export type RemoteDownloadReadinessRowId =
  | "desktop-app"
  | "desktop-vault"
  | "hosted-auth"
  | "remote-companion"
  | "always-on"
  | "download-queue";

export interface RemoteDownloadReadinessInput {
  activeDownloadCount: number;
  alwaysOnConfigured: boolean;
  companionStatus?: RemoteDownloadCompanionStatus;
  hasRemoteCompanion: boolean;
  hasDesktopVault?: boolean;
  hasHostedAuth?: boolean;
  isDesktopApp: boolean;
}

export interface RemoteDownloadReadinessRow {
  detail: string;
  id: RemoteDownloadReadinessRowId;
  label: string;
  status: RemoteDownloadReadinessTone;
}

export interface RemoteDownloadReadiness {
  blocker: RemoteDownloadReadinessRow | null;
  progress: number;
  rows: RemoteDownloadReadinessRow[];
  tone: RemoteDownloadReadinessTone;
}

export function getRemoteDownloadReadiness(
  input: RemoteDownloadReadinessInput,
): RemoteDownloadReadiness {
  const activeDownloadCount = normalizeActiveDownloadCount(input.activeDownloadCount);
  const companionStatus = normalizeCompanionStatus(input);
  const rows: RemoteDownloadReadinessRow[] = [
    desktopAppRow(input.isDesktopApp),
    remoteCompanionRow(companionStatus),
    alwaysOnRow(input.alwaysOnConfigured),
    desktopVaultRow(input.hasDesktopVault === true),
    hostedAuthRow(input.hasHostedAuth === true),
    downloadQueueRow(activeDownloadCount),
  ];
  const blocker = rows.find((row) => row.status === "blocked") ?? null;
  const warning = rows.some((row) => row.status === "warning");
  const passedCount = rows.filter((row) => row.status === "ready").length;

  return {
    blocker,
    progress: Math.round((passedCount / rows.length) * 100),
    rows,
    tone: blocker ? "blocked" : warning ? "warning" : "ready",
  };
}

function desktopAppRow(isDesktopApp: boolean): RemoteDownloadReadinessRow {
  if (!isDesktopApp) {
    return {
      detail: "Remote downloads require the installed OG Launcher desktop app.",
      id: "desktop-app",
      label: "Desktop app",
      status: "blocked",
    };
  }

  return {
    detail: "Desktop runtime can receive and start remote download requests.",
    id: "desktop-app",
    label: "Desktop app",
    status: "ready",
  };
}

function remoteCompanionRow(status: RemoteDownloadCompanionStatus): RemoteDownloadReadinessRow {
  if (status === "missing") {
    return {
      detail: "Connect the Mobile/Web Companion before sending downloads remotely.",
      id: "remote-companion",
      label: "Mobile/Web Companion",
      status: "blocked",
    };
  }

  if (status === "pairing") {
    return {
      detail: "Pairing code is staged locally; wait for a companion ping before remote handoff.",
      id: "remote-companion",
      label: "Mobile/Web Companion",
      status: "blocked",
    };
  }

  if (status === "expired") {
    return {
      detail: "The local companion pairing code expired; generate a fresh code.",
      id: "remote-companion",
      label: "Mobile/Web Companion",
      status: "blocked",
    };
  }

  return {
    detail: "Mobile/Web Companion ping is fresh for remote queue handoff.",
    id: "remote-companion",
    label: "Mobile/Web Companion",
    status: "ready",
  };
}

function alwaysOnRow(alwaysOnConfigured: boolean): RemoteDownloadReadinessRow {
  if (!alwaysOnConfigured) {
    return {
      detail: "Always-On is not configured, so remote downloads only work while the app is open.",
      id: "always-on",
      label: "Always-On",
      status: "warning",
    };
  }

  return {
    detail: "Always-On is configured for unattended remote downloads.",
    id: "always-on",
    label: "Always-On",
    status: "ready",
  };
}

function desktopVaultRow(hasDesktopVault: boolean): RemoteDownloadReadinessRow {
  if (!hasDesktopVault) {
    return {
      detail:
        "Local pairing is guarded until the native desktop vault can store device secrets outside browser storage.",
      id: "desktop-vault",
      label: "Desktop Vault",
      status: "blocked",
    };
  }

  return {
    detail: "Native desktop vault is available for remote companion device secrets.",
    id: "desktop-vault",
    label: "Desktop Vault",
    status: "ready",
  };
}

function hostedAuthRow(hasHostedAuth: boolean): RemoteDownloadReadinessRow {
  if (!hasHostedAuth) {
    return {
      detail:
        "Hosted relay authentication is not verified, so local companion checks cannot claim production readiness.",
      id: "hosted-auth",
      label: "Hosted Auth",
      status: "blocked",
    };
  }

  return {
    detail: "Hosted relay authentication is verified for production remote handoff.",
    id: "hosted-auth",
    label: "Hosted Auth",
    status: "ready",
  };
}

function downloadQueueRow(activeDownloadCount: number): RemoteDownloadReadinessRow {
  return {
    detail:
      activeDownloadCount === 0
        ? "No active downloads are using the queue right now."
        : `${activeDownloadCount} active download${activeDownloadCount === 1 ? "" : "s"} in the queue.`,
    id: "download-queue",
    label: "Download queue",
    status: "ready",
  };
}

function normalizeActiveDownloadCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function normalizeCompanionStatus(
  input: Pick<RemoteDownloadReadinessInput, "companionStatus" | "hasRemoteCompanion">,
): RemoteDownloadCompanionStatus {
  if (input.companionStatus) return input.companionStatus;
  return input.hasRemoteCompanion ? "linked" : "missing";
}
