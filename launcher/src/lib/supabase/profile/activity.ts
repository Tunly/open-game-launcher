import { getSupabaseClient } from "../client";
import { handleError, isMissingSchemaError, type UnknownRecord } from "../helpers";
import { toActivity } from "./schemas";

export async function getUserActivity(userId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("user_activity")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (isMissingSchemaError(error)) return [];
  handleError(error);
  return (data ?? []).map((row) => toActivity(row as UnknownRecord));
}
