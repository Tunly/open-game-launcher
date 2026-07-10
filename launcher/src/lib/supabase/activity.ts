import type { RealtimeChannel } from "@supabase/supabase-js";

import { getSupabaseClient, supabase } from "./client";
import type { ActivityFeedItem, ActivityFeedMetadata, ActivityType } from "../types/friends";
import {
  handleError,
  isMissingSchemaError,
  rowConfig,
  rowNullableString,
  rowString,
  type UnknownRecord,
} from "./helpers";
import { buildRealtimeInFilters } from "./realtime-filters";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activitySelect =
  "id, user_id, type, game_id, game_title, achievement_name, metadata, visibility, created_at";
const lifecycleActivityDedupeMs = 15_000;
const recentLifecycleActivities = new Map<
  string,
  { expiresAt: number; request: Promise<ActivityFeedItem> }
>();

function toActivityItem(row: UnknownRecord): ActivityFeedItem {
  return {
    id: rowString(row, "id"),
    userId: rowString(row, "user_id"),
    type: rowString(row, "type") as ActivityType,
    gameId: rowNullableString(row, "game_id"),
    gameTitle: rowNullableString(row, "game_title"),
    achievementName: rowNullableString(row, "achievement_name"),
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
    metadata?: ActivityFeedMetadata;
    visibility?: "public" | "friends_only" | "private";
  },
): Promise<ActivityFeedItem> {
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const sourceGameId = cleanString(data.gameId);
  const metadata = normalizeActivityMetadata(type, data.metadata);
  const writeActivity = async () => {
    const catalogGameId = await resolveCatalogGameId(
      client,
      sourceGameId,
      cleanString(data.gameTitle),
      metadata,
    );

    if (sourceGameId && sourceGameId !== catalogGameId && !metadata.localGameId) {
      metadata.localGameId = sourceGameId;
    }

    const { data: result, error } = await client
      .from("activity_feed")
      .insert({
        user_id: userId,
        type,
        game_id: catalogGameId,
        game_title: data.gameTitle ?? null,
        achievement_name: data.achievementName ?? null,
        metadata: metadata as unknown as Record<string, never>,
        visibility: data.visibility ?? "friends_only",
      })
      .select(activitySelect)
      .single();
    handleError(error);

    return toActivityItem(result as UnknownRecord);
  };

  if ((type !== "game_start" && type !== "game_stop") || !sourceGameId) {
    return writeActivity();
  }

  const dedupeKey = `${userId}:${type}:${sourceGameId}`;
  const now = Date.now();
  const recent = recentLifecycleActivities.get(dedupeKey);
  if (recent && recent.expiresAt > now) {
    return recent.request;
  }

  const request = writeActivity();
  recentLifecycleActivities.set(dedupeKey, {
    expiresAt: now + lifecycleActivityDedupeMs,
    request,
  });
  if (recentLifecycleActivities.size > 200) {
    for (const [key, entry] of recentLifecycleActivities) {
      if (entry.expiresAt <= now) recentLifecycleActivities.delete(key);
    }
  }

  try {
    return await request;
  } catch (error) {
    if (recentLifecycleActivities.get(dedupeKey)?.request === request) {
      recentLifecycleActivities.delete(dedupeKey);
    }
    throw error;
  }
}

function normalizeActivityMetadata(
  type: ActivityType,
  input: ActivityFeedMetadata | undefined,
): ActivityFeedMetadata {
  const metadata = { ...(input ?? {}) };
  if (type !== "status") {
    return metadata;
  }

  const text = cleanString(metadata.text);
  if (!text || text.length > 1000) {
    throw new Error("Status activity text must be between 1 and 1000 characters.");
  }
  metadata.text = text;
  return metadata;
}

async function resolveCatalogGameId(
  client: ReturnType<typeof getSupabaseClient>,
  sourceGameId: string | null,
  gameTitle: string | null,
  metadata: ActivityFeedMetadata,
): Promise<string | null> {
  if (sourceGameId && uuidPattern.test(sourceGameId)) {
    const result = await client.from("games").select("id").eq("id", sourceGameId).maybeSingle();
    if (!result.error && result.data) {
      return rowNullableString(result.data as UnknownRecord, "id");
    }
  }

  const inferredExternal = inferExternalGameReference(sourceGameId, metadata);
  if (inferredExternal) {
    const result = await client
      .from("games")
      .select("id")
      .contains("external_ids", { [inferredExternal.platform]: inferredExternal.id })
      .limit(1)
      .maybeSingle();
    if (!result.error && result.data) {
      return rowNullableString(result.data as UnknownRecord, "id");
    }
  }

  if (gameTitle) {
    const result = await client
      .from("games")
      .select("id")
      .eq("title", gameTitle)
      .limit(1)
      .maybeSingle();
    if (!result.error && result.data) {
      return rowNullableString(result.data as UnknownRecord, "id");
    }
  }

  return null;
}

function inferExternalGameReference(sourceGameId: string | null, metadata: ActivityFeedMetadata) {
  const platform = cleanString(metadata.platform) ?? cleanString(metadata.launcher);
  const externalId = cleanString(metadata.platformGameId) ?? cleanString(metadata.externalGameId);
  if (platform && externalId) {
    return { id: externalId, platform: platform.toLowerCase() };
  }

  const ownedIdMatch = sourceGameId?.match(/^([a-z0-9_]+)-owned-(.+)$/i);
  return ownedIdMatch ? { id: ownedIdMatch[2], platform: ownedIdMatch[1].toLowerCase() } : null;
}

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function getFriendActivityFeed(
  friendIds: string[],
  limit = 30,
  before?: string,
): Promise<ActivityFeedItem[]> {
  const watchedFriendIds = Array.from(new Set(friendIds.filter((friendId) => friendId.trim())));
  if (watchedFriendIds.length === 0) {
    return [];
  }

  const client = getSupabaseClient();

  let query = client
    .from("activity_feed")
    .select(activitySelect)
    .in("user_id", watchedFriendIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data, error } = await query;
  if (isMissingSchemaError(error)) return [];
  handleError(error);

  const watchedUsers = new Set(watchedFriendIds);
  return (data ?? [])
    .map((row) => toActivityItem(row as UnknownRecord))
    .filter((item) => watchedUsers.has(item.userId));
}

export async function getMyActivityFeed(limit = 30, before?: string): Promise<ActivityFeedItem[]> {
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();

  let query = client
    .from("activity_feed")
    .select(activitySelect)
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
  const filters = buildRealtimeInFilters("user_id", friendIds);
  let channel: RealtimeChannel = client.channel(`og-activity-${crypto.randomUUID()}`);

  for (const filter of filters) {
    channel = channel.on(
      "postgres_changes",
      { event: "INSERT", filter, schema: "public", table: "activity_feed" },
      (payload) => {
        const row = payload.new as UnknownRecord;
        const userId = rowString(row, "user_id");
        if (watchedUsers.has(userId)) {
          onActivity(toActivityItem(row));
        }
      },
    );
  }

  channel = channel.subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
