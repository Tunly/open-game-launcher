import {
  applyRemoteLocalEntities,
  getPendingLocalEntities,
  markLocalEntitiesSynced,
} from "../launcher";
import type { LocalEntityPayload } from "../types";
import { getSupabaseClient } from "./client";

const DEVICE_ID_KEY = "og-launcher.device-id";

interface LauncherLocalEntityRow {
  user_id: string;
  device_id: string;
  kind: LocalEntityPayload["kind"];
  entity_id: string;
  entity: Record<string, unknown>;
  local_updated_at: number;
}

interface LauncherLocalEntitySelectRow {
  kind: string;
  entity_id: string;
  entity: unknown;
  local_updated_at: number | null;
}

interface QueryError {
  message?: string;
}

interface LauncherLocalEntityTable {
  upsert: (
    rows: LauncherLocalEntityRow[],
    options: { onConflict: string },
  ) => Promise<{ error: QueryError | null }>;
  select: (columns: string) => {
    eq: (
      column: "user_id",
      value: string,
    ) => {
      order: (
        column: "local_updated_at",
        options: { ascending: boolean },
      ) => Promise<{
        data: LauncherLocalEntitySelectRow[] | null;
        error: QueryError | null;
      }>;
    };
  };
}

export async function syncLocalEntitiesWithSupabase(userId: string) {
  const client = getSupabaseClient();
  const table = (
    client as unknown as {
      from: (table: "launcher_local_entities") => LauncherLocalEntityTable;
    }
  ).from("launcher_local_entities");
  const deviceId = getOrCreateDeviceId();
  // The hosted table intentionally accepts only portable game/download
  // records. Mod install state contains machine-local paths and must never
  // poison the whole upsert batch or be acknowledged as cloud-synced.
  const pending = (await getPendingLocalEntities()).filter((entity) =>
    isLocalEntityKind(entity.kind),
  );

  if (pending.length > 0) {
    const rows: LauncherLocalEntityRow[] = pending.map((entity) => ({
      user_id: userId,
      device_id: deviceId,
      kind: entity.kind,
      entity_id: entity.id,
      entity: entity.entity,
      local_updated_at: entity.updatedAt,
    }));

    const { error } = await table.upsert(rows, {
      onConflict: "user_id,device_id,kind,entity_id",
    });

    if (error) {
      throw error;
    }

    await markLocalEntitiesSynced(
      pending.map((entity) => ({
        kind: entity.kind,
        id: entity.id,
        syncToken: entity.syncToken,
      })),
    );
  }

  const { data, error } = await table
    .select("kind, entity_id, entity, local_updated_at")
    .eq("user_id", userId)
    .order("local_updated_at", { ascending: true });

  if (error) {
    throw error;
  }

  const remoteEntities: LocalEntityPayload[] = [];
  for (const row of data ?? []) {
    if (!isLocalEntityKind(row.kind)) {
      continue;
    }
    remoteEntities.push({
      kind: row.kind,
      id: row.entity_id,
      entity: toObject(row.entity),
      updatedAt: Number(row.local_updated_at ?? 0),
      syncToken: "",
    });
  }

  if (remoteEntities.length > 0) {
    await applyRemoteLocalEntities(remoteEntities);
  }
}

function getOrCreateDeviceId() {
  if (typeof globalThis.localStorage === "undefined") {
    return "desktop-device";
  }

  const existing = globalThis.localStorage.getItem(DEVICE_ID_KEY);
  if (existing && existing.length >= 8) {
    return existing;
  }

  const id =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  globalThis.localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

function toObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function isLocalEntityKind(kind: string): kind is LocalEntityPayload["kind"] {
  return kind === "games" || kind === "downloads";
}
