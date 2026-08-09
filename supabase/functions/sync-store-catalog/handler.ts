// deno-lint-ignore-file no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export interface SyncStoreCatalogDeps {
  fetchJson?: (url: URL, init?: RequestInit) => Promise<unknown>;
  fetchItadPrices?: (
    gameIds: string[],
    apiKey: string,
    fetchJson: (url: URL, init?: RequestInit) => Promise<unknown>,
  ) => Promise<Record<string, ItadPrice>>;
  upsertCatalogRows?: (
    rows: StoreCatalogRow[],
    config: { supabaseUrl: string; serviceRoleKey: string },
  ) => Promise<{ upserted: number; error?: string }>;
  getIgdbClientId: () => string;
  getIgdbClientSecret: () => string;
  getItadApiKey: () => string;
  getSupabaseUrl: () => string;
  getSupabaseServiceRoleKey: () => string;
}

export interface ItadPrice {
  priceCents: number;
  discountPercent: number;
  storeUrl: string;
  shopName: string;
  shopId: number;
}

export interface ItadGame {
  id: string;
  title: string;
  slug?: string;
  assets?: { boxart?: string; banner300?: string };
}

export interface IgdbGame {
  id: number;
  name: string;
  slug?: string;
  summary?: string;
  first_release_date?: number;
  genres?: Array<{ name?: string }>;
  involved_companies?: Array<{ company?: { name?: string }; publisher?: boolean }>;
  cover?: { image_id?: string };
  platforms?: Array<{ name?: string }>;
  websites?: Array<{ url?: string }>;
}

export interface StoreCatalogRow {
  external_id: string;
  source: "itad";
  title: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  publisher: string | null;
  release_date: string | null;
  genres: string[];
  tags: string[];
  platforms: string[];
  price_cents: number;
  discount_percent: number;
  cover_image_url: string | null;
  rating: number | null;
  ratings_count: number;
  downloads_count: number;
  metadata: Record<string, unknown>;
  last_synced_at: string;
}

export const ITAD_SHOP_IDS: Record<string, number> = {
  Steam: 61,
  GOG: 35,
  "Epic Games": 16,
  Xbox: 48,
  EA: 6,
  Ubisoft: 11,
  "Battle.net": 34,
};

const ITAD_GAME_BATCH_SIZE = 200;
const ITAD_DISCOVERY_LIMIT = 200;
const UPSERT_BATCH_SIZE = 50;

export async function handleSyncStoreCatalog(
  request: Request,
  deps: SyncStoreCatalogDeps,
): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const itadApiKey = deps.getItadApiKey().trim();
  const igdbClientId = deps.getIgdbClientId().trim();
  const igdbClientSecret = deps.getIgdbClientSecret().trim();
  const supabaseUrl = deps.getSupabaseUrl().trim();
  const serviceRoleKey = deps.getSupabaseServiceRoleKey().trim();
  if (!itadApiKey || !igdbClientId || !igdbClientSecret || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "ITAD_API_KEY, IGDB credentials, or Supabase config is not configured." }, 500);
  }

  const fetchJson = deps.fetchJson ?? defaultFetchJson;
  const games = await fetchItadGameList(itadApiKey, fetchJson);
    const gameIds = games.map((game) => game.id);
  const prices = deps.fetchItadPrices
    ? await deps.fetchItadPrices(gameIds, itadApiKey, fetchJson)
    : await fetchItadPrices(gameIds, itadApiKey, fetchJson);
  const igdbGames = await fetchIgdbGames(
    games.map((game) => game.title),
    igdbClientId,
    igdbClientSecret,
    fetchJson,
  );

  const rows = games
    .map((game) => {
      const igdb = findIgdbGame(game.title, igdbGames);
      return toCatalogRow(game, prices[game.id], igdb);
    })
    .filter((row): row is StoreCatalogRow => row !== null);

  const upsert = deps.upsertCatalogRows ?? defaultUpsertCatalogRows;
  const result = await upsert(rows, { supabaseUrl, serviceRoleKey });
  if (result.error) return jsonResponse({ error: result.error, synced: result.upserted }, 502);

  return jsonResponse({
    synced: result.upserted,
    discovered: games.length,
    priced: Object.keys(prices).length,
    enriched: games.filter((game) => findIgdbGame(game.title, igdbGames)).length,
  });
}

export async function fetchIgdbGames(
  titles: string[],
  clientId: string,
  clientSecret: string,
  fetchJson: (url: URL, init?: RequestInit) => Promise<unknown>,
): Promise<Map<string, IgdbGame>> {
  const token = await fetchJson(new URL("https://id.twitch.tv/oauth2/token"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }).toString(),
  });
  const accessToken = token && typeof token === "object" && typeof (token as Record<string, unknown>).access_token === "string"
    ? (token as Record<string, string>).access_token
    : null;
  if (!accessToken) return new Map();

  const uniqueTitles = [...new Set(titles.map(normalizeTitle).filter(Boolean))];
  const result = new Map<string, IgdbGame>();
  for (let offset = 0; offset < uniqueTitles.length; offset += 4) {
    const batch = uniqueTitles.slice(offset, offset + 4);
    const matches = await Promise.all(batch.map(async (title) => {
      const query = `search ${JSON.stringify(title)}; fields id,name,slug,summary,first_release_date,genres.name,involved_companies.company.name,involved_companies.publisher,cover.image_id,platforms.name,websites.url; limit 10;`;
      const response = await fetchJson(new URL("https://api.igdb.com/v4/games"), {
        method: "POST",
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "text/plain",
        },
        body: query,
      });
      if (!Array.isArray(response)) return null;
      const candidates = response.filter(isIgdbGame);
      return candidates
        .map((candidate) => ({ candidate, score: titleMatchScore(title, candidate.name) }))
        .sort((a, b) => b.score - a.score)[0] ?? null;
    }));
    for (const match of matches) {
      if (match && match.score >= 0.72) result.set(normalizeTitle(match.candidate.name), match.candidate);
    }
  }
  return result;
}

/** ITAD's list endpoint is currently marked unstable. It is used only as a
 * bootstrap/incremental discovery source and the sync can be rerun safely. */
export async function fetchItadGameList(
  apiKey: string,
  fetchJson: (url: URL, init?: RequestInit) => Promise<unknown>,
): Promise<ItadGame[]> {
  const url = new URL("https://api.isthereanydeal.com/unstable/games/list/v1");
  url.searchParams.set("key", apiKey);
  const result = await fetchJson(url);
  if (!Array.isArray(result)) return [];
  return result.filter(isItadGame).slice(0, ITAD_DISCOVERY_LIMIT);
}

export async function fetchItadPrices(
  gameIds: string[],
  apiKey: string,
  fetchJson: (url: URL, init?: RequestInit) => Promise<unknown>,
): Promise<Record<string, ItadPrice>> {
  const prices: Record<string, ItadPrice> = {};
  for (let offset = 0; offset < gameIds.length; offset += ITAD_GAME_BATCH_SIZE) {
    const batch = gameIds.slice(offset, offset + ITAD_GAME_BATCH_SIZE);
    const url = new URL("https://api.isthereanydeal.com/games/prices/v3");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("country", "DE");
    url.searchParams.set("shops", Object.values(ITAD_SHOP_IDS).join(","));
    const result = await fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    });
    if (!Array.isArray(result)) continue;

    for (const entry of result) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : null;
      if (!id) continue;
      const deals = Array.isArray(record.deals) ? record.deals : [];
      const deal = deals.filter(isSupportedDeal).sort(
        (a, b) => a.price.amountInt - b.price.amountInt,
      )[0];
      if (!deal) continue;
      prices[id] = {
        priceCents: deal.price.amountInt,
        discountPercent: deal.cut,
        storeUrl: deal.url,
        shopName: deal.shop.name,
        shopId: deal.shop.id,
      };
    }
  }
  return prices;
}

function toCatalogRow(game: ItadGame, price: ItadPrice | undefined, igdb: IgdbGame | undefined): StoreCatalogRow | null {
  if (!price) return null;
  const platform = platformName(price.shopId);
  if (!platform) return null;
  const now = new Date().toISOString();
  return {
    external_id: `itad-${game.id}`,
    source: "itad",
    title: igdb?.name ?? game.title,
    slug: igdb?.slug ?? game.slug ?? game.id,
    description: igdb?.summary ?? null,
    short_description: platform,
    publisher: igdb?.involved_companies?.find((company) => company.publisher)?.company?.name ?? null,
    release_date: igdb?.first_release_date ? new Date(igdb.first_release_date * 1000).toISOString() : null,
    genres: igdb?.genres?.map((genre) => genre.name).filter((name): name is string => Boolean(name)) ?? [],
    tags: ["IGDB", "ITAD"],
    platforms: [platform, ...(igdb?.platforms?.map((value) => value.name).filter((name): name is string => Boolean(name)) ?? [])].filter((value, index, values) => values.indexOf(value) === index),
    price_cents: price.priceCents,
    discount_percent: price.discountPercent,
    cover_image_url: igdb?.cover?.image_id
      ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${igdb.cover.image_id}.jpg`
      : game.assets?.boxart ?? game.assets?.banner300 ?? null,
    rating: null,
    ratings_count: 0,
    downloads_count: 0,
    metadata: {
      apiSource: "igdb+itad",
      externalId: game.id,
      platformLinks: { [platform]: price.storeUrl },
      priceUnavailable: false,
      currency: "EUR",
      shopId: price.shopId,
    },
    last_synced_at: now,
  };
}

function findIgdbGame(title: string, games: Map<string, IgdbGame>) {
  let best: { game: IgdbGame; score: number } | null = null;
  for (const game of games.values()) {
    const score = titleMatchScore(title, game.name);
    if (!best || score > best.score) best = { game, score };
  }
  return best && best.score >= 0.72 ? best.game : undefined;
}

function normalizeTitle(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function titleMatchScore(left: string, right: string) {
  const a = normalizeTitle(left);
  const b = normalizeTitle(right);
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const leftWords = new Set(a.split(" ").filter((word) => word.length > 1));
  const rightWords = new Set(b.split(" ").filter((word) => word.length > 1));
  if (leftWords.size === 0 || rightWords.size === 0) return 0;
  const intersection = [...leftWords].filter((word) => rightWords.has(word)).length;
  return intersection / Math.max(leftWords.size, rightWords.size);
}

function isIgdbGame(value: unknown): value is IgdbGame {
  return Boolean(value && typeof value === "object" && typeof (value as Record<string, unknown>).id === "number" && typeof (value as Record<string, unknown>).name === "string");
}

function isSupportedDeal(value: unknown): value is {
  shop: { id: number; name: string };
  price: { amountInt: number };
  cut: number;
  url: string;
} {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const shop = record.shop as Record<string, unknown> | undefined;
  const price = record.price as Record<string, unknown> | undefined;
  return typeof shop?.id === "number" && Boolean(platformName(shop.id)) &&
    typeof shop.name === "string" && typeof price?.amountInt === "number" &&
    typeof record.cut === "number" && typeof record.url === "string";
}

function platformName(shopId: number) {
  return Object.entries(ITAD_SHOP_IDS).find(([, id]) => id === shopId)?.[0] ?? null;
}

function isItadGame(value: unknown): value is ItadGame {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" &&
    typeof record.title === "string" &&
    record.title.trim().length > 0;
}

async function defaultFetchJson(url: URL, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function defaultUpsertCatalogRows(
  rows: StoreCatalogRow[],
  config: { supabaseUrl: string; serviceRoleKey: string },
): Promise<{ upserted: number; error?: string }> {
  const client = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let upserted = 0;
  for (let offset = 0; offset < rows.length; offset += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + UPSERT_BATCH_SIZE);
    const { error } = await client.from("store_catalog").upsert(batch, {
      onConflict: "external_id",
    });
    if (error) return { upserted, error: error.message };
    upserted += batch.length;
  }
  return { upserted };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
