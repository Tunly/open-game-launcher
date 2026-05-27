import type { Game, LauncherType, Platform, SaveFile } from "../types";
import {
  downloadGameSavesFromCloud as downloadGameSavesFromCloudCommand,
  restoreGameSavesFromCloud as restoreGameSavesFromCloudCommand,
  uploadGameSavesToCloud as uploadGameSavesToCloudCommand,
} from "../launcher";
import { getSupabaseClient, supabasePublicKey, supabasePublicUrl } from "./client";

const CLOUD_SYNC_DEVICE_ID_KEY = "launcher.cloudSyncDeviceId";
const SNAPSHOT_VERSION = 1;

export type LibraryCloudSnapshotInput = {
  games: Game[];
  favorites: Record<string, boolean>;
  hiddenGames: Record<string, boolean>;
  customCategories: Record<string, string[]>;
  dynamicCollections: unknown[];
};

export type LibraryCloudSnapshotPayload = LibraryCloudSnapshotInput & {
  exportedAt: string;
};

export type LibraryCloudSnapshotRow = {
  id: string;
  user_id: string;
  device_id: string;
  snapshot_version: number;
  game_count: number;
  snapshot: LibraryCloudSnapshotPayload;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
};

function getCloudSyncDeviceId() {
  const existing = localStorage.getItem(CLOUD_SYNC_DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const nextId =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(CLOUD_SYNC_DEVICE_ID_KEY, nextId);
  return nextId;
}

async function getCurrentUserId() {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error) {
    throw error;
  }
  if (!data.user) {
    throw new Error("Sign in before using cloud sync.");
  }
  return data.user.id;
}

function sanitizeSaveFile(saveFile: SaveFile) {
  return {
    id: saveFile.id,
    label: saveFile.label,
    modifiedAt: saveFile.modifiedAt ?? null,
    path: saveFile.path,
    sizeBytes: saveFile.sizeBytes ?? null,
    syncedAt: saveFile.syncedAt ?? null,
  };
}

function sanitizeGameForCloud(game: Game) {
  return {
    achievements: game.achievements ?? [],
    coverUrl: game.coverUrl,
    description: game.description,
    developer: game.developer,
    executablePath: game.executablePath,
    externalId: game.externalId,
    features: game.features ?? [],
    friendsPlaying: game.friendsPlaying ?? [],
    genres: game.genres ?? [],
    iconUrl: game.iconUrl,
    id: game.id,
    installPath: game.installPath,
    lastPlayed: game.lastPlayed ?? game.lastPlayedAt ?? null,
    launcher: game.launcher ?? "unknown",
    launchUri: game.launchUri,
    logoUrl: game.logoUrl,
    platform: game.platform,
    playtimeMinutes: game.playtimeMinutes ?? 0,
    processNames: game.processNames ?? [],
    publisher: game.publisher,
    rating: game.rating ?? null,
    releaseDate: game.releaseDate,
    saveFiles: (game.saveFiles ?? []).map(sanitizeSaveFile),
    slug: game.slug,
    status: game.status,
    title: game.title,
    version: game.version,
  };
}

function normalizeLauncher(launcher?: LauncherType) {
  return launcher ?? "unknown";
}

function normalizePlatform(platform?: Platform) {
  return platform ?? "unknown";
}

function localGameKey(game: Game) {
  const launcher = normalizeLauncher(game.launcher);
  if (game.externalId) {
    return `${launcher}:${game.externalId}`;
  }
  return game.id;
}

export async function uploadLibraryCloudSnapshot(input: LibraryCloudSnapshotInput) {
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const deviceId = getCloudSyncDeviceId();
  const exportedAt = new Date().toISOString();
  const snapshot: LibraryCloudSnapshotPayload = {
    customCategories: input.customCategories,
    dynamicCollections: input.dynamicCollections,
    exportedAt,
    favorites: input.favorites,
    games: input.games.map(sanitizeGameForCloud) as Game[],
    hiddenGames: input.hiddenGames,
  };

  const { data, error } = await client
    .from("user_library_snapshots")
    .upsert(
      {
        device_id: deviceId,
        game_count: input.games.length,
        last_synced_at: exportedAt,
        snapshot: snapshot as any,
        snapshot_version: SNAPSHOT_VERSION,
        user_id: userId,
      },
      { onConflict: "user_id,device_id" },
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await Promise.all(input.games.map((game) => syncGameSaveMetadataToCloud(game, userId)));

  return data as any as LibraryCloudSnapshotRow;
}

export async function fetchLatestLibraryCloudSnapshot() {
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const { data, error } = await client
    .from("user_library_snapshots")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as LibraryCloudSnapshotRow | null;
}

export async function syncGameSaveMetadataToCloud(game: Game, userId?: string) {
  const saveFiles = game.saveFiles ?? [];
  if (saveFiles.length === 0) {
    return null;
  }

  const client = getSupabaseClient();
  const resolvedUserId = userId ?? (await getCurrentUserId());
  const now = new Date().toISOString();
  const { data: saveSet, error: saveSetError } = await client
    .from("user_cloud_save_sets")
    .upsert(
      {
        external_id: game.externalId ?? null,
        last_synced_at: now,
        launcher: normalizeLauncher(game.launcher),
        local_game_key: localGameKey(game),
        metadata: {
          coverUrl: game.coverUrl ?? null,
          gameId: game.id,
          installPath: game.installPath ?? null,
        },
        platform: normalizePlatform(game.platform),
        title: game.title,
        user_id: resolvedUserId,
      },
      { onConflict: "user_id,local_game_key" },
    )
    .select("id")
    .single();

  if (saveSetError) {
    throw saveSetError;
  }

  const rows = saveFiles.map((saveFile) => ({
    label: saveFile.label ?? null,
    local_path: saveFile.path,
    modified_at: saveFile.modifiedAt ?? null,
    save_set_id: saveSet.id as string,
    size_bytes: saveFile.sizeBytes ?? null,
    synced_at: saveFile.syncedAt ?? null,
    user_id: resolvedUserId,
  }));

  const { error: filesError } = await client
    .from("user_cloud_save_files")
    .upsert(rows, { onConflict: "save_set_id,local_path" });

  if (filesError) {
    throw filesError;
  }

  return saveSet.id as string;
}

export async function uploadGameSavesToCloud(gameId: string) {
  const client = getSupabaseClient();
  if (!supabasePublicUrl || !supabasePublicKey) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await client.auth.getSession();
  if (error) {
    throw error;
  }
  if (!data.session) {
    throw new Error("Sign in before uploading saves to cloud.");
  }

  const response = await uploadGameSavesToCloudCommand({
    accessToken: data.session.access_token,
    apiKey: supabasePublicKey,
    gameId,
    supabaseUrl: supabasePublicUrl,
    userId: data.session.user.id,
  });

  await syncGameSaveMetadataToCloud(response.game, data.session.user.id);

  return response;
}

export async function downloadGameSavesFromCloud(gameId: string) {
  const client = getSupabaseClient();
  if (!supabasePublicUrl || !supabasePublicKey) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await client.auth.getSession();
  if (error) {
    throw error;
  }
  if (!data.session) {
    throw new Error("Sign in before downloading saves from cloud.");
  }

  return downloadGameSavesFromCloudCommand({
    accessToken: data.session.access_token,
    apiKey: supabasePublicKey,
    gameId,
    supabaseUrl: supabasePublicUrl,
    userId: data.session.user.id,
  });
}

export async function restoreGameSavesFromCloud(gameId: string) {
  const client = getSupabaseClient();
  if (!supabasePublicUrl || !supabasePublicKey) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await client.auth.getSession();
  if (error) {
    throw error;
  }
  if (!data.session) {
    throw new Error("Sign in before restoring saves from cloud.");
  }

  return restoreGameSavesFromCloudCommand({
    accessToken: data.session.access_token,
    apiKey: supabasePublicKey,
    gameId,
    supabaseUrl: supabasePublicUrl,
    userId: data.session.user.id,
  });
}
