import type { RealtimeChannel } from "@supabase/supabase-js";

import { getSupabaseClient, supabase } from "./client";
import type { UserPresence } from "../types/profile";
export type { UserPresence };
import { isMissingSchemaError, rowNullableString, rowString, type UnknownRecord } from "./helpers";

export type PresenceUpdateInput = {
  customStatus?: string | null;
  currentGameId?: string | null;
  currentGameTitle?: string | null;
  status?: UserPresence["status"];
};

function toPresence(row: UnknownRecord): UserPresence {
  return {
    customStatus: rowNullableString(row, "custom_status"),
    currentGameId: rowNullableString(row, "current_game_id"),
    currentGameTitle: rowNullableString(row, "current_game_title"),
    lastHeartbeatAt: rowNullableString(row, "last_heartbeat_at"),
    status: rowString(row, "status", "offline") as UserPresence["status"],
    updatedAt: rowString(row, "updated_at"),
    userId: rowString(row, "user_id"),
  };
}

async function getCurrentUserId() {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error) {
    throw new Error(error.message);
  }
  if (!data.user) {
    throw new Error("You must be signed in.");
  }

  return data.user.id;
}

export async function setLauncherPresence(input: PresenceUpdateInput = {}) {
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const payload: {
    last_heartbeat_at: string;
    status: string;
    user_id: string;
    custom_status?: string | null;
    current_game_id?: string | null;
    current_game_title?: string | null;
  } = {
    last_heartbeat_at: new Date().toISOString(),
    status: input.status ?? "online",
    user_id: userId,
  };

  if ("customStatus" in input) {
    payload.custom_status = input.customStatus;
  }
  if ("currentGameId" in input) {
    payload.current_game_id = input.currentGameId;
  }
  if ("currentGameTitle" in input) {
    payload.current_game_title = input.currentGameTitle;
  }

  const { data, error } = await client
    .from("user_presence")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();
  if (isMissingSchemaError(error)) {
    return null;
  }
  if (error) {
    throw new Error(error.message);
  }

  return toPresence(data as UnknownRecord);
}

export function clearLauncherPresence() {
  return setLauncherPresence({
    customStatus: null,
    currentGameId: null,
    currentGameTitle: null,
    status: "offline",
  });
}

export async function getVisiblePresence(userIds: string[]) {
  if (userIds.length === 0) {
    return [];
  }

  const client = getSupabaseClient();
  const { data, error } = await client.from("user_presence").select("*").in("user_id", userIds);
  if (isMissingSchemaError(error)) {
    return [];
  }
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => toPresence(row as UnknownRecord));
}

export function subscribeToPresenceChanges(
  userIds: string[],
  onChange: (presence: UserPresence) => void,
) {
  if (!supabase || userIds.length === 0) {
    return () => undefined;
  }

  const client = supabase;
  const watchedUsers = new Set(userIds);
  const channel: RealtimeChannel = client
    .channel(`og-presence-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "user_presence" }, (payload) => {
      const row = (
        payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old
      ) as UnknownRecord;
      const userId = rowString(row, "user_id");

      if (watchedUsers.has(userId)) {
        onChange(toPresence(row));
      }
    })
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
