import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { IgdbAssetsAuthResult, IgdbAssetsHandlerDeps } from "./handler.ts";

type Env = { get: (key: string) => string | undefined };
type AuthClient = { auth: { getUser: (token: string) => Promise<{ data?: { user?: unknown | null } | null; error?: unknown }> } };
type Factory = (url: string, key: string, options: { auth: { persistSession: false; autoRefreshToken: false } }) => AuthClient;
type Fetcher = (url: URL, init?: RequestInit) => Promise<Response>;

export type IgdbAssetsAdapterDeps = { createClient?: Factory; env?: Env; fetch?: Fetcher };
export type IgdbAssetsAdapters = Omit<IgdbAssetsHandlerDeps, "now">;

export function createIgdbAssetsAdapters(deps: IgdbAssetsAdapterDeps = {}): IgdbAssetsAdapters {
  const env = deps.env ?? Deno.env;
  const createClient = deps.createClient ?? createSupabaseClient;
  const fetcher = deps.fetch ?? fetch;
  const supabaseUrl = readEnv(env, "SUPABASE_URL");
  const anonKey = readEnv(env, "SUPABASE_ANON_KEY");
  return {
    fetchJson: (url, init) => fetchJson(fetcher, url, init),
    getAllowedOrigins: () => readEnv(env, "IGDB_ASSETS_ALLOWED_ORIGINS").split(",").map((value) => value.trim()).filter(Boolean),
    getIgdbClientId: () => readEnv(env, "IGDB_CLIENT_ID"),
    getIgdbClientSecret: () => readEnv(env, "IGDB_CLIENT_SECRET"),
    requireAuthenticatedUser: (request) => requireUser({ createClient, supabaseUrl, anonKey }, request),
  };
}
function readEnv(env: Env, key: string) { return env.get(key)?.trim() ?? ""; }
async function fetchJson(fetcher: Fetcher, url: URL, init?: RequestInit) { const response = await fetcher(url, init); return response.ok ? response.json().catch(() => null) : null; }
async function requireUser(deps: { createClient: Factory; supabaseUrl: string; anonKey: string }, request: Request): Promise<IgdbAssetsAuthResult> {
  const header = request.headers.get("Authorization")?.trim();
  const token = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!deps.supabaseUrl || !deps.anonKey) return { error: "Supabase auth is not configured.", status: 500 };
  if (!token || token === deps.anonKey) return { error: "Sign in required.", status: 401 };
  const client = deps.createClient(deps.supabaseUrl, deps.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  return error || !data?.user ? { error: "Invalid or expired session.", status: 401 } : { user: data.user };
}
