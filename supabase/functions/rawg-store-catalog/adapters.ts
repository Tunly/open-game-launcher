import type { RawgStoreCatalogHandlerDeps } from "./handler.ts";

type EnvReader = {
  get: (key: string) => string | undefined;
};

type FetchJson = (input: URL, init?: RequestInit) => Promise<Response>;

export type RawgStoreCatalogAdapterDeps = {
  env?: EnvReader;
  fetch?: FetchJson;
};

export type RawgStoreCatalogAdapters = Omit<RawgStoreCatalogHandlerDeps, "now">;

export function createRawgStoreCatalogAdapters(
  deps: RawgStoreCatalogAdapterDeps = {},
): RawgStoreCatalogAdapters {
  const env = deps.env ?? Deno.env;
  const fetchJson = deps.fetch ?? fetch;

  return {
    fetchJson: (url) => rawgFetchJson(fetchJson, url),
    getAllowedOrigins: () =>
      (env.get("RAWG_STORE_CATALOG_ALLOWED_ORIGINS") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    getRawgApiKey: () => env.get("RAWG_API_KEY")?.trim() ?? "",
  };
}

async function rawgFetchJson(fetchJson: FetchJson, url: URL) {
  const response = await fetchJson(url, {
    headers: { "User-Agent": "OG-Launcher/0.1" },
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}
