import { getSupabaseClient } from "./client";
import type { NewsItem } from "../types/news";

interface NewsItemRow {
  id: string;
  title: string;
  slug: string;
  body: string;
  excerpt: string | null;
  author_id: string;
  game_id: string | null;
  tags: string[];
  cover_image_url: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToNewsItem(row: NewsItemRow): NewsItem {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    body: row.body,
    excerpt: row.excerpt,
    authorId: row.author_id,
    gameId: row.game_id,
    tags: row.tags,
    coverImageUrl: row.cover_image_url,
    isPublished: row.is_published,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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
  return ((data ?? []) as NewsItemRow[]).map(rowToNewsItem);
}
export async function getNewsItem(slug: string): Promise<NewsItem | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.from("news_items").select("*").eq("slug", slug).single();
  if (error) return null;
  return rowToNewsItem(data as NewsItemRow);
}
