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
import {
  mergeXboxArtworkCandidates,
  normalizeXboxCatalogTitle,
  normalizeXboxStoreProductId,
  preferXboxArtwork,
} from "./xbox-metadata";

function persistCatalogCache(value: string, warnings: string[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.GAME_PASS_CATALOG_CACHE, value);
  } catch (error) {
    warnings.push(`Failed to persist the Xbox Game Pass catalog cache: ${error}`);
  }
}

function mergeCatalogArtwork(games: Game[], catalogGames: Game[]): Game[] {
  const byProductId = new Map<string, Game>();
  const byTitle = new Map<string, Game>();
  for (const catalogGame of catalogGames) {
    if (catalogGame.externalId && !byProductId.has(catalogGame.externalId.toLowerCase())) {
      byProductId.set(catalogGame.externalId.toLowerCase(), catalogGame);
    }
    const titleKey = normalizeXboxCatalogTitle(catalogGame.title);
    if (titleKey && !byTitle.has(titleKey)) {
      byTitle.set(titleKey, catalogGame);
    }
  }
  return games.map((game) => {
    if (game.launcher !== "xbox") {
      return game;
    }

    const stableCatalogGame = game.externalId
      ? byProductId.get(game.externalId.toLowerCase())
      : undefined;
    const titleCatalogGame = byTitle.get(normalizeXboxCatalogTitle(game.title));
    const gameProductId = normalizeXboxStoreProductId(game.externalId);
    const titleProductId = normalizeXboxStoreProductId(titleCatalogGame?.externalId);
    const catalogGame =
      stableCatalogGame ??
      (gameProductId && titleProductId && gameProductId !== titleProductId
        ? undefined
        : titleCatalogGame);
    if (!catalogGame) {
      return game;
    }

    const coverUrl = preferXboxArtwork(game.coverUrl, catalogGame.coverUrl);
    const iconUrl = preferXboxArtwork(game.iconUrl, catalogGame.iconUrl);
    const logoUrl = preferXboxArtwork(game.logoUrl, catalogGame.logoUrl);

    return {
      ...game,
      catalogSource: catalogGame.catalogSource ?? "pc_game_pass",
      productCategory: game.productCategory ?? catalogGame.productCategory,
      coverUrl,
      logoUrl,
      iconUrl,
      iconUrls: mergeXboxArtworkCandidates(
        iconUrl,
        ...(game.iconUrls ?? []),
        catalogGame.iconUrl,
        ...(catalogGame.iconUrls ?? []),
      ),
      logoUrls: mergeXboxArtworkCandidates(
        logoUrl,
        ...(game.logoUrls ?? []),
        catalogGame.logoUrl,
        ...(catalogGame.logoUrls ?? []),
      ),
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
      .map((game) => normalizeXboxCatalogTitle(game.title)),
  );
  const initialXboxTitleProductIds = new Map<string, Set<string>>();
  for (const game of enrichedGames) {
    if (game.launcher !== "xbox") {
      continue;
    }
    const titleKey = normalizeXboxCatalogTitle(game.title);
    const productId = normalizeXboxStoreProductId(game.externalId);
    if (!titleKey || !productId) {
      continue;
    }
    const productIds = initialXboxTitleProductIds.get(titleKey) ?? new Set<string>();
    productIds.add(productId);
    initialXboxTitleProductIds.set(titleKey, productIds);
  }
  const addedConflictingCatalogTitles = new Set<string>();
  const missingCatalogGames = catalogGames.filter((game) => {
    if (existingIds.has(game.id.toLowerCase())) {
      return false;
    }
    if (game.externalId && existingXboxExternalIds.has(game.externalId.toLowerCase())) {
      return false;
    }
    const titleKey = normalizeXboxCatalogTitle(game.title);
    if (existingXboxTitles.has(titleKey)) {
      const productId = normalizeXboxStoreProductId(game.externalId);
      const initialProductIds = initialXboxTitleProductIds.get(titleKey);
      const hasStableIdConflict =
        productId !== undefined &&
        initialProductIds !== undefined &&
        initialProductIds.size > 0 &&
        !initialProductIds.has(productId);
      if (hasStableIdConflict && !addedConflictingCatalogTitles.has(titleKey)) {
        addedConflictingCatalogTitles.add(titleKey);
        return true;
      }
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
