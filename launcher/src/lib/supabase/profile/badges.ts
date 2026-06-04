import { getSupabaseClient } from "../client";
import { handleError, isMissingSchemaError, type UnknownRecord } from "../helpers";
import { toBadge } from "./schemas";

export async function getUserBadges(userId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("user_badges")
    .select("*")
    .eq("user_id", userId)
    .order("earned_at", { ascending: false })
    .limit(12);
  if (isMissingSchemaError(error)) return [];
  handleError(error);
  return (data ?? []).map((row) => toBadge(row as UnknownRecord));
}
