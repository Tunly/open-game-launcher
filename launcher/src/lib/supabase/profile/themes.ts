import { getSupabaseClient } from "../client";
import { handleError, isMissingSchemaError, type UnknownRecord } from "../helpers";
import { toTheme } from "./schemas";

export async function getProfileTheme(themeId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("profile_themes")
    .select("*")
    .eq("id", themeId)
    .maybeSingle();
  if (isMissingSchemaError(error)) return null;
  handleError(error);
  return toTheme(data as UnknownRecord | null);
}

export async function getProfileThemes() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("profile_themes")
    .select("*")
    .eq("is_active", true)
    .order("name");
  if (isMissingSchemaError(error)) return [];
  handleError(error);
  return (data ?? [])
    .map((row) => toTheme(row as UnknownRecord))
    .filter((theme): theme is NonNullable<ReturnType<typeof toTheme>> => Boolean(theme));
}
