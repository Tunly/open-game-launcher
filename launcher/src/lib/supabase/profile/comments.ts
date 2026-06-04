import { getSupabaseClient } from "../client";
import { handleError, isMissingSchemaError, type UnknownRecord } from "../helpers";
import { toComment } from "./schemas";
import { commentSchema } from "../../validation/profile";
import { getCurrentUserId } from "./_shared";

export async function getProfileComments(profileUserId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("profile_comments")
    .select("*")
    .eq("profile_user_id", profileUserId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (isMissingSchemaError(error)) return [];
  handleError(error);
  return (data ?? []).map((row) => toComment(row as UnknownRecord));
}

export async function addProfileComment(profileUserId: string, body: string) {
  const parsed = commentSchema.parse({ body });
  const client = getSupabaseClient();
  const authorId = await getCurrentUserId();
  const { data, error } = await client
    .from("profile_comments")
    .insert({ profile_user_id: profileUserId, author_id: authorId, body: parsed.body })
    .select("*")
    .single();
  handleError(error);
  return toComment(data as UnknownRecord);
}

export async function deleteProfileComment(commentId: string) {
  const client = getSupabaseClient();
  const { error } = await client.from("profile_comments").delete().eq("id", commentId);
  handleError(error);
}
