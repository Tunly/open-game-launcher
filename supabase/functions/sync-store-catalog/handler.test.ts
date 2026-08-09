import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { fetchIgdbGames, fetchItadGameList, fetchItadPrices, handleSyncStoreCatalog, type StoreCatalogRow, type SyncStoreCatalogDeps } from "./handler.ts";

function deps(overrides: Partial<SyncStoreCatalogDeps> = {}): SyncStoreCatalogDeps {
  return {
    getIgdbClientId: () => "igdb-client-id",
    getIgdbClientSecret: () => "igdb-client-secret",
    getItadApiKey: () => "itad-key",
    getSupabaseUrl: () => "https://test.supabase.co",
    getSupabaseServiceRoleKey: () => "service-key",
    fetchJson: async () => [],
    fetchItadPrices: async () => ({}),
    upsertCatalogRows: async (rows) => ({ upserted: rows.length }),
    ...overrides,
  };
}

Deno.test("GET returns 405", async () => {
  const response = await handleSyncStoreCatalog(new Request("https://example.com", { method: "GET" }), deps());
  assertEquals(response.status, 405);
});

Deno.test("POST without ITAD key returns 500", async () => {
  const response = await handleSyncStoreCatalog(new Request("https://example.com", { method: "POST" }), deps({ getItadApiKey: () => "" }));
  assertEquals(response.status, 500);
});

Deno.test("discovers games from ITAD game list", async () => {
  const games = await fetchItadGameList("key", async (url) => {
    assertStringIncludes(url.toString(), "/unstable/games/list/v1");
    return [{ id: "itad-1", title: "Test Game", slug: "test-game" }, { id: "dlc-1", title: "DLC", type: "dlc" }];
  });
  assertEquals(games.map((game) => game.id), ["itad-1", "dlc-1"]);
});

Deno.test("fetches ITAD v3 prices with supported shops", async () => {
  let body: unknown;
  const prices = await fetchItadPrices(["itad-1"], "key", async (url, init) => {
    assertStringIncludes(url.toString(), "/games/prices/v3");
    body = JSON.parse(String(init?.body));
    return [{ id: "itad-1", deals: [{ shop: { id: 61, name: "Steam" }, price: { amountInt: 1999 }, cut: 20, url: "https://steam.example/game" }] }];
  });
  assertEquals(body, ["itad-1"]);
  assertEquals(prices["itad-1"].priceCents, 1999);
  assertEquals(prices["itad-1"].shopName, "Steam");
});

Deno.test("authenticates with Twitch and enriches games from IGDB", async () => {
  const calls: string[] = [];
  const games = await fetchIgdbGames(["Test Game"], "client-id", "client-secret", async (url, init) => {
    calls.push(`${url.hostname}${url.pathname}`);
    if (url.hostname === "id.twitch.tv") return { access_token: "access-token" };
    assertEquals((init?.headers as Record<string, string>)["Client-ID"], "client-id");
    assertStringIncludes(String(init?.body), "search");
    return [{ id: 7, name: "Test Game", slug: "test-game", summary: "A test game." }];
  });
  assertEquals(calls, ["id.twitch.tv/oauth2/token", "api.igdb.com/v4/games"]);
  assertEquals(games.get("test game")?.id, 7);
});

Deno.test("syncs priced ITAD games into store_catalog", async () => {
  let rows: StoreCatalogRow[] = [];
  const response = await handleSyncStoreCatalog(new Request("https://example.com", { method: "POST" }), deps({
    fetchJson: async (url) => url.pathname.includes("games/list") ? [{ id: "itad-1", title: "Test Game", slug: "test-game" }] : [],
    fetchItadPrices: async () => ({ "itad-1": { priceCents: 1999, discountPercent: 20, storeUrl: "https://steam.example/game", shopName: "Steam", shopId: 61 } }),
    upsertCatalogRows: async (next) => { rows = next; return { upserted: next.length }; },
  }));
  assertEquals(response.status, 200);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].external_id, "itad-itad-1");
  assertEquals(rows[0].platforms, ["Steam"]);
  assertEquals(rows[0].price_cents, 1999);
});
