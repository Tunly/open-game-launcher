import type { LocalEntityKey, LocalEntityPayload, LocalSyncStatus, PlaySession } from "./types";
import { invokeCommand } from "./shared";

export function getLocalDatabasePath(): Promise<string> {
  return invokeCommand<string>("get_local_database_path");
}

export function getLocalSyncStatus(): Promise<LocalSyncStatus> {
  return invokeCommand<LocalSyncStatus>("get_local_sync_status");
}

export function getPendingLocalEntities(): Promise<LocalEntityPayload[]> {
  return invokeCommand<LocalEntityPayload[]>("get_pending_local_entities");
}

export function getAllLocalEntities(): Promise<LocalEntityPayload[]> {
  return invokeCommand<LocalEntityPayload[]>("get_all_local_entities");
}

export function markLocalEntitiesSynced(entities: LocalEntityKey[]): Promise<void> {
  return invokeCommand<void>("mark_local_entities_synced", { entities });
}

export function applyRemoteLocalEntities(entities: LocalEntityPayload[]): Promise<void> {
  return invokeCommand<void>("apply_remote_local_entities", { entities });
}

export function getUnsyncedPlaySessions(): Promise<PlaySession[]> {
  return invokeCommand<PlaySession[]>("get_unsynced_play_sessions");
}

export function markPlaySessionsSynced(ids: string[]): Promise<number> {
  return invokeCommand<number>("mark_play_sessions_synced", { ids });
}

export function upsertPlaySession(session: PlaySession): Promise<void> {
  return invokeCommand<void>("upsert_play_session", { session });
}

export function updatePlaySession(
  id: string,
  startedAt?: number | null,
  endedAt?: number | null,
  durationMinutes?: number | null,
): Promise<void> {
  return invokeCommand<void>("update_play_session", {
    id,
    startedAt,
    endedAt,
    durationMinutes,
  });
}

export function deletePlaySession(id: string): Promise<number> {
  return invokeCommand<number>("delete_play_session", { id });
}

export function getPlaySession(id: string): Promise<PlaySession | null> {
  return invokeCommand<PlaySession | null>("get_play_session", { id });
}

export function setCachedGamePlaytime(gameId: string, playtimeMinutes: number): Promise<void> {
  return invokeCommand<void>("set_cached_game_playtime", {
    gameId,
    playtimeMinutes,
  });
}
