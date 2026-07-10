import { invoke, isTauri } from "@tauri-apps/api/core";

export async function completeDesktopStartup(): Promise<boolean> {
  if (!isTauri()) {
    return false;
  }

  await invoke("complete_startup");
  return true;
}
