import { getSupabaseClient } from "../client";
import { handleError, isMissingSchemaError, type UnknownRecord } from "../helpers";
import { toShowcase } from "./schemas";
import { createShowcaseSchema, updateShowcaseSchema, type CreateShowcaseInput, type UpdateShowcaseInput } from "../../validation/profile";
import type { ProfileShowcase } from "../../types/profile";
import { getCurrentUserId } from "./_shared";

export async function getMyShowcases() {
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const { data, error } = await client
    .from("profile_showcases")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order");
  if (isMissingSchemaError(error)) return [];
  handleError(error);
  return (data ?? []).map((row) => toShowcase(row as UnknownRecord));
}

export async function getPublicShowcases(userId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("profile_showcases")
    .select("*")
    .eq("user_id", userId)
    .eq("is_enabled", true)
    .order("sort_order");
  if (isMissingSchemaError(error)) return [];
  handleError(error);
  return (data ?? []).map((row) => toShowcase(row as UnknownRecord));
}

export async function updateShowcases(showcases: ProfileShowcase[]) {
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const payload = showcases.map((showcase, index) => ({
    id: showcase.id,
    user_id: userId,
    type: showcase.type,
    title: showcase.title,
    sort_order: index,
    visibility: showcase.visibility,
    config: showcase.config as unknown as string,
    is_enabled: showcase.isEnabled,
  }));
  const { data, error } = await client
    .from("profile_showcases")
    .upsert(payload as unknown as { user_id: string; type: string; sort_order: number }[])
    .select("*")
    .order("sort_order");
  handleError(error);
  return (data ?? []).map((row) => toShowcase(row as UnknownRecord));
}

export async function createShowcase(input: CreateShowcaseInput) {
  const parsed = createShowcaseSchema.parse(input);
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const { data, error } = await client
    .from("profile_showcases")
    .insert({
      user_id: userId,
      type: parsed.type,
      title: parsed.title,
      sort_order: parsed.sortOrder,
      visibility: parsed.visibility,
      config: parsed.config as unknown as string,
      is_enabled: parsed.isEnabled,
    })
    .select("*")
    .single();
  handleError(error);
  return toShowcase(data as UnknownRecord);
}

export async function updateShowcase(id: string, input: UpdateShowcaseInput) {
  const parsed = updateShowcaseSchema.parse(input);
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const { data, error } = await client
    .from("profile_showcases")
    .update({
      title: parsed.title,
      sort_order: parsed.sortOrder,
      visibility: parsed.visibility,
      config: parsed.config as unknown as string,
      is_enabled: parsed.isEnabled,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  handleError(error);
  return toShowcase(data as UnknownRecord);
}

export async function ensureMyHardwareShowcase(visibility: ProfileShowcase["visibility"]) {
  try {
    const showcases = await getMyShowcases();
    const existing = showcases.find((s) => s.type === "hardware_setup");
    if (!existing) {
      return createShowcase({
        config: {},
        isEnabled: true,
        sortOrder: showcases.length,
        title: "Hardware Rig",
        type: "hardware_setup",
        visibility,
      });
    }
    if (existing.isEnabled && existing.visibility === visibility && existing.title === "Hardware Rig") {
      return existing;
    }
    return updateShowcase(existing.id, {
      config: existing.config,
      isEnabled: true,
      sortOrder: existing.sortOrder,
      title: "Hardware Rig",
      visibility,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("does not exist") || message.toLowerCase().includes("schema cache")) {
      return null;
    }
    throw error;
  }
}
