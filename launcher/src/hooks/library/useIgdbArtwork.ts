import { useEffect, useState } from "react";

import { fetchIgdbArtwork, type IgdbAssetResponse } from "../../lib/supabase/igdb-artwork";

/**
 * Fetches IGDB artwork for a set of game titles and returns it keyed by
 * trimmed title. This is the data-fetching half of the library pipeline;
 * the pipeline itself stays a pure derivation and receives the result as
 * an explicit input.
 */
export function useIgdbArtworkByTitle(titles: string[]): Record<string, IgdbAssetResponse> {
  const [igdbArtworkByTitle, setIgdbArtworkByTitle] = useState<Record<string, IgdbAssetResponse>>(
    {},
  );

  useEffect(() => {
    let cancelled = false;
    const uniqueTitles = [...new Set(titles.map((title) => title.trim()).filter(Boolean))];
    if (uniqueTitles.length === 0) return;

    void Promise.all(
      uniqueTitles.map(async (title) => [title, await fetchIgdbArtwork(title)] as const),
    ).then((results) => {
      if (cancelled) return;
      setIgdbArtworkByTitle((current) => {
        const next = { ...current };
        for (const [title, artwork] of results) {
          if (artwork && (artwork.coverUrl || artwork.iconUrl || artwork.logoUrl))
            next[title] = artwork;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [titles]);

  return igdbArtworkByTitle;
}
