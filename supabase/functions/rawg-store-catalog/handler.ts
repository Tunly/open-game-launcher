export type RawgStoreCatalogResponse = {
  count: number;
  next: string | null;
  results: unknown[];
};

export interface RawgStoreCatalogHandlerDeps {
  fetchJson?: (url: URL) => Promise<unknown>;
  getAllowedOrigins?: () => string[];
  getRawgApiKey: () => string;
}

export const rawgStoreCatalogCorsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export async function handleRawgStoreCatalog(
  request: Request,
  deps: RawgStoreCatalogHandlerDeps,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: withCors(request, deps, rawgStoreCatalogCorsHeaders),
    });
  }

  if (request.method !== "GET" && request.method !== "POST") {
    return jsonResponse(request, deps, { error: "Method not allowed." }, 405);
  }

  const apiKey = deps.getRawgApiKey().trim();
  if (!apiKey) {
    return jsonResponse(
      request,
      deps,
      { error: "RAWG_API_KEY is not configured." },
      500,
    );
  }

  const input = await readInput(request);
  const page = clampInteger(input.page, 1, 1000, 1);
  const pageSize = clampInteger(input.pageSize, 1, 40, 40);
  const url = new URL("https://api.rawg.io/api/games");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("ordering", "-added");
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(pageSize));

  const result = await deps.fetchJson?.(url);
  if (!result || typeof result !== "object") {
    return jsonResponse(
      request,
      deps,
      { error: "RAWG catalog request failed." },
      502,
    );
  }

  const record = result as Record<string, unknown>;
  return jsonResponse(request, deps, {
    count: typeof record.count === "number" ? record.count : 0,
    next: typeof record.next === "string" ? record.next : null,
    results: Array.isArray(record.results) ? record.results : [],
  });
}

async function readInput(request: Request) {
  if (request.method === "GET") {
    const url = new URL(request.url);
    return {
      page: url.searchParams.get("page"),
      pageSize: url.searchParams.get("pageSize"),
    };
  }

  const body = await request.json().catch(() => null);
  return body && typeof body === "object"
    ? (body as Record<string, unknown>)
    : {};
}

function clampInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(number)));
}

function jsonResponse(
  request: Request,
  deps: RawgStoreCatalogHandlerDeps,
  body: unknown,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: withCors(request, deps, {
      ...rawgStoreCatalogCorsHeaders,
      "Content-Type": "application/json",
    }),
  });
}

function withCors(
  request: Request,
  deps: Pick<RawgStoreCatalogHandlerDeps, "getAllowedOrigins">,
  headers: Record<string, string>,
) {
  const origin = request.headers.get("Origin")?.trim();
  const allowedOrigins = deps.getAllowedOrigins?.() ?? [];
  const allowedOrigin =
    origin &&
    (allowedOrigins.length === 0
      ? origin.startsWith("http://127.0.0.1:") ||
        origin.startsWith("http://localhost:")
      : allowedOrigins.includes(origin))
      ? origin
      : null;

  return {
    ...headers,
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    Vary: "Origin",
  };
}
