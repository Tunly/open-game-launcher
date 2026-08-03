import { createClient } from "@supabase/supabase-js";
import type { UserResponse } from "@supabase/supabase-js";
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

type AuthUserRequest = {
  generation: number;
  promise: Promise<UserResponse>;
};

let authGeneration = 0;
let authUserRequest: AuthUserRequest | null = null;

export function clearSupabaseAuthCache() {
  authGeneration += 1;
  authUserRequest = null;
}

async function getCurrentAuthUserResponse(
  requestUser: (jwt?: string) => Promise<UserResponse>,
): Promise<UserResponse> {
  while (true) {
    const generation = authGeneration;
    let request = authUserRequest;
    if (!request || request.generation !== generation) {
      request = {
        generation,
        promise: requestUser(),
      };
      authUserRequest = request;
    }

    try {
      const response = await request.promise;
      if (generation === authGeneration) {
        return response;
      }
    } catch (error) {
      if (generation === authGeneration) {
        throw error;
      }
    } finally {
      if (authUserRequest === request) {
        authUserRequest = null;
      }
    }
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
  const { data, error } = await getCurrentAuthUserResponse(client.auth.getUser.bind(client.auth));
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
