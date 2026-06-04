import type { Game } from "./types";
import { getGameSource } from "./formatters";
import { fetchSteamNewsForApp } from "./launcher";

export type GameUpdateKind = "patch" | "update" | "news";

export interface GameUpdateItem {
  id: string;
  source: "steam";
  sourceId: string;
  title: string;
  url: string | null;
  publishedAt: string;
  excerpt: string;
  kind: GameUpdateKind;
}

type SteamNewsItem = {
  gid?: string | number;
  title?: string;
  url?: string;
  contents?: string;
  date?: number;
};

type SteamNewsResponse = {
  appnews?: {
    newsitems?: SteamNewsItem[];
  };
};

type CachedGameUpdates = {
  cachedAt: number;
  items: GameUpdateItem[];
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const UPDATE_PATTERN =
  /\b(patch|hotfix|changelog|change\s*log|release\s+notes?|updates?|v\d+(?:\.\d+)+|\d+\.\d+(?:\.\d+)*)\b/i;

export function resolveSteamAppId(game: Game): string | null {
  if (getGameSource(game) === "steam") {
    const externalId = normalizeSteamAppId(game.externalId);
    if (externalId) {
      return externalId;
    }

    const id = normalizeSteamAppId(game.id);
    if (id) {
      return id;
    }
  }

  const launchUri = normalizeSteamAppId(game.launchUri);
  if (launchUri) {
    return launchUri;
  }

  return null;
}

export async function getGameUpdates(game: Game): Promise<GameUpdateItem[]> {
  const steamAppId = resolveSteamAppId(game);
  if (!steamAppId) {
    return [];
  }

  const cached = readCachedUpdates(steamAppId);
  if (cached) {
    return cached;
  }

  const items = await fetchSteamNews(steamAppId);
  writeCachedUpdates(steamAppId, items);
  return items;
}

export async function fetchSteamNews(steamAppId: string): Promise<GameUpdateItem[]> {
  const json = (await fetchSteamNewsForApp(steamAppId)) as SteamNewsResponse;
  return mapSteamNewsItems(steamAppId, json.appnews?.newsitems ?? []);
}

export function mapSteamNewsItems(
  steamAppId: string,
  newsItems: SteamNewsItem[],
): GameUpdateItem[] {
  const items = newsItems.map((item, index) => {
    const title = sanitizeText(item.title ?? "Steam News");
    const excerpt = sanitizeText(item.contents ?? "");
    const publishedAt = item.date
      ? new Date(item.date * 1000).toISOString()
      : new Date(0).toISOString();

    return {
      id: String(item.gid ?? `${steamAppId}-${item.date ?? index}`),
      source: "steam" as const,
      sourceId: steamAppId,
      title,
      url: item.url ?? null,
      publishedAt,
      excerpt,
      kind: classifyGameUpdate(title, excerpt),
    };
  });

  return prioritizePatchUpdates(items);
}

export function classifyGameUpdate(title: string, excerpt = ""): GameUpdateKind {
  const text = `${title} ${excerpt}`;
  if (!UPDATE_PATTERN.test(text)) {
    return "news";
  }

  if (
    /\b(patch|hotfix|changelog|change\s*log|release\s+notes?|v\d+(?:\.\d+)+|\d+\.\d+(?:\.\d+)*)\b/i.test(
      text,
    )
  ) {
    return "patch";
  }

  return "update";
}

export function readCachedUpdates(steamAppId: string): GameUpdateItem[] | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(cacheKey(steamAppId));
    if (!raw) {
      return null;
    }

    const cached = JSON.parse(raw) as CachedGameUpdates;
    if (!Array.isArray(cached.items) || Date.now() - cached.cachedAt > CACHE_TTL_MS) {
      return null;
    }

    return cached.items;
  } catch {
    return null;
  }
}

export function writeCachedUpdates(steamAppId: string, items: GameUpdateItem[]) {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    const cached: CachedGameUpdates = { cachedAt: Date.now(), items };
    window.localStorage.setItem(cacheKey(steamAppId), JSON.stringify(cached));
  } catch {
    // Cache failures should not break the library page.
  }
}

function normalizeSteamAppId(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed.match(/(?:steam-|app\/|rungameid\/|appid[=:])(\d+)/i)?.[1] ?? null;
}

function prioritizePatchUpdates(items: GameUpdateItem[]): GameUpdateItem[] {
  const patchItems = items.filter((item) => item.kind !== "news");
  if (patchItems.length === 0) {
    return items;
  }

  const newsItems = items.filter((item) => item.kind === "news");
  return [...patchItems, ...newsItems];
}

function sanitizeText(value: string): string {
  return value
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function cacheKey(steamAppId: string) {
  return `og-launcher:game-updates:${steamAppId}`;
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}
