type RawgAssetResponse = {
  coverUrl: string | null;
  logoUrl: null;
  iconUrl: string | null;
  fetchedAt: number;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const apiKey = Deno.env.get("RAWG_API_KEY")?.trim();
  if (!apiKey) {
    return jsonResponse({ error: "RAWG_API_KEY is not configured." }, 500);
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return jsonResponse({ error: "Missing title." }, 400);
  }

  const assets = await fetchRawgAssets(apiKey, title);
  if (!assets.coverUrl && !assets.iconUrl) {
    return jsonResponse({ error: "No RAWG assets found." }, 404);
  }

  return jsonResponse(assets);
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
