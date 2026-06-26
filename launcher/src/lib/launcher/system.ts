import { isTauri } from "@tauri-apps/api/core";
import type { DiskInfo, HardwareInfo, SystemInfo } from "./types";
import { getBrowserHardwareInfo, invokeCommand } from "./shared";

export function getSystemInfo(): Promise<SystemInfo> {
  if (!isTauri()) {
    return Promise.resolve({
      appVersion: "0.1.0",
      arch: "web",
      os: "Browser Preview",
    });
  }

  return invokeCommand<SystemInfo>("get_system_info");
}

export function getDiskInfo(): Promise<DiskInfo[]> {
  if (!isTauri()) {
    return Promise.reject(new Error("Disk information is available in the desktop app."));
  }

  return invokeCommand<DiskInfo[]>("get_disk_info");
}

export function getDefaultInstallDir(): Promise<string> {
  if (!isTauri()) {
    return Promise.reject(new Error("Native install folders are available in the desktop app."));
  }

  return invokeCommand<string>("get_default_install_dir");
}

function getHardwareInfo(): Promise<HardwareInfo> {
  return invokeCommand<HardwareInfo>("get_hardware_info");
}

export async function detectHardwareInfo(): Promise<HardwareInfo> {
  try {
    return await getHardwareInfo();
  } catch {
    return getBrowserHardwareInfo();
  }
}
