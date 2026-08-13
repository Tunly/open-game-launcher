import type { Game } from "../types";
import { getSupabaseClient, isSupabaseConfigured } from "./client";

type IgdbAssetResponse = {
  coverUrl?: string | null;
  iconUrl?: string | null;
  logoUrl?: string | null;
};

/** Resolve real IGDB artwork through the authenticated Supabase Edge Function. */
export async function fetchIgdbArtwork(title: string): Promise<IgdbAssetResponse | null> {
  if (!isSupabaseConfigured || !title.trim()) return null;
  try {
    const { data, error } = await getSupabaseClient().functions.invoke<IgdbAssetResponse>(
      "igdb-assets",
      {
        body: { title: title.trim() },
      },
    );
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

export function applyIgdbArtwork(game: Game, assets: IgdbAssetResponse): Game {
  const coverUrl = assets.coverUrl ?? game.coverUrl;
  const iconUrl = assets.iconUrl ?? game.iconUrl;
  const logoUrl = assets.logoUrl ?? game.logoUrl;
  return {
    ...game,
    coverUrl,
    iconUrl,
    logoUrl,
    iconUrls: [
      ...new Set(
        [iconUrl, ...(game.iconUrls ?? [])].filter((value): value is string => Boolean(value)),
      ),
    ],
    logoUrls: [
      ...new Set(
        [logoUrl, ...(game.logoUrls ?? [])].filter((value): value is string => Boolean(value)),
      ),
    ],
  };
}
