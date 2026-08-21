import { invoke, isTauri } from "@tauri-apps/api/core";

export async function reportDesktopStartupProgress(
  progress: number,
  label: string,
): Promise<boolean> {
  if (!isTauri()) {
    return false;
  }

  await invoke("report_startup_progress", { progress, label });
  return true;
}

export async function completeDesktopStartup(): Promise<boolean> {
  if (!isTauri()) {
    return false;
  }

  await invoke("complete_startup");
  return true;
}
