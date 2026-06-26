import { supabaseUrl, supabaseAnonKey, supabaseConfigError } from "../supabase/config";
import { isTauri } from "@tauri-apps/api/core";
import type {
  BroadcastStreamKeyVaultClearRequest,
  BroadcastStreamKeyVaultSaveRequest,
  BroadcastStreamKeyVaultStatus,
  BroadcastStreamKeyVaultStatusRequest,
  CheckGameSaveConflictsResponse,
  DownloadGameSavesFromCloudResponse,
  RemoteCompanionDeviceSecretInput,
  RemoteCompanionDeviceSecretStatus,
  RemoteCompanionPollOnceResult,
  RestoreGameSavesFromCloudResponse,
  UploadGameSavesToCloudResponse,
} from "./types";
import type { CommandArgs } from "./shared";
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

export function isCloudKeyPresent(userId: string): Promise<boolean> {
  if (!isTauri()) {
    return Promise.reject(new Error("Cloud key inspection is available in the desktop app."));
  }

  return invokeCommand<boolean>("is_cloud_key_present", { userId });
}

export function generateCloudKey(userId: string): Promise<string> {
  if (!isTauri()) {
    return Promise.reject(new Error("Cloud key generation is available in the desktop app."));
  }

  return invokeCommand<string>("generate_cloud_key", { userId });
}

export function rotateCloudKey(userId: string): Promise<string> {
  if (!isTauri()) {
    return Promise.reject(new Error("Cloud key rotation is available in the desktop app."));
  }

  return invokeCommand<string>("rotate_cloud_key", { userId });
}

export class CloudNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudNotConfiguredError";
  }
}

export async function buildCloudArgs(
  gameId: string,
  accessToken: string | null,
  userId: string,
): Promise<CommandArgs> {
  if (!accessToken) {
    throw new CloudNotConfiguredError(
      "Sign in required for cloud sync. No cached access token found.",
    );
  }
  // supabase config imported statically at top
  if (supabaseConfigError || !supabaseUrl || !supabaseAnonKey) {
    throw new CloudNotConfiguredError(
      supabaseConfigError ?? "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY for cloud sync.",
    );
  }
  return {
    input: {
      gameId,
      supabaseUrl,
      apiKey: supabaseAnonKey,
      accessToken,
      userId,
    },
  };
}

export async function uploadGameSavesToCloud(
  gameId: string,
  options: {
    accessToken: string | null;
    deleteCloudRelativePaths?: string[];
    savePaths?: string[];
    selectedRelativePaths?: string[];
    userId: string;
  },
): Promise<UploadGameSavesToCloudResponse> {
  if (!isTauri()) {
    throw new Error("Cloud save upload is available in the desktop app.");
  }

  const args = await buildCloudArgs(gameId, options.accessToken, options.userId);
  const input = args.input && typeof args.input === "object" ? args.input : {};
  return invokeCommand<UploadGameSavesToCloudResponse>("upload_game_saves_to_cloud", {
    input: {
      ...input,
      deleteCloudRelativePaths: options.deleteCloudRelativePaths ?? [],
      savePaths: options.savePaths ?? [],
      ...(options.selectedRelativePaths
        ? { selectedRelativePaths: options.selectedRelativePaths }
        : {}),
    },
  });
}

export async function downloadGameSavesFromCloud(
  gameId: string,
  options: { accessToken: string | null; userId: string },
): Promise<DownloadGameSavesFromCloudResponse> {
  if (!isTauri()) {
    throw new Error("Cloud save download is available in the desktop app.");
  }

  const args = await buildCloudArgs(gameId, options.accessToken, options.userId);
  return invokeCommand<DownloadGameSavesFromCloudResponse>("download_game_saves_from_cloud", args);
}

export async function restoreGameSavesFromCloud(
  gameId: string,
  options: {
    accessToken: string | null;
    deleteLocalPaths?: string[];
    savePaths?: string[];
    selectedRelativePaths?: string[];
    userId: string;
  },
): Promise<RestoreGameSavesFromCloudResponse> {
  if (!isTauri()) {
    throw new Error("Cloud save restore is available in the desktop app.");
  }

  const args = await buildCloudArgs(gameId, options.accessToken, options.userId);
  const input = args.input && typeof args.input === "object" ? args.input : {};
  return invokeCommand<RestoreGameSavesFromCloudResponse>("restore_game_saves_from_cloud", {
    input: {
      ...input,
      deleteLocalPaths: options.deleteLocalPaths ?? [],
      savePaths: options.savePaths ?? [],
      ...(options.selectedRelativePaths
        ? { selectedRelativePaths: options.selectedRelativePaths }
        : {}),
    },
  });
}

export async function checkGameSaveConflicts(
  gameId: string,
  options: { accessToken: string | null; userId: string; savePaths?: string[] },
): Promise<CheckGameSaveConflictsResponse> {
  if (!isTauri()) {
    throw new Error("Cloud save conflict checks are available in the desktop app.");
  }

  const args = await buildCloudArgs(gameId, options.accessToken, options.userId);
  const input = args.input && typeof args.input === "object" ? args.input : {};
  return invokeCommand<CheckGameSaveConflictsResponse>("check_game_save_conflicts", {
    input: {
      ...input,
      savePaths: options.savePaths ?? [],
    },
  });
}
