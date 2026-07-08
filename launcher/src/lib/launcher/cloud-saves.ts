import { supabaseUrl, supabaseAnonKey, supabaseConfigError } from "../supabase/config";
import { isTauri } from "@tauri-apps/api/core";
import type {
  BroadcastStreamKeyVaultClearRequest,
  BroadcastStreamKeyVaultSaveRequest,
  BroadcastStreamKeyVaultStatus,
  BroadcastStreamKeyVaultStatusRequest,
  RemoteCompanionDeviceSecretInput,
  RemoteCompanionDeviceSecretStatus,
  RemoteCompanionPollOnceResult,
} from "./types";
import { invokeCommand } from "./shared";

export async function readCachedSupabaseAccessToken(): Promise<string | null> {
  return invokeCommand<string | null>("read_cached_supabase_access_token");
}

export function saveRemoteCompanionDeviceSecret(
  input: RemoteCompanionDeviceSecretInput,
): Promise<RemoteCompanionDeviceSecretStatus> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Remote companion device secrets can only be saved in the desktop app."),
    );
  }

  return invokeCommand<RemoteCompanionDeviceSecretStatus>("save_remote_companion_device_secret", {
    input,
  });
}

export function getRemoteCompanionDeviceSecretStatus(): Promise<RemoteCompanionDeviceSecretStatus> {
  if (!isTauri()) {
    return Promise.resolve({
      deviceId: null,
      deviceSecretHint: null,
      hasSecret: false,
      updatedAtEpochMs: null,
    });
  }

  return invokeCommand<RemoteCompanionDeviceSecretStatus>(
    "get_remote_companion_device_secret_status",
  );
}

export function clearRemoteCompanionDeviceSecret(): Promise<RemoteCompanionDeviceSecretStatus> {
  if (!isTauri()) {
    return Promise.resolve({
      deviceId: null,
      deviceSecretHint: null,
      hasSecret: false,
      updatedAtEpochMs: null,
    });
  }

  return invokeCommand<RemoteCompanionDeviceSecretStatus>("clear_remote_companion_device_secret");
}

export function getBroadcastStreamKeyVaultStatus(
  input: BroadcastStreamKeyVaultStatusRequest,
): Promise<BroadcastStreamKeyVaultStatus> {
  if (!isTauri()) {
    return Promise.resolve({
      channelId: input.channelId,
      configured: false,
      message: "Broadcast stream-key vault is available in the desktop app.",
      provider: input.provider,
      secretHint: null,
      storage: "desktop keychain slot",
    });
  }

  return invokeCommand<BroadcastStreamKeyVaultStatus>("get_broadcast_stream_key_vault_status", {
    input,
  });
}

export function setBroadcastStreamKeySecret(
  input: BroadcastStreamKeyVaultSaveRequest,
): Promise<BroadcastStreamKeyVaultStatus> {
  if (!isTauri()) {
    return Promise.reject(new Error("Broadcast stream keys can only be saved in the desktop app."));
  }

  return invokeCommand<BroadcastStreamKeyVaultStatus>("set_broadcast_stream_key_secret", {
    input,
  });
}

export function clearBroadcastStreamKeySecret(
  input: BroadcastStreamKeyVaultClearRequest,
): Promise<BroadcastStreamKeyVaultStatus> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Broadcast stream keys can only be cleared in the desktop app."),
    );
  }

  return invokeCommand<BroadcastStreamKeyVaultStatus>("clear_broadcast_stream_key_secret", {
    input,
  });
}

export async function pollRemoteCompanionInstallJobsOnce(
  limit?: number,
): Promise<RemoteCompanionPollOnceResult> {
  if (!isTauri()) {
    return {
      claimed: 0,
      configured: false,
      failed: 0,
      jobs: [],
      started: 0,
    };
  }

  // supabase config imported statically at top
  if (supabaseConfigError || !supabaseUrl || !supabaseAnonKey) {
    throw new CloudNotConfiguredError(
      supabaseConfigError ??
        "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY for remote companion polling.",
    );
  }

  return invokeCommand<RemoteCompanionPollOnceResult>("remote_companion_poll_once", {
    input: {
      apiKey: supabaseAnonKey,
      limit,
      supabaseUrl,
    },
  });
}

export class CloudNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudNotConfiguredError";
  }
}
