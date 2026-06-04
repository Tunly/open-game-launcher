import { getSupabaseClient } from "./client";
import type { NewsItem } from "../types/news";

export async function listPublishedNews(): Promise<NewsItem[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from("news_items")
    .select("*")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []) as unknown as NewsItem[];
}
export async function getNewsItem(slug: string): Promise<NewsItem | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.from("news_items").select("*").eq("slug", slug).single();
  if (error) return null;
  return data as unknown as NewsItem;
}
