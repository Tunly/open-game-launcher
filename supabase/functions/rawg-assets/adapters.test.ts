import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { createRawgAssetsAdapters } from "./adapters.ts";

const endpoint = "https://functions.example/rawg-assets";

Deno.test("RAWG assets adapters parse allowed origins at call time", () => {
  const env = envStub({
    RAWG_ASSETS_ALLOWED_ORIGINS:
      " https://og-launcher.example, , http://localhost:5173 ",
    SUPABASE_ANON_KEY: "anon-test",
    SUPABASE_URL: "https://supabase.test",
  });
  const adapters = createRawgAssetsAdapters({ env });

  assertEquals(adapters.getAllowedOrigins?.(), [
    "https://og-launcher.example",
    "http://localhost:5173",
  ]);

  env.values.RAWG_ASSETS_ALLOWED_ORIGINS = "https://later.example";
  assertEquals(adapters.getAllowedOrigins?.(), ["https://later.example"]);
});

Deno.test("RAWG assets adapters read RAWG_API_KEY lazily and trim it", () => {
  const env = envStub({
    RAWG_API_KEY: " first-key ",
    SUPABASE_ANON_KEY: "anon-test",
    SUPABASE_URL: "https://supabase.test",
  });
  const adapters = createRawgAssetsAdapters({ env });

  assertEquals(adapters.getRawgApiKey(), "first-key");

  env.values.RAWG_API_KEY = " second-key ";
  assertEquals(adapters.getRawgApiKey(), "second-key");
});

Deno.test("RAWG assets adapters require Supabase auth configuration", async () => {
  let createClientCalls = 0;
  const adapters = createRawgAssetsAdapters({
    createClient: () => {
      createClientCalls += 1;
      throw new Error("client should not be created");
    },
    env: envStub(),
  });

  assertEquals(
    await adapters.requireAuthenticatedUser(
      request({ Authorization: "Bearer user-token" }),
    ),
    {
      error: "Supabase auth is not configured.",
      status: 500,
    },
  );
  assertEquals(createClientCalls, 0);
});

Deno.test("RAWG assets adapters reject missing bearer tokens and anon key callers", async () => {
  let createClientCalls = 0;
  const adapters = createRawgAssetsAdapters({
    createClient: () => {
      createClientCalls += 1;
      throw new Error("client should not be created");
    },
    env: envStub({
      SUPABASE_ANON_KEY: "anon-test",
      SUPABASE_URL: "https://supabase.test",
    }),
  });

  assertEquals(await adapters.requireAuthenticatedUser(request()), {
    error: "Sign in required.",
    status: 401,
  });
  assertEquals(
    await adapters.requireAuthenticatedUser(
      request({ Authorization: "Bearer anon-test" }),
    ),
    {
      error: "Sign in required.",
      status: 401,
    },
  );
  assertEquals(createClientCalls, 0);
});

Deno.test("RAWG assets adapters validate caller bearer token with Supabase", async () => {
  const calls: unknown[] = [];
  const adapters = createRawgAssetsAdapters({
    createClient: (supabaseUrl, supabaseAnonKey, options) => {
      calls.push({ options, supabaseAnonKey, supabaseUrl });
      return {
        auth: {
          getUser: async (token) => {
            calls.push({ method: "getUser", token });
            return {
              data: { user: { id: "user-1" } },
              error: null,
            };
          },
        },
      };
    },
    env: envStub({
      SUPABASE_ANON_KEY: "anon-test",
      SUPABASE_URL: "https://supabase.test",
    }),
  });

  assertEquals(
    await adapters.requireAuthenticatedUser(
      request({ Authorization: "Bearer user-token" }),
    ),
    { user: { id: "user-1" } },
  );
  assertEquals(calls, [
    {
      options: {
        auth: { persistSession: false, autoRefreshToken: false },
      },
      supabaseAnonKey: "anon-test",
      supabaseUrl: "https://supabase.test",
    },
    { method: "getUser", token: "user-token" },
  ]);
});

Deno.test("RAWG assets adapters map invalid Supabase sessions to existing auth error", async () => {
  const adapters = createRawgAssetsAdapters({
    createClient: () => ({
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: new Error("jwt expired"),
        }),
      },
    }),
    env: envStub({
      SUPABASE_ANON_KEY: "anon-test",
      SUPABASE_URL: "https://supabase.test",
    }),
  });

  assertEquals(
    await adapters.requireAuthenticatedUser(
      request({ Authorization: "Bearer expired-token" }),
    ),
    {
      error: "Invalid or expired session.",
      status: 401,
    },
  );
});

Deno.test("RAWG assets adapters fetch RAWG JSON with launcher user agent", async () => {
  const calls: unknown[] = [];
  const adapters = createRawgAssetsAdapters({
    env: envStub({
      SUPABASE_ANON_KEY: "anon-test",
      SUPABASE_URL: "https://supabase.test",
    }),
    fetch: async (input, init) => {
      calls.push({ init, url: input.toString() });
      return Response.json({ results: [{ id: 3498 }] });
    },
  });
  const url = new URL("https://api.rawg.io/api/games");
  url.searchParams.set("key", "rawg-key");
  url.searchParams.set("search", "Half-Life");
  url.searchParams.set("search_precise", "true");
  url.searchParams.set("page_size", "1");

  assertEquals(await adapters.fetchJson?.(url), { results: [{ id: 3498 }] });
  assertEquals(calls, [
    {
      init: {
        headers: {
          "User-Agent": "OG-Launcher/0.1",
        },
      },
      url:
        "https://api.rawg.io/api/games?key=rawg-key&search=Half-Life&search_precise=true&page_size=1",
    },
  ]);
});

Deno.test("RAWG assets adapters return null for failed or invalid RAWG responses", async () => {
  const failedAdapters = createRawgAssetsAdapters({
    env: envStub(),
    fetch: async () => new Response("bad gateway", { status: 502 }),
  });
  assertEquals(
    await failedAdapters.fetchJson?.(new URL("https://api.rawg.io/api/games")),
    null,
  );

  const invalidAdapters = createRawgAssetsAdapters({
    env: envStub(),
    fetch: async () => new Response("{", { status: 200 }),
  });
  assertEquals(
    await invalidAdapters.fetchJson?.(new URL("https://api.rawg.io/api/games")),
    null,
  );
});

function request(headers: HeadersInit = {}) {
  return new Request(endpoint, { headers });
}

function envStub(values: Record<string, string | undefined> = {}) {
  return {
    values: { ...values },
    get(key: string) {
      return this.values[key];
    },
  };
}
