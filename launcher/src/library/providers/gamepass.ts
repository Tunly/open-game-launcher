import { isTauri } from "@tauri-apps/api/core";

import { fetchGamePassCatalog } from "../../lib/launcher";
import {
  normalizeGamePassCatalogGames,
  readGamePassCatalogCache,
  serializeGamePassCatalogCache,
} from "../../lib/game-pass-catalog-cache";
import { ownedGameToGame } from "../../lib/library-providers";
import { STORAGE_KEYS } from "../../lib/storage-keys";
import type { Game } from "../../lib/types";
import type { MergeContext, ProviderResult } from "./types";

function normalizedTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s*\((?:pc|windows(?: 10| 11)?)\)\s*$/g, "")
    .replace(/\s+(?:for|-)\s+windows(?: 10| 11)?\s*$/g, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function persistCatalogCache(value: string, warnings: string[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.GAME_PASS_CATALOG_CACHE, value);
  } catch (error) {
    warnings.push(`Failed to persist the Xbox Game Pass catalog cache: ${error}`);
  }
}

function mergeCatalogArtwork(games: Game[], catalogGames: Game[]): Game[] {
  const byTitle = new Map(catalogGames.map((game) => [normalizedTitle(game.title), game]));
  return games.map((game) => {
    if (game.launcher !== "xbox") {
      return game;
    }

    const catalogGame = byTitle.get(normalizedTitle(game.title));
    if (!catalogGame) {
      return game;
    }

    return {
      ...game,
      catalogSource: catalogGame.catalogSource ?? "pc_game_pass",
      productCategory: game.productCategory ?? catalogGame.productCategory,
      coverUrl: game.coverUrl ?? catalogGame.coverUrl,
      logoUrl: game.logoUrl ?? catalogGame.logoUrl,
      iconUrl: game.iconUrl ?? catalogGame.iconUrl,
      iconUrls:
        game.iconUrls?.length || !catalogGame.iconUrl ? game.iconUrls : [catalogGame.iconUrl],
      logoUrls:
        game.logoUrls?.length || !catalogGame.logoUrl ? game.logoUrls : [catalogGame.logoUrl],
    };
  });
}

export async function mergeGamePassCatalog(
  games: Game[],
  context: MergeContext,
): Promise<ProviderResult> {
  const warnings: string[] = [];
  let statusMessage: string | null = null;
  const now = Date.now();
  let cachedRaw: string | null = null;
  try {
    cachedRaw = localStorage.getItem(STORAGE_KEYS.GAME_PASS_CATALOG_CACHE);
  } catch (error) {
    warnings.push(`Failed to read the Xbox Game Pass catalog cache: ${error}`);
  }
  const cached = readGamePassCatalogCache(cachedRaw, now);
  let catalogRaw = cached.games;

  if (isTauri() && cached.shouldRefresh) {
    try {
      const fetched = normalizeGamePassCatalogGames(await fetchGamePassCatalog());
      if (!context.shouldApplyResult()) {
        return { games, warnings, statusMessage };
      }

      if (fetched.length > 0) {
        catalogRaw = fetched;
        persistCatalogCache(
          serializeGamePassCatalogCache({ games: fetched, fetchedAt: now }, now),
          warnings,
        );
      } else {
        warnings.push("Xbox Game Pass catalog refresh returned no valid games.");
        persistCatalogCache(serializeGamePassCatalogCache(cached, now), warnings);
      }
    } catch (error) {
      if (!context.shouldApplyResult()) {
        return { games, warnings, statusMessage };
      }
      warnings.push(`Failed to refresh Xbox Game Pass catalog: ${error}`);
      persistCatalogCache(serializeGamePassCatalogCache(cached, now), warnings);
      if (catalogRaw.length === 0) {
        statusMessage =
          "Xbox Game Pass catalog is unavailable. Installed and linked Xbox games are still shown.";
      }
    }
  }

  if (catalogRaw.length === 0) {
    return { games, warnings, statusMessage };
  }

  const catalogGames = catalogRaw.map((catalogGame) => ({
    ...ownedGameToGame(catalogGame),
    catalogSource: "pc_game_pass" as const,
    productCategory: "game",
  }));
  const enrichedGames = mergeCatalogArtwork(games, catalogGames);
  const existingIds = new Set(enrichedGames.map((game) => game.id.toLowerCase()));
  const existingXboxExternalIds = new Set(
    enrichedGames
      .filter((game) => game.launcher === "xbox" && game.externalId)
      .map((game) => game.externalId!.toLowerCase()),
  );
  const existingXboxTitles = new Set(
    enrichedGames
      .filter((game) => game.launcher === "xbox")
      .map((game) => normalizedTitle(game.title)),
  );
  const missingCatalogGames = catalogGames.filter((game) => {
    if (existingIds.has(game.id.toLowerCase())) {
      return false;
    }
    if (game.externalId && existingXboxExternalIds.has(game.externalId.toLowerCase())) {
      return false;
    }
    const titleKey = normalizedTitle(game.title);
    if (existingXboxTitles.has(titleKey)) {
      return false;
    }
    existingXboxTitles.add(titleKey);
    return true;
  });

  return {
    games: [...enrichedGames, ...missingCatalogGames],
    warnings,
    statusMessage,
  };
}
