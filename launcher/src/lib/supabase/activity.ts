import type { RealtimeChannel } from "@supabase/supabase-js";

import { getSupabaseClient, supabase } from "./client";
import type { ActivityFeedItem, ActivityType } from "../types/friends";
import {
  handleError,
  isMissingSchemaError,
  rowConfig,
  rowNullableString,
  rowString,
  type UnknownRecord,
} from "./helpers";

function toActivityItem(row: UnknownRecord): ActivityFeedItem {
  return {
    id: rowString(row, "id"),
    userId: rowString(row, "user_id"),
    type: rowString(row, "type") as ActivityType,
    gameId: rowNullableString(row, "game_id"),
    gameTitle: rowNullableString(row, "game_title"),
    achievementName: rowNullableString(row, "achievement_name"),
    screenshotUrl: rowNullableString(row, "screenshot_url"),
    metadata: rowConfig(row, "metadata"),
    visibility: rowString(row, "visibility", "friends_only") as ActivityFeedItem["visibility"],
    createdAt: rowString(row, "created_at"),
  };
}

async function getCurrentUserId() {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  handleError(error);
  if (!data.user) throw new Error("You must be signed in.");
  return data.user.id;
}

export async function postActivity(
  type: ActivityType,
  data: {
    gameId?: string | null;
    gameTitle?: string | null;
    achievementName?: string | null;
    screenshotUrl?: string | null;
    metadata?: Record<string, unknown>;
    visibility?: "public" | "friends_only" | "private";
  },
): Promise<ActivityFeedItem> {
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();

  const { data: result, error } = await client
    .from("activity_feed")
    .insert({
      user_id: userId,
      type,
      game_id: data.gameId ?? null,
      game_title: data.gameTitle ?? null,
      achievement_name: data.achievementName ?? null,
      screenshot_url: data.screenshotUrl ?? null,
      metadata: (data.metadata ?? {}) as unknown as Record<string, never>,
      visibility: data.visibility ?? "friends_only",
    })
    .select("*")
    .single();
  handleError(error);

  return toActivityItem(result as UnknownRecord);
}

export async function getFriendActivityFeed(
  limit = 30,
  before?: string,
): Promise<ActivityFeedItem[]> {
  const client = getSupabaseClient();

  let query = client
    .from("activity_feed")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data, error } = await query;
  if (isMissingSchemaError(error)) return [];
  handleError(error);

  return (data ?? []).map((row) => toActivityItem(row as UnknownRecord));
}

export async function getMyActivityFeed(limit = 30, before?: string): Promise<ActivityFeedItem[]> {
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();

  let query = client
    .from("activity_feed")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data, error } = await query;
  if (isMissingSchemaError(error)) return [];
  handleError(error);

  return (data ?? []).map((row) => toActivityItem(row as UnknownRecord));
}

export function subscribeToFriendActivity(
  friendIds: string[],
  onActivity: (item: ActivityFeedItem) => void,
) {
  if (!supabase || friendIds.length === 0) {
    return () => undefined;
  }

  const client = supabase;
  const watchedUsers = new Set(friendIds);
  const channel: RealtimeChannel = client
    .channel(`og-activity-${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "activity_feed" },
      (payload) => {
        const row = payload.new as UnknownRecord;
        const userId = rowString(row, "user_id");
        if (watchedUsers.has(userId)) {
          onActivity(toActivityItem(row));
        }
      },
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
