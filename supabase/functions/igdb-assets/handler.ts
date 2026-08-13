export type IgdbAssetResponse = {
  coverUrl: string | null;
  iconUrl: string | null;
  logoUrl: string | null;
  fetchedAt: number;
  providerPolicy: {
    provider: "igdb";
    verdict: "approved";
    sourceId: number | null;
  };
};

export type IgdbAssetsAuthResult = { user: unknown } | { error: string; status: number };

export interface IgdbAssetsHandlerDeps {
  fetchJson?: (url: URL, init?: RequestInit) => Promise<unknown>;
  getAllowedOrigins?: () => string[];
  getIgdbClientId: () => string;
  getIgdbClientSecret: () => string;
  now?: () => Date;
  requireAuthenticatedUser: (request: Request) => Promise<IgdbAssetsAuthResult>;
}

export const igdbAssetsCorsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export async function handleIgdbAssets(request: Request, deps: IgdbAssetsHandlerDeps): Promise<Response> {
  if (request.method === "OPTIONS") return new Response("ok", { headers: withCors(request, deps) });
  if (request.method !== "POST") return jsonResponse(request, deps, { error: "Method not allowed." }, 405);

  const auth = await deps.requireAuthenticatedUser(request);
  if ("error" in auth) return jsonResponse(request, deps, { error: auth.error }, auth.status);

  const clientId = deps.getIgdbClientId().trim();
  const clientSecret = deps.getIgdbClientSecret().trim();
  if (!clientId || !clientSecret) {
    return jsonResponse(request, deps, { error: "IGDB credentials are not configured." }, 500);
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) return jsonResponse(request, deps, { error: "Missing title." }, 400);

  const assets = await fetchIgdbAssets(clientId, clientSecret, title, deps);
  if (!assets.coverUrl && !assets.iconUrl && !assets.logoUrl) {
    return jsonResponse(request, deps, { error: "No IGDB assets found." }, 404);
  }
  return jsonResponse(request, deps, assets);
}

export async function fetchIgdbAssets(
  clientId: string,
  clientSecret: string,
  title: string,
  deps: Pick<IgdbAssetsHandlerDeps, "fetchJson" | "now"> = {},
): Promise<IgdbAssetResponse> {
  const fetchJson = deps.fetchJson ?? defaultFetchJson;
  const tokenResponse = await fetchJson(new URL("https://id.twitch.tv/oauth2/token"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }).toString(),
  });
  const accessToken = readString(tokenResponse, "access_token");
  if (!accessToken) return emptyResponse(deps);

  const query = `search ${JSON.stringify(title)}; fields id,name,cover.image_id,artworks.image_id,logos.image_id; limit 10;`;
  const result = await fetchJson(new URL("https://api.igdb.com/v4/games"), {
    method: "POST",
    headers: { "Client-ID": clientId, Authorization: `Bearer ${accessToken}`, "Content-Type": "text/plain" },
    body: query,
  });
  const candidates = Array.isArray(result) ? result.filter(isRecord) : [];
  const match = candidates
    .map((candidate) => ({ candidate, score: titleScore(title, readString(candidate, "name") ?? "") }))
    .sort((a, b) => b.score - a.score)[0];
  if (!match || match.score < 0.72) return emptyResponse(deps);

  const coverId = readNestedImageId(match.candidate, "cover") ?? readNestedImageId(match.candidate, "artworks");
  const logoId = readNestedImageId(match.candidate, "logos");
  const coverUrl = coverId ? igdbImage(coverId, "t_1080p") : null;
  const logoUrl = logoId ? igdbImage(logoId, "t_1080p") : null;
  return {
    coverUrl,
    iconUrl: coverUrl,
    logoUrl,
    fetchedAt: Math.floor((deps.now?.() ?? new Date()).getTime() / 1000),
    providerPolicy: { provider: "igdb", verdict: "approved", sourceId: readNumber(match.candidate, "id") },
  };
}

function igdbImage(imageId: string, size: string) {
  return `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg`;
}

function emptyResponse(deps: Pick<IgdbAssetsHandlerDeps, "now">): IgdbAssetResponse {
  return { coverUrl: null, iconUrl: null, logoUrl: null, fetchedAt: Math.floor((deps.now?.() ?? new Date()).getTime() / 1000), providerPolicy: { provider: "igdb", verdict: "approved", sourceId: null } };
}

function titleScore(left: string, right: string) {
  const a = normalize(left); const b = normalize(right);
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.86;
  const at = new Set(a.split(" ")); const bt = new Set(b.split(" "));
  const overlap = [...at].filter((token) => bt.has(token)).length;
  return overlap / Math.max(at.size, bt.size, 1);
}
function normalize(value: string) { return value.toLowerCase().replace(/[®™©]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object"; }
function readString(value: unknown, key: string) { const field = isRecord(value) ? value[key] : undefined; return typeof field === "string" && field.trim() ? field.trim() : null; }
function readNumber(value: unknown, key: string) { const field = isRecord(value) ? value[key] : undefined; return typeof field === "number" ? field : null; }
function readNestedImageId(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  const first = Array.isArray(field) ? field[0] : field;
  return isRecord(first) ? readString(first, "image_id") : null;
}
async function defaultFetchJson(url: URL, init?: RequestInit) { const response = await fetch(url, init); return response.ok ? response.json().catch(() => null) : null; }
function withCors(request: Request, deps: Pick<IgdbAssetsHandlerDeps, "getAllowedOrigins">) { const origin = request.headers.get("Origin"); const allowed = deps.getAllowedOrigins?.() ?? []; return { ...igdbAssetsCorsHeaders, ...(origin && (allowed.length === 0 || allowed.includes(origin)) ? { "Access-Control-Allow-Origin": origin } : {}), Vary: "Origin" }; }
function jsonResponse(request: Request, deps: Pick<IgdbAssetsHandlerDeps, "getAllowedOrigins">, body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...withCors(request, deps), "Content-Type": "application/json" } }); }
