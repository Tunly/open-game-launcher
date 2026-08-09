import type { SyncStoreCatalogDeps } from "./handler.ts";

type EnvReader = { get: (key: string) => string | undefined };
type FetchJson = (input: URL, init?: RequestInit) => Promise<Response>;

export type SyncStoreCatalogAdapterDeps = {
  env?: EnvReader;
  fetch?: FetchJson;
};

export type SyncStoreCatalogAdapters = SyncStoreCatalogDeps;

export function createSyncStoreCatalogAdapters(
  deps: SyncStoreCatalogAdapterDeps = {},
): SyncStoreCatalogAdapters {
  const env = deps.env ?? Deno.env;
  const fetchJson = deps.fetch ?? fetch;

  return {
    fetchJson: (url, init) => fetchJsonSafe(fetchJson, url, init),
    getIgdbClientId: () => env.get("IGDB_CLIENT_ID")?.trim() ?? "",
    getIgdbClientSecret: () => env.get("IGDB_CLIENT_SECRET")?.trim() ?? "",
    getItadApiKey: () => env.get("ITAD_API_KEY")?.trim() ?? "",
    getSupabaseUrl: () => env.get("SUPABASE_URL")?.trim() ?? "",
    getSupabaseServiceRoleKey: () =>
      env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "",
  };
}

async function fetchJsonSafe(fetchJson: FetchJson, url: URL, init?: RequestInit) {
  const response = await fetchJson(url, {
    ...init,
    headers: {
      "User-Agent": "OG-Launcher/0.1",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}
