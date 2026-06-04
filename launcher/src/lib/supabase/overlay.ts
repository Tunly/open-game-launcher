import { getSupabaseClient } from "./client";
import type { OverlaySettings } from "../types/overlay";

export async function getOverlaySettings(): Promise<OverlaySettings | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client
    .from("overlay_settings")
    .select("*")
    .eq("user_id", user.id)
    .single();
  if (error) return null;
  return data as unknown as OverlaySettings;
}
export async function saveOverlaySettings(): Promise<OverlaySettings | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client
    .from("overlay_settings")
    .upsert({ user_id: user.id })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as OverlaySettings;
}
