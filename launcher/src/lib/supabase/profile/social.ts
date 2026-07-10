import { getSupabaseClient } from "../client";
import { handleError, isMissingSchemaError, type UnknownRecord } from "../helpers";
import { toSocialLink } from "./schemas";
import { socialLinksSchema, type SocialLinksInput } from "../../validation/profile";
import { getCurrentUserId } from "./_shared";
import { replaceSocialLinksAtomically } from "./social-link-replacement";

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
  await getCurrentUserId();
  const rows = await replaceSocialLinksAtomically(client, parsed);
  return rows.map((row) => toSocialLink(row));
}
