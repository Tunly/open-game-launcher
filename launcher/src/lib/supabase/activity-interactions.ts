import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

import type { ActivityComment, ActivityInteractionSummary } from "../types/friends";
import { getSupabaseClient, supabase } from "./client";
import { handleError, rowString, type UnknownRecord } from "./helpers";
import { buildRealtimeInFilters } from "./realtime-filters";

const commentSelect = "id, activity_id, author_id, body, created_at";

export type ActivityCommentCursor = Pick<ActivityComment, "createdAt" | "id">;

export interface ActivityCommentPage {
  comments: ActivityComment[];
  nextCursor: ActivityCommentCursor | null;
}

interface ActivityCommentPageOptions {
  before?: ActivityCommentCursor;
  limit?: number;
}

function activityCommentCursorFilter(cursor: ActivityCommentCursor) {
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}

function toComment(row: UnknownRecord): ActivityComment {
  return {
    activityId: rowString(row, "activity_id"),
    authorId: rowString(row, "author_id"),
    body: rowString(row, "body"),
    createdAt: rowString(row, "created_at"),
    id: rowString(row, "id"),
  };
}

async function getCurrentUserId() {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  handleError(error);
  if (!data.user) throw new Error("You must be signed in.");
  return data.user.id;
}

export async function getActivityInteractionSummaries(activityIds: string[]) {
  const uniqueIds = Array.from(new Set(activityIds.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map<string, ActivityInteractionSummary>();

  const client = getSupabaseClient();
  const { data, error } = await client.rpc("get_activity_interaction_summaries", {
    p_activity_ids: uniqueIds,
  });
  handleError(error);

  return new Map(
    (data ?? []).map((row) => {
      const summary: ActivityInteractionSummary = {
        activityId: row.activity_id,
        commentCount: Number(row.comment_count),
        reactedByCurrentUser: row.reacted_by_current_user,
        reactionCount: Number(row.reaction_count),
      };
      return [summary.activityId, summary];
    }),
  );
}

export async function getActivityComments(
  activityId: string,
  { before, limit = 8 }: ActivityCommentPageOptions = {},
): Promise<ActivityCommentPage> {
  const client = getSupabaseClient();
  const normalizedLimit = Math.max(1, Math.min(Number.isFinite(limit) ? Math.trunc(limit) : 8, 50));
  let query = client
    .from("activity_comments")
    .select(commentSelect)
    .eq("activity_id", activityId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (before) {
    query = query.or(activityCommentCursorFilter(before));
  }
  const { data, error } = await query.limit(normalizedLimit + 1);
  handleError(error);

  const pageRows = (data ?? []).slice(0, normalizedLimit);
  const comments = pageRows.map((row) => toComment(row as UnknownRecord)).reverse();
  const oldestComment = comments[0];
  return {
    comments,
    nextCursor:
      (data?.length ?? 0) > normalizedLimit && oldestComment
        ? { createdAt: oldestComment.createdAt, id: oldestComment.id }
        : null,
  };
}

export async function addActivityComment(activityId: string, body: string) {
  const trimmedBody = body.trim();
  if (!trimmedBody || trimmedBody.length > 1000) {
    throw new Error("Activity comments must be between 1 and 1000 characters.");
  }

  const client = getSupabaseClient();
  const authorId = await getCurrentUserId();
  const { data, error } = await client
    .from("activity_comments")
    .insert({ activity_id: activityId, author_id: authorId, body: trimmedBody })
    .select(commentSelect)
    .single();
  handleError(error);
  return toComment(data as UnknownRecord);
}

export async function deleteActivityComment(commentId: string) {
  const client = getSupabaseClient();
  const { error } = await client.from("activity_comments").delete().eq("id", commentId);
  handleError(error);
}

export async function setActivityRateUp(activityId: string, active: boolean) {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("set_activity_rate_up", {
    p_active: active,
    p_activity_id: activityId,
  });
  handleError(error);
  const row = data?.[0];
  if (!row) throw new Error("Rate Up result was unavailable.");
  return {
    activityId: row.activity_id,
    reactedByCurrentUser: row.reacted_by_current_user,
    reactionCount: Number(row.reaction_count),
  };
}

export interface ActivityInteractionRealtimeHandlers {
  onCommentDeleted: (comment: Pick<ActivityComment, "activityId" | "id">) => void;
  onCommentUpsert: (comment: ActivityComment) => void;
  onReactionChanged: (change: { active: boolean; activityId: string; userId: string }) => void;
}

function changedRow(payload: RealtimePostgresChangesPayload<UnknownRecord>) {
  return (payload.eventType === "DELETE" ? payload.old : payload.new) as UnknownRecord;
}

export function subscribeToActivityInteractions(
  activityIds: string[],
  handlers: ActivityInteractionRealtimeHandlers,
) {
  if (!supabase || activityIds.length === 0) return () => undefined;

  const watchedIds = new Set(activityIds);
  const filters = buildRealtimeInFilters("activity_id", activityIds);
  const client = supabase;
  let channel: RealtimeChannel = client.channel(`og-activity-interactions-${crypto.randomUUID()}`);

  const handleCommentUpsert = (payload: RealtimePostgresChangesPayload<UnknownRecord>) => {
    const row = changedRow(payload);
    const activityId = rowString(row, "activity_id");
    if (!activityId || !watchedIds.has(activityId)) return;
    handlers.onCommentUpsert(toComment(row));
  };

  const handleCommentDeleted = (payload: RealtimePostgresChangesPayload<UnknownRecord>) => {
    const row = payload.new as UnknownRecord;
    const activityId = rowString(row, "activity_id");
    const commentId = rowString(row, "comment_id");
    if (!activityId || !commentId || !watchedIds.has(activityId)) return;
    handlers.onCommentDeleted({ activityId, id: commentId });
  };

  const handleReaction = (payload: RealtimePostgresChangesPayload<UnknownRecord>) => {
    const row = changedRow(payload);
    const activityId = rowString(row, "activity_id");
    const userId = rowString(row, "user_id");
    if (!activityId || !userId || !watchedIds.has(activityId)) return;
    handlers.onReactionChanged({
      active: payload.eventType !== "DELETE",
      activityId,
      userId,
    });
  };

  for (const filter of filters) {
    channel = channel
      .on(
        "postgres_changes",
        { event: "INSERT", filter, schema: "public", table: "activity_comments" },
        handleCommentUpsert,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          filter,
          schema: "public",
          table: "activity_comment_deletions",
        },
        handleCommentDeleted,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", filter, schema: "public", table: "activity_reactions" },
        handleReaction,
      );
  }

  // Reaction keys include activity_id, so DELETE payloads remain actionable under RLS.
  // Comment deletes use the trigger-backed event table above because Supabase exposes
  // only primary-key columns from DELETE old rows when RLS is enabled.
  channel = channel.on(
    "postgres_changes",
    { event: "DELETE", schema: "public", table: "activity_reactions" },
    handleReaction,
  );

  channel = channel.subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
