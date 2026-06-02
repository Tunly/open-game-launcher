import { getSupabaseClient } from "./client";
import type { Screenshot } from "../types/screenshots";

export async function getMyScreenshots(): Promise<Screenshot[]> {
  const client = getSupabaseClient(); if (!client) return [];
  const { data: { user } } = await client.auth.getUser(); if (!user) return [];
  const { data, error } = await client.from("screenshots").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as unknown as Screenshot[];
}
