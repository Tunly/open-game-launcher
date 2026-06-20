import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import type { RawgAssetsAuthResult, RawgAssetsHandlerDeps } from "./handler.ts";

type EnvReader = {
  get: (key: string) => string | undefined;
};

type SupabaseAuthClient = {
  auth: {
    getUser: (token: string) => Promise<{
      data?: { user?: unknown | null } | null;
      error?: unknown;
    }>;
  };
};

type SupabaseClientFactory = (
  supabaseUrl: string,
  supabaseAnonKey: string,
  options: {
    auth: { persistSession: false; autoRefreshToken: false };
  },
) => SupabaseAuthClient;

type FetchJson = (input: URL, init?: RequestInit) => Promise<Response>;

export type RawgAssetsAdapterDeps = {
  createClient?: SupabaseClientFactory;
  env?: EnvReader;
  fetch?: FetchJson;
};

export type RawgAssetsAdapters = Omit<RawgAssetsHandlerDeps, "now">;

export function createRawgAssetsAdapters(
  deps: RawgAssetsAdapterDeps = {},
): RawgAssetsAdapters {
  const env = deps.env ?? Deno.env;
  const createClient = deps.createClient ?? createSupabaseClient;
  const fetchJson = deps.fetch ?? fetch;
  const supabaseUrl = readEnv(env, "SUPABASE_URL");
  const supabaseAnonKey = readEnv(env, "SUPABASE_ANON_KEY");

  return {
    fetchJson: (url) => rawgFetchJson(fetchJson, url),
    getAllowedOrigins: () =>
      (env.get("RAWG_ASSETS_ALLOWED_ORIGINS") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    getRawgApiKey: () => readEnv(env, "RAWG_API_KEY"),
    requireAuthenticatedUser: (request) =>
      requireAuthenticatedUser(
        {
          createClient,
          supabaseAnonKey,
          supabaseUrl,
        },
        request,
      ),
  };
}

function readEnv(env: EnvReader, key: string) {
  return env.get(key)?.trim() ?? "";
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("Authorization")?.trim();
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return token || null;
}

async function requireAuthenticatedUser(
  deps: {
    createClient: SupabaseClientFactory;
    supabaseAnonKey: string;
    supabaseUrl: string;
  },
  request: Request,
): Promise<RawgAssetsAuthResult> {
  if (!deps.supabaseUrl || !deps.supabaseAnonKey) {
    return {
      error: "Supabase auth is not configured.",
      status: 500,
    };
  }

  const token = getBearerToken(request);
  if (!token || token === deps.supabaseAnonKey) {
    return {
      error: "Sign in required.",
      status: 401,
    };
  }

  const client = deps.createClient(deps.supabaseUrl, deps.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    return {
      error: "Invalid or expired session.",
      status: 401,
    };
  }

  return { user: data.user };
}

async function rawgFetchJson(fetchJson: FetchJson, url: URL) {
  const response = await fetchJson(url, {
    headers: {
      "User-Agent": "OG-Launcher/0.1",
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json().catch(() => null);
}
