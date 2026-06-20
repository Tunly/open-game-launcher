import {
  buildRawgAssetProviderPolicyEvidence,
  type RawgAssetProviderPolicyEvidence,
} from "./provider-policy.ts";

export type RawgAssetResponse = {
  coverUrl: string | null;
  iconUrl: string | null;
  fetchedAt: number;
  logoUrl: null;
  providerPolicy: RawgAssetProviderPolicyEvidence;
};

export type RawgAssetsAuthResult =
  | { user: unknown }
  | { error: string; status: number };

export interface RawgAssetsHandlerDeps {
  fetchJson?: (url: URL) => Promise<unknown>;
  getAllowedOrigins?: () => string[];
  getRawgApiKey: () => string;
  now?: () => Date;
  requireAuthenticatedUser: (request: Request) => Promise<RawgAssetsAuthResult>;
}

export const rawgAssetsCorsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export async function handleRawgAssets(
  request: Request,
  deps: RawgAssetsHandlerDeps,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: withRawgAssetsCors(request, deps, rawgAssetsCorsHeaders),
    });
  }

  if (request.method !== "POST") {
    return rawgAssetsJsonResponse(
      request,
      deps,
      { error: "Method not allowed." },
      405,
    );
  }

  const authResult = await deps.requireAuthenticatedUser(request);
  if ("error" in authResult) {
    return rawgAssetsJsonResponse(
      request,
      deps,
      { error: authResult.error },
      authResult.status,
    );
  }

  const apiKey = deps.getRawgApiKey().trim();
  if (!apiKey) {
    return rawgAssetsJsonResponse(
      request,
      deps,
      { error: "RAWG_API_KEY is not configured." },
      500,
    );
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return rawgAssetsJsonResponse(
      request,
      deps,
      { error: "Missing title." },
      400,
    );
  }

  const assets = await fetchRawgAssets(apiKey, title, deps);
  if (!assets.coverUrl && !assets.iconUrl) {
    return rawgAssetsJsonResponse(
      request,
      deps,
      { error: "No RAWG assets found." },
      404,
    );
  }

  return rawgAssetsJsonResponse(request, deps, assets);
}

export async function fetchRawgAssets(
  apiKey: string,
  title: string,
  deps: Pick<RawgAssetsHandlerDeps, "fetchJson" | "now"> = {},
): Promise<RawgAssetResponse> {
  return (
    (await fetchRawgAssetsSearch(apiKey, title, true, deps)) ??
      (await fetchRawgAssetsSearch(apiKey, title, false, deps)) ?? {
      coverUrl: null,
      fetchedAt: getFetchedAt(deps),
      iconUrl: null,
      logoUrl: null,
      providerPolicy: buildRawgAssetProviderPolicyEvidence({
        coverUrl: null,
        gameId: null,
        iconUrl: null,
      }),
    }
  );
}

async function fetchRawgAssetsSearch(
  apiKey: string,
  title: string,
  precise: boolean,
  deps: Pick<RawgAssetsHandlerDeps, "fetchJson" | "now">,
): Promise<RawgAssetResponse | null> {
  const searchUrl = new URL("https://api.rawg.io/api/games");
  searchUrl.searchParams.set("key", apiKey);
  searchUrl.searchParams.set("search", title);
  searchUrl.searchParams.set("search_precise", String(precise));
  searchUrl.searchParams.set("page_size", "1");

  const searchJson = await rawgGetJson(searchUrl, deps);
  const result = Array.isArray(searchJson?.results)
    ? searchJson.results[0]
    : null;
  if (!result) {
    return null;
  }
  const gameId = typeof result?.id === "number" ? result.id : null;

  let coverUrl = readString(result, "background_image");
  let iconUrl = coverUrl;

  if (gameId) {
    const detailUrl = new URL(`https://api.rawg.io/api/games/${gameId}`);
    detailUrl.searchParams.set("key", apiKey);
    const detailJson = await rawgGetJson(detailUrl, deps);
    coverUrl = readString(detailJson, "background_image") ?? coverUrl;

    const screenshotsUrl = new URL(
      `https://api.rawg.io/api/games/${gameId}/screenshots`,
    );
    screenshotsUrl.searchParams.set("key", apiKey);
    screenshotsUrl.searchParams.set("page_size", "1");
    const screenshotsJson = await rawgGetJson(screenshotsUrl, deps);
    const screenshot = Array.isArray(screenshotsJson?.results)
      ? screenshotsJson.results[0]
      : null;
    iconUrl = readString(screenshot, "image") ?? iconUrl;
  }

  return {
    coverUrl,
    fetchedAt: getFetchedAt(deps),
    iconUrl,
    logoUrl: null,
    providerPolicy: buildRawgAssetProviderPolicyEvidence({
      coverUrl,
      gameId,
      iconUrl,
    }),
  };
}

async function rawgGetJson(
  url: URL,
  deps: Pick<RawgAssetsHandlerDeps, "fetchJson">,
) {
  if (deps.fetchJson) {
    return deps.fetchJson(url);
  }

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

function rawgAssetsJsonResponse(
  request: Request,
  deps: RawgAssetsHandlerDeps,
  body: unknown,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: withRawgAssetsCors(request, deps, {
      ...rawgAssetsCorsHeaders,
      "Content-Type": "application/json",
    }),
  });
}

function withRawgAssetsCors(
  request: Request,
  deps: Pick<RawgAssetsHandlerDeps, "getAllowedOrigins">,
  headers: Record<string, string> = {},
) {
  const allowedOrigin = getAllowedOrigin(request, deps);
  return {
    ...headers,
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    Vary: "Origin",
  };
}

function getAllowedOrigin(
  request: Request,
  deps: Pick<RawgAssetsHandlerDeps, "getAllowedOrigins">,
) {
  const origin = request.headers.get("Origin")?.trim();
  if (!origin) {
    return null;
  }

  const allowedOrigins = deps.getAllowedOrigins?.() ?? [];
  if (allowedOrigins.length === 0) {
    return origin.startsWith("http://127.0.0.1:") ||
        origin.startsWith("http://localhost:")
      ? origin
      : null;
  }

  return allowedOrigins.includes(origin) ? origin : null;
}

function getFetchedAt(deps: Pick<RawgAssetsHandlerDeps, "now">) {
  return Math.floor((deps.now?.() ?? new Date()).getTime() / 1000);
}
