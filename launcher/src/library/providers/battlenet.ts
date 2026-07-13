import { isTauri } from "@tauri-apps/api/core";

import { installedBattlenetIds, ownedGameToGame } from "../../lib/library-providers";
import { processBattleNetGamesPayload } from "../../lib/launcher";
import { STORAGE_KEYS } from "../../lib/storage-keys";
import type { Game } from "../../lib/types";
import type { MergeContext, ProviderResult } from "./types";

export async function mergeBattlenetOwned(
  games: Game[],
  context: MergeContext,
): Promise<ProviderResult> {
  void context;
  const warnings: string[] = [];
  const statusMessage: string | null = null;

  const battlenetGamesStr = localStorage.getItem(STORAGE_KEYS.BATTLENET_GAMES_CACHE);
  if (!battlenetGamesStr) {
    return { games, warnings, statusMessage };
  }

  try {
    let battlenetRaw = JSON.parse(battlenetGamesStr);
    if (!Array.isArray(battlenetRaw) || battlenetRaw.length === 0) {
      return { games, warnings, statusMessage };
    }

    if (isTauri()) {
      try {
        const hydrated = await processBattleNetGamesPayload(
          encodeBattlenetPayloadForHydration(battlenetRaw),
        );
        if (hydrated.length > 0) {
          battlenetRaw = hydrated;
          localStorage.setItem(STORAGE_KEYS.BATTLENET_GAMES_CACHE, JSON.stringify(hydrated));
        }
      } catch (error) {
        warnings.push(`Failed to hydrate Battle.net artwork from the local client cache: ${error}`);
      }
    }

    const ownedBattlenetGames: Game[] = (
      battlenetRaw as Array<Parameters<typeof ownedGameToGame>[0]>
    )
      .map(ownedGameToGame)
      .map(applyBattlenetProviderArtwork);
    const enrichedGames = games.map((game) => {
      const enriched = applyBattlenetProviderArtwork(game);
      const installedKeys = installedBattlenetIds([enriched]);
      if (installedKeys.size === 0) return enriched;

      const owned = ownedBattlenetGames.find((candidate) => {
        const bnetId = candidate.id.replace("battlenet-owned-", "");
        const externalId = candidate.externalId || bnetId;
        return (
          installedKeys.has(bnetId) ||
          installedKeys.has(externalId) ||
          installedKeys.has(candidate.title.toLowerCase())
        );
      });
      if (!owned) return enriched;

      return {
        ...enriched,
        coverUrl: enriched.coverUrl ?? owned.coverUrl,
        iconUrl: enriched.iconUrl ?? owned.iconUrl,
        iconUrls: uniqueArtworkUrls([
          ...(enriched.iconUrls ?? []),
          ...(owned.iconUrls ?? []),
          owned.iconUrl,
        ]),
        logoUrl: enriched.logoUrl ?? owned.logoUrl,
        logoUrls: uniqueArtworkUrls([
          ...(enriched.logoUrls ?? []),
          ...(owned.logoUrls ?? []),
          owned.logoUrl,
        ]),
      };
    });
    const installed = installedBattlenetIds(enrichedGames);
    const uninstalledOwned = ownedBattlenetGames.filter((og) => {
      const bnetId = og.id.replace("battlenet-owned-", "");
      const extId = og.externalId || bnetId;
      return (
        !installed.has(bnetId) && !installed.has(extId) && !installed.has(og.title.toLowerCase())
      );
    });

    return {
      games: [...enrichedGames, ...uninstalledOwned],
      warnings,
      statusMessage,
    };
  } catch (err) {
    warnings.push(`Failed to load Battle.net games from cache: ${err}`);
    return { games, warnings, statusMessage };
  }
}

function applyBattlenetProviderArtwork(game: Game): Game {
  const artwork = battlenetProviderArtwork(game.externalId ?? game.id, game.title);
  if (!artwork) return game;

  const shouldReplaceCover = isGeneratedBattlenetArtwork(game.coverUrl);
  const shouldReplaceIcon = isGeneratedBattlenetArtwork(game.iconUrl);
  const coverUrl = shouldReplaceCover ? artwork.coverUrl : game.coverUrl;
  const iconUrl = shouldReplaceIcon ? (artwork.iconUrl ?? artwork.coverUrl) : game.iconUrl;
  return {
    ...game,
    coverUrl: coverUrl ?? artwork.coverUrl,
    iconUrl: iconUrl ?? artwork.iconUrl ?? artwork.coverUrl,
    iconUrls: uniqueArtworkUrls([
      iconUrl ?? artwork.iconUrl ?? artwork.coverUrl,
      ...(game.iconUrls ?? []).filter((url) => !isGeneratedBattlenetArtwork(url)),
    ]),
  };
}

type BattlenetProviderArtwork = {
  coverUrl: string;
  iconUrl?: string;
};

function battlenetProviderArtwork(id: string, title: string): BattlenetProviderArtwork | undefined {
  const normalizedId = id.toLowerCase();
  const normalizedTitle = normalizeBattlenetArtworkKey(title);
  if (
    normalizedId.includes("wow") ||
    normalizedTitle.includes("world of warcraft") ||
    normalizedTitle.includes("burning crusade")
  ) {
    return {
      coverUrl:
        "https://bnetcmsus-a.akamaihd.net/cms/content_entry_media/3f/3F7V2QWSSRCK1770317485433.png",
    };
  }
  if (
    normalizedId.includes("hearthstone") ||
    normalizedId.includes("wtcg") ||
    normalizedTitle.includes("hearthstone")
  ) {
    return {
      coverUrl:
        "https://d39zum0jwvcigt.cloudfront.net/_next/static/images/default-475d770302527dbab7708dca2af05afd.jpg",
    };
  }
  if (normalizedId.includes("overwatch") || normalizedTitle.includes("overwatch")) {
    return {
      coverUrl:
        "https://blz-contentstack-images.akamaized.net/v3/assets/blt2477dcaf4ebd440c/blt45586c965db08717/6823abc24dee72d806fff5e2/OpenGraph.jpg",
    };
  }
  if (
    normalizedId.includes("17459") ||
    normalizedId.includes("d3") ||
    normalizedTitle.includes("diablo iii") ||
    normalizedTitle.includes("diablo 3")
  ) {
    return {
      coverUrl:
        "https://blz-contentstack-images.akamaized.net/v3/assets/blt9c12f249ac15c7ec/blte3178c04d93773f1/67ce27f440e6651e27e17582/og_image.webp",
    };
  }
  if (
    normalizedId.includes("fenris") ||
    normalizedTitle.includes("diablo iv") ||
    normalizedTitle.includes("diablo 4")
  ) {
    return {
      coverUrl:
        "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/2344520/header.jpg",
    };
  }
  if (normalizedTitle.includes("destiny 2")) {
    return {
      coverUrl:
        "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1085660/header.jpg",
    };
  }
  return undefined;
}

function normalizeBattlenetArtworkKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[®™©]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isGeneratedBattlenetArtwork(url?: string): boolean {
  return !url || url.startsWith("data:image/svg+xml,");
}

function uniqueArtworkUrls(urls: Array<string | undefined>): string[] {
  return urls.filter(
    (url, index, candidates): url is string => Boolean(url) && candidates.indexOf(url) === index,
  );
}

function encodeBattlenetPayloadForHydration(games: Array<Record<string, unknown>>): string {
  const compact = games.flatMap((game) => {
    const title = typeof game.title === "string" ? game.title : null;
    const id =
      typeof game.externalId === "string"
        ? game.externalId
        : typeof game.id === "string"
          ? game.id.replace(/^battlenet-owned-/, "")
          : null;
    return title && id ? [{ n: title, i: id }] : [];
  });
  const bytes = new TextEncoder().encode(JSON.stringify(compact));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
