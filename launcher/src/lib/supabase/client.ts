import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseAnonKey, supabaseConfigError, supabaseUrl } from "./config";

export { isSupabaseConfigured, supabaseConfigError } from "./config";

function createSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });
}

export const supabase = createSupabaseClient();

const authUserCacheTtlMs = 30_000;
let authUserCache: { expiresAt: number; user: User | null } | null = null;
let authUserRequest: Promise<User | null> | null = null;

function isFresh(expiresAt: number) {
  return expiresAt > Date.now();
}

export function clearSupabaseAuthCache() {
  authUserCache = null;
  authUserRequest = null;
}

export function getSupabaseClient() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? "Supabase is not configured.");
  }

  return supabase;
}

export async function getCurrentSupabaseUser() {
  if (authUserCache && isFresh(authUserCache.expiresAt)) {
    return authUserCache.user;
  }

  if (authUserRequest) {
    return authUserRequest;
  }

  const client = getSupabaseClient();
  authUserRequest = client.auth.getUser().then(({ data, error }) => {
    if (error) {
      throw new Error(error.message);
    }

    const user = data.user ?? null;
    authUserCache = { expiresAt: Date.now() + authUserCacheTtlMs, user };
    return user;
  });

  try {
    return await authUserRequest;
  } finally {
    authUserRequest = null;
  }
}

export async function requireCurrentSupabaseUser() {
  const user = await getCurrentSupabaseUser();
  if (!user) {
    throw new Error("You must be signed in.");
  }

  return user;
}

export async function getCurrentSessionUserId() {
  return (await getCurrentSupabaseUser())?.id ?? null;
}

export async function requireCurrentSessionUserId() {
  return (await requireCurrentSupabaseUser()).id;
}
