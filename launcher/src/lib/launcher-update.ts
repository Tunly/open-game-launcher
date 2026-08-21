import { isTauri } from "@tauri-apps/api/core";

export type LauncherUpdateDownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished"; data?: Record<string, never> };

export interface LauncherUpdateHandle {
  currentVersion?: string;
  version: string;
  body?: string;
  downloadAndInstall: (onEvent: (event: LauncherUpdateDownloadEvent) => void) => Promise<void>;
}

export interface LauncherUpdateRuntimeSupport {
  supported: boolean;
  reason: string | null;
}

export interface LauncherUpdateAdapter {
  getRuntimeSupport: () => LauncherUpdateRuntimeSupport;
  getCurrentVersion: () => Promise<string>;
  check: () => Promise<LauncherUpdateHandle | null>;
  relaunch: () => Promise<void>;
}

export const tauriLauncherUpdateAdapter: LauncherUpdateAdapter = {
  getRuntimeSupport() {
    if (!isTauri()) {
      return {
        supported: false,
        reason: "Launcher-Updates sind nur in der installierten Desktop-App verfügbar.",
      };
    }

    return { supported: true, reason: null };
  },

  async getCurrentVersion() {
    const { getVersion } = await import("@tauri-apps/api/app");
    return getVersion();
  },

  async check() {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) return null;

    return {
      currentVersion: update.currentVersion,
      version: update.version,
      body: update.body,
      downloadAndInstall: (onEvent) => update.downloadAndInstall(onEvent),
    };
  },

  async relaunch() {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  },
};
