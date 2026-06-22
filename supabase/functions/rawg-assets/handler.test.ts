import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { handleRawgAssets, type RawgAssetsHandlerDeps } from "./handler.ts";

const endpoint = "https://functions.example/rawg-assets";
const allowedOrigin = "https://og-launcher.example";
const fetchedAt = "2026-06-15T10:30:00.000Z";

Deno.test("RAWG assets handler answers allowed CORS preflight without dependencies", async () => {
  const response = await handleRawgAssets(
    new Request(endpoint, {
      headers: { Origin: allowedOrigin },
      method: "OPTIONS",
    }),
    deps({
      getRawgApiKey: () => {
        throw new Error("RAWG key should not be read");
      },
      requireAuthenticatedUser: () => {
        throw new Error("auth should not run");
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(
    response.headers.get("Access-Control-Allow-Origin"),
    allowedOrigin,
  );
  assertEquals(
    response.headers.get("Access-Control-Allow-Methods"),
    "POST, OPTIONS",
  );
  assertEquals(response.headers.get("Vary"), "Origin");
});

Deno.test("RAWG assets handler answers disallowed CORS preflight without origin", async () => {
  const response = await handleRawgAssets(
    new Request(endpoint, {
      headers: { Origin: "https://evil.example" },
      method: "OPTIONS",
    }),
    deps(),
  );

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), null);
  assertEquals(response.headers.get("Vary"), "Origin");
});

Deno.test("RAWG assets handler applies method guard before auth", async () => {
  let authCalls = 0;
  const response = await handleRawgAssets(
    new Request(endpoint, { method: "GET" }),
    deps({
      requireAuthenticatedUser: async () => {
        authCalls += 1;
        return { user: { id: "user-1" } };
      },
    }),
  );

  assertEquals(response.status, 405);
  assertEquals(await response.json(), { error: "Method not allowed." });
  assertEquals(authCalls, 0);
});

Deno.test("RAWG assets handler requires auth before body env and fetch work", async () => {
  let keyReads = 0;
  let fetchCalls = 0;
  const response = await handleRawgAssets(
    new Request(endpoint, {
      body: "{",
      method: "POST",
    }),
    deps({
      fetchJson: async () => {
        fetchCalls += 1;
        return null;
      },
      getRawgApiKey: () => {
        keyReads += 1;
        return "rawg-key";
      },
      requireAuthenticatedUser: async () => ({
        error: "Sign in required.",
        status: 401,
      }),
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(await response.json(), { error: "Sign in required." });
  assertEquals(keyReads, 0);
  assertEquals(fetchCalls, 0);
});

Deno.test("RAWG assets handler reports missing RAWG_API_KEY after auth", async () => {
  const response = await handleRawgAssets(
    jsonRequest({ title: "Celeste" }),
    deps({ getRawgApiKey: () => " " }),
  );

  assertEquals(response.status, 500);
  assertEquals(await response.json(), {
    error: "RAWG_API_KEY is not configured.",
  });
});

Deno.test("RAWG assets handler rejects invalid and missing titles", async () => {
  const missing = await handleRawgAssets(jsonRequest({}), deps());
  const invalid = await handleRawgAssets(jsonRequest({ title: "   " }), deps());

  assertEquals(missing.status, 400);
  assertEquals(await missing.json(), { error: "Missing title." });
  assertEquals(invalid.status, 400);
  assertEquals(await invalid.json(), { error: "Missing title." });
});

Deno.test("RAWG assets handler falls back from precise search to broader search", async () => {
  const urls: string[] = [];
  const response = await handleRawgAssets(
    jsonRequest({ title: "Portal 2" }),
    deps({
      fetchJson: async (url) => {
        urls.push(url.toString());
        if (
          url.pathname === "/api/games" &&
          url.searchParams.get("search_precise") === "true"
        ) {
          return { results: [] };
        }

        if (url.pathname === "/api/games") {
          return {
            results: [{
              background_image: null,
              id: 4200,
            }],
          };
        }

        if (url.pathname === "/api/games/4200") {
          return {
            background_image: "https://media.rawg.io/media/games/portal2.jpg",
          };
        }

        return {
          results: [{
            image: "https://media.rawg.io/media/screenshots/portal2.jpg",
          }],
        };
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(
    urls.map((url) => new URL(url).searchParams.get("search_precise")),
    ["true", "false", null, null],
  );
  const body = await response.json();
  assertEquals(body.coverUrl, "https://media.rawg.io/media/games/portal2.jpg");
  assertEquals(
    body.iconUrl,
    "https://media.rawg.io/media/screenshots/portal2.jpg",
  );
});

Deno.test("RAWG assets handler returns 404 when no usable assets exist", async () => {
  const response = await handleRawgAssets(
    jsonRequest({ title: "Text Adventure" }),
    deps({
      fetchJson: async (url) => {
        if (url.pathname === "/api/games") {
          return { results: [{ id: 7 }] };
        }

        if (url.pathname === "/api/games/7/screenshots") {
          return { results: [] };
        }

        return {};
      },
    }),
  );

  assertEquals(response.status, 404);
  assertEquals(await response.json(), { error: "No RAWG assets found." });
});

Deno.test("RAWG assets handler success includes provider policy evidence", async () => {
  const response = await handleRawgAssets(
    jsonRequest({ title: "Half-Life" }),
    deps({
      fetchJson: async (url) => {
        if (url.pathname === "/api/games") {
          return {
            results: [{
              background_image: "https://media.rawg.io/media/games/hl.jpg",
              id: 3498,
            }],
          };
        }

        if (url.pathname === "/api/games/3498") {
          return {
            background_image: "https://media.rawg.io/media/games/hl-detail.jpg",
          };
        }

        return {
          results: [{
            image: "https://media.rawg.io/media/screenshots/hl.jpg",
          }],
        };
      },
    }),
  );

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body, {
    coverUrl: "https://media.rawg.io/media/games/hl-detail.jpg",
    fetchedAt: 1781519400,
    iconUrl: "https://media.rawg.io/media/screenshots/hl.jpg",
    logoUrl: null,
    providerPolicy: {
      assets: [
        {
          host: "media.rawg.io",
          kind: "cover",
          reason: "RAWG media asset is tied to a RAWG game API result.",
          url: "https://media.rawg.io/media/games/hl-detail.jpg",
          verdict: "approved",
        },
        {
          host: "media.rawg.io",
          kind: "icon",
          reason: "RAWG media asset is tied to a RAWG game API result.",
          url: "https://media.rawg.io/media/screenshots/hl.jpg",
          verdict: "approved",
        },
      ],
      policyVersion: "2026-06-12",
      provider: "rawg",
      reason: "RAWG artwork is backed by RAWG game 3498 and RAWG media URLs.",
      sourceId: "3498",
      verdict: "approved",
    },
  });
});

function jsonRequest(body: unknown): Request {
  return new Request(endpoint, {
    body: JSON.stringify(body),
    headers: {
      Authorization: "Bearer user-token",
      "Content-Type": "application/json",
      Origin: allowedOrigin,
    },
    method: "POST",
  });
}

function deps(
  overrides: Partial<RawgAssetsHandlerDeps> = {},
): RawgAssetsHandlerDeps {
  return {
    fetchJson: async () => ({ results: [] }),
    getAllowedOrigins: () => [allowedOrigin],
    getRawgApiKey: () => "rawg-key",
    now: () => new Date(fetchedAt),
    requireAuthenticatedUser: async () => ({ user: { id: "user-1" } }),
    ...overrides,
  };
}
