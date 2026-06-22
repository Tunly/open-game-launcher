import { invoke } from "@tauri-apps/api/core";

import type {
  ModProviderStagingProbeRequest,
  ModProviderStagingProbeResult,
  NativeModSearchRequest,
  NativeModSearchResult,
} from "./types/mods";

export function searchNativeMods(input: NativeModSearchRequest): Promise<NativeModSearchResult[]> {
  return invoke<NativeModSearchResult[]>("search_native_mods", { input });
}

export function runModProviderStagingProbe(
  input: ModProviderStagingProbeRequest,
): Promise<ModProviderStagingProbeResult> {
  return invoke<ModProviderStagingProbeResult>("run_mod_provider_staging_probe", { input });
}
