import { listOglCatalogGames } from "../../lib/supabase/ogl-catalog";
import type { Game } from "../../lib/types";
import type { MergeContext, ProviderResult } from "./types";

export async function mergeOglCatalog(
  games: Game[],
  context: MergeContext,
): Promise<ProviderResult> {
  const warnings: string[] = [];
  try {
    const catalogGames = await listOglCatalogGames();
    if (!context.shouldApplyResult()) {
      return { games, warnings, statusMessage: null };
    }

    const otherGames = games.filter((game) => game.launcher !== "ogl");
    return {
      games: [...otherGames, ...catalogGames],
      warnings,
      statusMessage: null,
    };
  } catch (error) {
    warnings.push(`Failed to load the OG Launcher catalog: ${String(error)}`);
    return {
      games,
      warnings,
      statusMessage:
        "OG Launcher catalog is temporarily unavailable. Saved and provider games remain visible.",
    };
  }
}
