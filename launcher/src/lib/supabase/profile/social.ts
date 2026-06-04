import { getSupabaseClient } from "../client";
import { handleError, isMissingSchemaError, type UnknownRecord } from "../helpers";
import { toSocialLink } from "./schemas";
import { socialLinksSchema, type SocialLinksInput } from "../../validation/profile";
import { getCurrentUserId } from "./_shared";

export async function getUserSocialLinks(userId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("user_social_links")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order");
  if (isMissingSchemaError(error)) return [];
  handleError(error);
  return (data ?? []).map((row) => toSocialLink(row as UnknownRecord));
}

export async function updateMySocialLinks(links: SocialLinksInput) {
  const parsed = socialLinksSchema.parse(links);
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();

  const { error: deleteError } = await client
    .from("user_social_links")
    .delete()
    .eq("user_id", userId);
  if (isMissingSchemaError(deleteError)) return [];
  handleError(deleteError);

  if (parsed.length === 0) return [];

  const { data, error } = await client
    .from("user_social_links")
    .insert(
      parsed.map((link, index) => ({
        user_id: userId,
        platform: link.platform,
        label: link.label,
        url: link.url,
        sort_order: link.sortOrder ?? index,
      })),
    )
    .select("*")
    .order("sort_order");
  handleError(error);
  return (data ?? []).map((row) => toSocialLink(row as UnknownRecord));
}
