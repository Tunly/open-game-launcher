import { getSupabaseClient } from "./client";
import type {
  CloudSaveFile,
  CloudSaveSet,
  CloudSyncMode,
} from "../types";
import {
  handleError,
  isMissingSchemaError,
  rowConfig,
  rowNullableString,
  rowNumber,
  rowString,
  type UnknownRecord,
} from "./helpers";

const CLOUD_LAUNCHERS = new Set([
  "steam",
  "epic",
  "ubisoft",
  "ea",
  "battlenet",
  "gog",
  "xbox",
  "manual",
  "unknown",
]);

const CLOUD_SYNC_MODES = new Set<CloudSyncMode>([
  "manual",
  "on_launch",
  "on_exit",
  "scheduled",
]);

function normalizeSyncMode(value: string): CloudSyncMode {
  return CLOUD_SYNC_MODES.has(value as CloudSyncMode)
    ? (value as CloudSyncMode)
    : "manual";
}

function toCloudSaveSet(row: UnknownRecord): CloudSaveSet {
  const launcher = rowString(row, "launcher", "unknown");
  return {
    id: rowString(row, "id"),
    userId: rowString(row, "user_id"),
    localGameKey: rowString(row, "local_game_key"),
    launcher: CLOUD_LAUNCHERS.has(launcher) ? launcher : "unknown",
    externalId: rowNullableString(row, "external_id"),
    title: rowString(row, "title"),
    platform: rowString(row, "platform", "unknown"),
    syncMode: normalizeSyncMode(rowString(row, "sync_mode", "manual")),
    lastSyncedAt: rowNullableString(row, "last_synced_at"),
    metadata: rowConfig(row, "metadata"),
    createdAt: rowString(row, "created_at"),
    updatedAt: rowString(row, "updated_at"),
  };
}

function toCloudSaveFile(row: UnknownRecord): CloudSaveFile {
  return {
    id: rowString(row, "id"),
    saveSetId: rowString(row, "save_set_id"),
    userId: rowString(row, "user_id"),
    label: rowNullableString(row, "label"),
    localPath: rowString(row, "local_path"),
    storageObjectPath: rowNullableString(row, "storage_object_path"),
    checksumSha256: rowNullableString(row, "checksum_sha256"),
    sizeBytes:
      typeof row["size_bytes"] === "number" ? (row["size_bytes"] as number) : null,
    modifiedAt: rowNullableString(row, "modified_at"),
    syncedAt: rowNullableString(row, "synced_at"),
    createdAt: rowString(row, "created_at"),
    updatedAt: rowString(row, "updated_at"),
  };
}

export interface UpsertCloudSaveSetInput {
  localGameKey: string;
  title: string;
  launcher?: string;
  externalId?: string | null;
  platform?: string;
  syncMode?: CloudSyncMode;
  metadata?: Record<string, unknown>;
}

export async function getCloudSaveSetByGameKey(
  localGameKey: string,
): Promise<CloudSaveSet | null> {
  const client = getSupabaseClient();
  const { data: userData, error: authError } = await client.auth.getUser();
  handleError(authError);
  if (!userData.user) throw new Error("You must be signed in.");

  const { data, error } = await client
    .from("user_cloud_save_sets")
    .select("*")
    .eq("user_id", userData.user.id)
    .eq("local_game_key", localGameKey)
    .maybeSingle();

  if (isMissingSchemaError(error)) return null;
  handleError(error);
  if (!data) return null;
  return toCloudSaveSet(data as UnknownRecord);
}

export async function listMyCloudSaveSets(): Promise<CloudSaveSet[]> {
  const client = getSupabaseClient();
  const { data: userData, error: authError } = await client.auth.getUser();
  handleError(authError);
  if (!userData.user) throw new Error("You must be signed in.");

  const { data, error } = await client
    .from("user_cloud_save_sets")
    .select("*")
    .eq("user_id", userData.user.id)
    .order("updated_at", { ascending: false });

  if (isMissingSchemaError(error)) return [];
  handleError(error);
  return (data ?? []).map((row) => toCloudSaveSet(row as UnknownRecord));
}

export async function upsertCloudSaveSet(
  input: UpsertCloudSaveSetInput,
): Promise<CloudSaveSet> {
  const client = getSupabaseClient();
  const { data: userData, error: authError } = await client.auth.getUser();
  handleError(authError);
  if (!userData.user) throw new Error("You must be signed in.");

  const launcher = CLOUD_LAUNCHERS.has(input.launcher ?? "")
    ? (input.launcher as string)
    : "unknown";
  const platform = input.platform ?? "unknown";
  const syncMode = input.syncMode ?? "manual";

  const { data, error } = await client
    .from("user_cloud_save_sets")
    .upsert(
      {
        user_id: userData.user.id,
        local_game_key: input.localGameKey,
        title: input.title,
        launcher,
        external_id: input.externalId ?? null,
        platform,
        sync_mode: syncMode,
        metadata: (input.metadata ?? {}) as unknown as Record<string, never>,
      },
      { onConflict: "user_id,local_game_key" },
    )
    .select("*")
    .single();
  handleError(error);
  return toCloudSaveSet(data as UnknownRecord);
}

export async function updateCloudSaveSetSyncMode(
  id: string,
  syncMode: CloudSyncMode,
): Promise<CloudSaveSet> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("user_cloud_save_sets")
    .update({ sync_mode: syncMode })
    .eq("id", id)
    .select("*")
    .single();
  handleError(error);
  return toCloudSaveSet(data as UnknownRecord);
}

export async function markCloudSaveSetSynced(
  id: string,
  syncedAt: string = new Date().toISOString(),
): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client
    .from("user_cloud_save_sets")
    .update({ last_synced_at: syncedAt })
    .eq("id", id);
  handleError(error);
}

export async function deleteCloudSaveSet(id: string): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client
    .from("user_cloud_save_sets")
    .delete()
    .eq("id", id);
  handleError(error);
}

export async function listCloudSaveFilesForSet(
  saveSetId: string,
): Promise<CloudSaveFile[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("user_cloud_save_files")
    .select("*")
    .eq("save_set_id", saveSetId)
    .order("local_path");
  if (isMissingSchemaError(error)) return [];
  handleError(error);
  return (data ?? []).map((row) => toCloudSaveFile(row as UnknownRecord));
}

export interface CloudSaveUsage {
  setCount: number;
  fileCount: number;
  totalSizeBytes: number;
}

export async function getCloudStorageUsage(): Promise<CloudSaveUsage> {
  const client = getSupabaseClient();
  const { data: userData, error: authError } = await client.auth.getUser();
  handleError(authError);
  if (!userData.user) {
    return { setCount: 0, fileCount: 0, totalSizeBytes: 0 };
  }

  const [setsResult, filesResult] = await Promise.all([
    client
      .from("user_cloud_save_sets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userData.user.id),
    client
      .from("user_cloud_save_files")
      .select("size_bytes", { count: "exact" })
      .eq("user_id", userData.user.id),
  ]);
  if (isMissingSchemaError(setsResult.error)) {
    return { setCount: 0, fileCount: 0, totalSizeBytes: 0 };
  }
  handleError(setsResult.error);
  if (isMissingSchemaError(filesResult.error)) {
    return { setCount: setsResult.count ?? 0, fileCount: 0, totalSizeBytes: 0 };
  }
  handleError(filesResult.error);
  const files = (filesResult.data ?? []) as UnknownRecord[];
  const totalSizeBytes = files.reduce<number>((sum, row) => {
    const n = rowNumber(row, "size_bytes", 0);
    return sum + n;
  }, 0);
  return {
    setCount: setsResult.count ?? 0,
    fileCount: filesResult.count ?? files.length,
    totalSizeBytes,
  };
}
