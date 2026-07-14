import { create } from "zustand";
import {
  tauriLauncherUpdateAdapter,
  type LauncherUpdateAdapter,
  type LauncherUpdateDownloadEvent,
  type LauncherUpdateHandle,
} from "../lib/launcher-update";

export type LauncherUpdateStatus =
  | "idle"
  | "checking"
  | "current"
  | "available"
  | "downloading"
  | "installing"
  | "error"
  | "unsupported";

export interface LauncherUpdateProgress {
  downloadedBytes: number;
  totalBytes: number | null;
  percentage: number | null;
}

export interface LauncherUpdateState {
  status: LauncherUpdateStatus;
  currentVersion: string | null;
  latestVersion: string | null;
  notes: string | null;
  progress: LauncherUpdateProgress | null;
  error: string | null;
  unsupportedReason: string | null;
  lastCheckedAt: string | null;
}

const initialState: LauncherUpdateState = {
  status: "idle",
  currentVersion: null,
  latestVersion: null,
  notes: null,
  progress: null,
  error: null,
  unsupportedReason: null,
  lastCheckedAt: null,
};

export const useLauncherUpdateStore = create<LauncherUpdateState>()(() => initialState);

let adapter: LauncherUpdateAdapter = tauriLauncherUpdateAdapter;
let pendingUpdate: LauncherUpdateHandle | null = null;
let checkInFlight: Promise<LauncherUpdateState> | null = null;
let installInFlight: Promise<LauncherUpdateState> | null = null;

/** Checks GitHub through the signed Tauri updater endpoint. Concurrent calls share one request. */
export function checkForLauncherUpdate(): Promise<LauncherUpdateState> {
  if (checkInFlight) return checkInFlight;
  if (installInFlight) return installInFlight;

  const operation = runLauncherUpdateCheck();
  checkInFlight = operation;
  void operation.finally(() => {
    if (checkInFlight === operation) checkInFlight = null;
  });
  return operation;
}

async function runLauncherUpdateCheck(): Promise<LauncherUpdateState> {
  const support = adapter.getRuntimeSupport();
  if (!support.supported) {
    pendingUpdate = null;
    return setLauncherUpdateState({
      ...initialState,
      status: "unsupported",
      unsupportedReason: support.reason,
    });
  }

  useLauncherUpdateStore.setState((state) => ({
    ...state,
    status: "checking",
    latestVersion: null,
    notes: null,
    progress: null,
    error: null,
    unsupportedReason: null,
  }));

  let currentVersion: string | null = useLauncherUpdateStore.getState().currentVersion;
  try {
    currentVersion = await adapter.getCurrentVersion();
    const update = await adapter.check();
    const lastCheckedAt = adapter.now().toISOString();

    if (!update) {
      pendingUpdate = null;
      return setLauncherUpdateState({
        status: "current",
        currentVersion,
        latestVersion: currentVersion,
        notes: null,
        progress: null,
        error: null,
        unsupportedReason: null,
        lastCheckedAt,
      });
    }

    pendingUpdate = update;
    return setLauncherUpdateState({
      status: "available",
      currentVersion: update.currentVersion ?? currentVersion,
      latestVersion: update.version,
      notes: normalizeNotes(update.body),
      progress: null,
      error: null,
      unsupportedReason: null,
      lastCheckedAt,
    });
  } catch (error) {
    pendingUpdate = null;
    return setLauncherUpdateState({
      ...useLauncherUpdateStore.getState(),
      status: "error",
      currentVersion,
      progress: null,
      error: toSafeUpdateError(error, "check"),
      unsupportedReason: null,
      lastCheckedAt: adapter.now().toISOString(),
    });
  }
}

/** Downloads, verifies, installs, and relaunches the update found by the latest check. */
export function installLauncherUpdate(): Promise<LauncherUpdateState> {
  if (installInFlight) return installInFlight;
  if (checkInFlight) return checkInFlight;

  const operation = runLauncherUpdateInstall();
  installInFlight = operation;
  void operation.finally(() => {
    if (installInFlight === operation) installInFlight = null;
  });
  return operation;
}

async function runLauncherUpdateInstall(): Promise<LauncherUpdateState> {
  if (!pendingUpdate) {
    return setLauncherUpdateState({
      ...useLauncherUpdateStore.getState(),
      status: "error",
      progress: null,
      error: "Es wurde noch kein installierbares Launcher-Update gefunden.",
    });
  }

  useLauncherUpdateStore.setState((state) => ({
    ...state,
    status: "downloading",
    progress: { downloadedBytes: 0, totalBytes: null, percentage: null },
    error: null,
  }));

  try {
    await pendingUpdate.downloadAndInstall(handleDownloadEvent);

    useLauncherUpdateStore.setState((state) => ({
      ...state,
      status: "installing",
      progress: finishProgress(state.progress),
    }));
    await adapter.relaunch();
    return useLauncherUpdateStore.getState();
  } catch (error) {
    return setLauncherUpdateState({
      ...useLauncherUpdateStore.getState(),
      status: "error",
      error: toSafeUpdateError(error, "install"),
    });
  }
}

function handleDownloadEvent(event: LauncherUpdateDownloadEvent) {
  useLauncherUpdateStore.setState((state) => {
    if (event.event === "Started") {
      const totalBytes = normalizeByteCount(event.data.contentLength);
      return {
        ...state,
        status: "downloading",
        progress: {
          downloadedBytes: 0,
          totalBytes,
          percentage: totalBytes === null ? null : 0,
        },
      };
    }

    if (event.event === "Progress") {
      const progress = state.progress ?? {
        downloadedBytes: 0,
        totalBytes: null,
        percentage: null,
      };
      const chunkLength = normalizeByteCount(event.data.chunkLength) ?? 0;
      const downloadedBytes = progress.downloadedBytes + chunkLength;
      return {
        ...state,
        status: "downloading",
        progress: {
          ...progress,
          downloadedBytes,
          percentage: calculatePercentage(downloadedBytes, progress.totalBytes),
        },
      };
    }

    return {
      ...state,
      status: "installing",
      progress: finishProgress(state.progress),
    };
  });
}

function finishProgress(progress: LauncherUpdateProgress | null): LauncherUpdateProgress {
  if (!progress) {
    return { downloadedBytes: 0, totalBytes: null, percentage: null };
  }
  if (progress.totalBytes === null) return progress;
  return {
    downloadedBytes: progress.totalBytes,
    totalBytes: progress.totalBytes,
    percentage: 100,
  };
}

function calculatePercentage(downloadedBytes: number, totalBytes: number | null): number | null {
  if (totalBytes === null || totalBytes === 0) return null;
  return Math.min(100, Math.max(0, Math.round((downloadedBytes / totalBytes) * 100)));
}

function normalizeByteCount(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

function normalizeNotes(notes: string | undefined): string | null {
  const normalized = notes?.trim();
  return normalized ? normalized : null;
}

function toSafeUpdateError(error: unknown, phase: "check" | "install"): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/signature|signatur|verification|verify/.test(message)) {
    return "Die Signatur des Launcher-Updates konnte nicht verifiziert werden.";
  }
  if (/network|fetch|offline|http|connection|dns/.test(message)) {
    return "Die Verbindung zum GitHub-Update-Dienst ist fehlgeschlagen.";
  }
  if (/permission|access denied|eacces|eperm/.test(message)) {
    return "Das Launcher-Update konnte wegen fehlender Berechtigungen nicht installiert werden.";
  }
  return phase === "check"
    ? "Die Launcher-Update-Prüfung ist fehlgeschlagen. Bitte versuche es später erneut."
    : "Das Launcher-Update konnte nicht installiert werden. Bitte versuche es erneut.";
}

function setLauncherUpdateState(state: LauncherUpdateState): LauncherUpdateState {
  useLauncherUpdateStore.setState(state, true);
  return useLauncherUpdateStore.getState();
}

export function setLauncherUpdateAdapterForTests(nextAdapter: LauncherUpdateAdapter): void {
  adapter = nextAdapter;
}

export function resetLauncherUpdateStateForTests(): void {
  adapter = tauriLauncherUpdateAdapter;
  pendingUpdate = null;
  checkInFlight = null;
  installInFlight = null;
  useLauncherUpdateStore.setState(initialState, true);
}
