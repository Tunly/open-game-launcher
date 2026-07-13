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

function xboxGameIndex(games: Game[]) {
  const byId = new Map<string, Game>();
  const byExternalId = new Map<string, Game>();
  const byPackageFamilyName = new Map<string, Game>();
  const byTitle = new Map<string, Game>();

  for (const game of games) {
    if (!byId.has(game.id.toLowerCase())) {
      byId.set(game.id.toLowerCase(), game);
    }
    if (game.externalId && !byExternalId.has(game.externalId.toLowerCase())) {
      byExternalId.set(game.externalId.toLowerCase(), game);
    }
    const packageFamilyName = xboxPackageFamilyName(game);
    if (packageFamilyName && !byPackageFamilyName.has(packageFamilyName)) {
      byPackageFamilyName.set(packageFamilyName, game);
    }
    const titleKey = normalizeXboxCatalogTitle(game.title);
    if (titleKey && !byTitle.has(titleKey)) {
      byTitle.set(titleKey, game);
    }
  }

  return { byId, byExternalId, byPackageFamilyName, byTitle };
}

function matchingXboxGame(game: Game, index: ReturnType<typeof xboxGameIndex>): Game | undefined {
  const packageFamilyName = xboxPackageFamilyName(game);
  const stableMatch =
    (game.externalId ? index.byExternalId.get(game.externalId.toLowerCase()) : undefined) ??
    (packageFamilyName ? index.byPackageFamilyName.get(packageFamilyName) : undefined) ??
    index.byId.get(game.id.toLowerCase());
  if (stableMatch) {
    return stableMatch;
  }

  const titleMatch = index.byTitle.get(normalizeXboxCatalogTitle(game.title));
  const gameProductId = normalizeXboxStoreProductId(game.externalId);
  const titleProductId = normalizeXboxStoreProductId(titleMatch?.externalId);
  return gameProductId && titleProductId && gameProductId !== titleProductId
    ? undefined
    : titleMatch;
}

function xboxPackageFamilyName(game: Game): string | undefined {
  const idCandidate = game.id.replace(/^xbox-(?:owned-)?/i, "");
  for (const candidate of [idCandidate, game.launchUri]) {
    const match = candidate?.match(/(?:^|[\\/:])([a-z0-9][a-z0-9.-]*_[a-z0-9]+)(?:!|$)/i);
    if (match) {
      return match[1].toLowerCase();
    }
  }
  return undefined;
}

function mergeXboxArtwork(game: Game, owned: Game): Game {
  const coverUrl = preferXboxArtwork(game.coverUrl, owned.coverUrl);
  const iconUrl = preferXboxArtwork(game.iconUrl, owned.iconUrl);
  const logoUrl = preferXboxArtwork(game.logoUrl, owned.logoUrl);

  return {
    ...game,
    externalId: game.externalId ?? owned.externalId,
    coverUrl,
    iconUrl,
    iconUrls: mergeXboxArtworkCandidates(
      iconUrl,
      ...(game.iconUrls ?? []),
      owned.iconUrl,
      ...(owned.iconUrls ?? []),
    ),
    logoUrl,
    logoUrls: mergeXboxArtworkCandidates(
      logoUrl,
      ...(game.logoUrls ?? []),
      owned.logoUrl,
      ...(owned.logoUrls ?? []),
    ),
  };
}

export async function mergeXboxOwned(
  games: Game[],
  context: MergeContext,
): Promise<ProviderResult> {
  void context;
  const warnings: string[] = [];
  const statusMessage: string | null = null;

  const xboxGamesStr = localStorage.getItem(STORAGE_KEYS.XBOX_GAMES_CACHE);
  if (!xboxGamesStr) {
    return { games, warnings, statusMessage };
  }

  try {
    const xboxRaw = JSON.parse(xboxGamesStr);
    if (!Array.isArray(xboxRaw) || xboxRaw.length === 0) {
      return { games, warnings, statusMessage };
    }

    const ownedXboxGames = xboxRaw.map(ownedGameToGame);
    const ownedIndex = xboxGameIndex(ownedXboxGames);
    const enrichedGames = games.map((game) => {
      if (game.launcher !== "xbox" && !game.id.toLowerCase().startsWith("xbox-")) {
        return game;
      }
      const owned = matchingXboxGame(game, ownedIndex);
      return owned ? mergeXboxArtwork(game, owned) : game;
    });
    const existingXboxGames = enrichedGames.filter(
      (game) => game.launcher === "xbox" || game.id.toLowerCase().startsWith("xbox-"),
    );
    const uninstalledOwned: Game[] = [];
    for (const owned of ownedXboxGames) {
      const existingIndex = xboxGameIndex([...existingXboxGames, ...uninstalledOwned]);
      if (!matchingXboxGame(owned, existingIndex)) {
        uninstalledOwned.push(owned);
      }
    }

    return {
      games: [...enrichedGames, ...uninstalledOwned],
      warnings,
      statusMessage,
    };
  } catch (err) {
    warnings.push(`Failed to load Xbox games from cache: ${err}`);
    return { games, warnings, statusMessage };
  }
}
