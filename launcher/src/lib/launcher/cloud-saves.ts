import { isTauri } from "@tauri-apps/api/core";
import type {
  BroadcastStreamKeyVaultClearRequest,
  BroadcastStreamKeyVaultSaveRequest,
  BroadcastStreamKeyVaultStatus,
  BroadcastStreamKeyVaultStatusRequest,
} from "./types";
import { invokeCommand } from "./shared";

export async function readCachedSupabaseAccessToken(): Promise<string | null> {
  return invokeCommand<string | null>("read_cached_supabase_access_token");
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
