import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type RawgAssetResponse = {
  coverUrl: string | null;
  logoUrl: null;
  iconUrl: string | null;
  fetchedAt: number;
};

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? "";

function getAllowedOrigin(request: Request) {
  const origin = request.headers.get("Origin")?.trim();
  if (!origin) {
    return null;
  }

  const allowedOrigins = (Deno.env.get("RAWG_ASSETS_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (allowedOrigins.length === 0) {
    return origin.startsWith("http://127.0.0.1:") || origin.startsWith("http://localhost:")
      ? origin
      : null;
  }

  return allowedOrigins.includes(origin) ? origin : null;
}

function withCors(request: Request, headers: Record<string, string> = {}) {
  const allowedOrigin = getAllowedOrigin(request);
  return {
    ...headers,
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    Vary: "Origin",
  };
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("Authorization")?.trim();
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return token || null;
}

async function requireAuthenticatedUser(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return { error: "Supabase auth is not configured.", status: 500 as const };
  }

  const token = getBearerToken(request);
  if (!token || token === supabaseAnonKey) {
    return { error: "Sign in required.", status: 401 as const };
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    return { error: "Invalid or expired session.", status: 401 as const };
  }

  return { user: data.user };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: withCors(request, corsHeaders) });
  }

  if (request.method !== "POST") {
    return jsonResponse(request, { error: "Method not allowed." }, 405);
  }

  const authResult = await requireAuthenticatedUser(request);
  if ("error" in authResult) {
    return jsonResponse(request, { error: authResult.error }, authResult.status);
  }

  const apiKey = Deno.env.get("RAWG_API_KEY")?.trim();
  if (!apiKey) {
    return jsonResponse(request, { error: "RAWG_API_KEY is not configured." }, 500);
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return jsonResponse(request, { error: "Missing title." }, 400);
  }

  const assets = await fetchRawgAssets(apiKey, title);
  if (!assets.coverUrl && !assets.iconUrl) {
    return jsonResponse(request, { error: "No RAWG assets found." }, 404);
  }

  return jsonResponse(request, assets);
});

async function fetchRawgAssets(apiKey: string, title: string): Promise<RawgAssetResponse> {
  const searchUrl = new URL("https://api.rawg.io/api/games");
  searchUrl.searchParams.set("key", apiKey);
  searchUrl.searchParams.set("search", title);
  searchUrl.searchParams.set("search_precise", "true");
  searchUrl.searchParams.set("page_size", "1");

  const searchJson = await rawgGetJson(searchUrl);
  const result = Array.isArray(searchJson?.results) ? searchJson.results[0] : null;
  const gameId = typeof result?.id === "number" ? result.id : null;

  let coverUrl = readString(result, "background_image");
  let iconUrl = coverUrl;

  if (gameId) {
    const detailUrl = new URL(`https://api.rawg.io/api/games/${gameId}`);
    detailUrl.searchParams.set("key", apiKey);
    const detailJson = await rawgGetJson(detailUrl);
    coverUrl = readString(detailJson, "background_image") ?? coverUrl;

    const screenshotsUrl = new URL(`https://api.rawg.io/api/games/${gameId}/screenshots`);
    screenshotsUrl.searchParams.set("key", apiKey);
    screenshotsUrl.searchParams.set("page_size", "1");
    const screenshotsJson = await rawgGetJson(screenshotsUrl);
    const screenshot = Array.isArray(screenshotsJson?.results) ? screenshotsJson.results[0] : null;
    iconUrl = readString(screenshot, "image") ?? iconUrl;
  }

  return {
    coverUrl,
    logoUrl: null,
    iconUrl,
    fetchedAt: Math.floor(Date.now() / 1000),
  };
}

async function rawgGetJson(url: URL) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "OG-Launcher/0.1",
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json().catch(() => null);
}

function readString(value: unknown, key: string) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.trim() ? field.trim() : null;
}

function jsonResponse(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: withCors(request, {
      ...corsHeaders,
      "Content-Type": "application/json",
    }),
  });
}
