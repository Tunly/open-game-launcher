import { isTauri } from "@tauri-apps/api/core";
import type { StoreLicenseValidationResult } from "./types";
import { invokeCommand } from "./shared";

export function validateLicense(token: string): Promise<StoreLicenseValidationResult> {
  return invokeCommand<StoreLicenseValidationResult>("validate_license", { token });
}

export function getLicenseDeviceId(): Promise<string> {
  return invokeCommand<string>("get_license_device_id");
}

export function getLauncherDeviceId(): Promise<string | null> {
  if (!isTauri()) {
    return Promise.resolve(null);
  }

  return invokeCommand<string>("get_launcher_device_id");
}
