import { isTauri } from "@tauri-apps/api/core";
import type { HardwareInfo, SystemInfo } from "./types";
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
