import { getSupabaseClient } from "./client";
import type { Category, Tag } from "../types/categories";

export async function listCategories(): Promise<Category[]> {
  const client = getSupabaseClient(); if (!client) return [];
  const { data, error } = await client.from("categories").select("*").order("sort_order");
  if (error) return [];
  return (data ?? []) as unknown as Category[];
}
export async function listTags(): Promise<Tag[]> {
  const client = getSupabaseClient(); if (!client) return [];
  const { data, error } = await client.from("tags").select("*").order("name");
  if (error) return [];
  return (data ?? []) as unknown as Tag[];
}
export async function setGameCategories(gameId: string, categoryIds: string[]): Promise<void> {
  const client = getSupabaseClient(); if (!client) return;
  await client.from("game_categories").delete().eq("game_id", gameId);
  if (categoryIds.length > 0)
    await client.from("game_categories").insert(categoryIds.map(c => ({ game_id: gameId, category_id: c })));
}
export async function setGameTags(gameId: string, tagIds: string[]): Promise<void> {
  const client = getSupabaseClient(); if (!client) return;
  await client.from("game_tags").delete().eq("game_id", gameId);
  if (tagIds.length > 0)
    await client.from("game_tags").insert(tagIds.map(t => ({ game_id: gameId, tag_id: t })));
}
