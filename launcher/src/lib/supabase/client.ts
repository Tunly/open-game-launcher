import { createClient } from "@supabase/supabase-js";
import type { User, UserResponse } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseAnonKey, supabaseConfigError, supabaseUrl } from "./config";

export { isSupabaseConfigured, supabaseConfigError } from "./config";

function createSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });

  const requestUser = client.auth.getUser.bind(client.auth);
  client.auth.getUser = ((jwt?: string) =>
    jwt ? requestUser(jwt) : getCachedAuthUserResponse(requestUser)) as typeof client.auth.getUser;

  return client;
}

export const supabase = createSupabaseClient();

const authUserCacheTtlMs = 30 * 60_000;
let authUserCache: { expiresAt: number; user: User } | null = null;
let authUserRequest: Promise<UserResponse> | null = null;

function isFresh(expiresAt: number) {
  return expiresAt > Date.now();
}

export function clearSupabaseAuthCache() {
  authUserCache = null;
  authUserRequest = null;
}

async function getCachedAuthUserResponse(
  requestUser: (jwt?: string) => Promise<UserResponse>,
): Promise<UserResponse> {
  if (authUserCache && isFresh(authUserCache.expiresAt)) {
    return { data: { user: authUserCache.user }, error: null };
  }

  if (authUserRequest) {
    return authUserRequest;
  }

  authUserRequest = requestUser().then((response) => {
    if (!response.error) {
      authUserCache = {
        expiresAt: Date.now() + authUserCacheTtlMs,
        user: response.data.user,
      };
    }
    return response;
  });

  try {
    return await authUserRequest;
  } finally {
    authUserRequest = null;
  }
}

export function getSupabaseClient() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? "Supabase is not configured.");
  }

  return supabase;
}

export async function getCurrentSupabaseUser() {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error) {
    throw new Error(error.message);
  }

  return data.user ?? null;
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
