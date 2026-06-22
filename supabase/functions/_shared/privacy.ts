// deno-lint-ignore-file no-import-prefix
import {
  createClient,
  type SupabaseClient,
  type User,
} from "https://esm.sh/@supabase/supabase-js@2.49.4";

import { requireEnv } from "./env.ts";

export const privacyCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-account-deletion-secret, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export type AuthenticatedRequest = {
  adminClient: SupabaseClient;
  token: string;
  user: User;
};

export type PrivacyClientFactory = (
  supabaseUrl: string,
  supabaseKey: string,
  options: {
    auth: { autoRefreshToken: false; persistSession: false };
    global?: { headers: { Authorization: string } };
  },
) => SupabaseClient;

export type PrivacyRuntimeDeps = {
  createClient?: PrivacyClientFactory;
  getEnv?: (name: string) => string | undefined;
};

export type PrivacyRuntime = {
  adminClient: SupabaseClient;
  requireAuthenticatedRequest: (
    request: Request,
  ) => Promise<AuthenticatedRequest | Response>;
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...privacyCorsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export function handleOptions(request: Request) {
  if (request.method !== "OPTIONS") {
    return null;
  }

  return new Response("ok", { headers: privacyCorsHeaders });
}

export function createPrivacyRuntime(
  deps: PrivacyRuntimeDeps = {},
): PrivacyRuntime {
  const clientFactory = deps.createClient ??
    (createClient as PrivacyClientFactory);
  const supabaseUrl = requirePrivacyEnv("SUPABASE_URL", deps.getEnv);
  const supabaseAnonKey = requirePrivacyEnv("SUPABASE_ANON_KEY", deps.getEnv);
  const supabaseServiceRoleKey = requirePrivacyEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    deps.getEnv,
  );
  const adminClient = clientFactory(
    supabaseUrl,
    supabaseServiceRoleKey,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );

  return {
    adminClient,
    requireAuthenticatedRequest: (request) =>
      authenticateRequest(request, {
        adminClient,
        clientFactory,
        supabaseAnonKey,
        supabaseUrl,
      }),
  };
}

const defaultPrivacyRuntime = createPrivacyRuntime();

export const privacyAdminClient = defaultPrivacyRuntime.adminClient;

export function requireAuthenticatedRequest(
  request: Request,
): Promise<AuthenticatedRequest | Response> {
  return defaultPrivacyRuntime.requireAuthenticatedRequest(request);
}

async function authenticateRequest(
  request: Request,
  deps: {
    adminClient: SupabaseClient;
    clientFactory: PrivacyClientFactory;
    supabaseAnonKey: string;
    supabaseUrl: string;
  },
): Promise<AuthenticatedRequest | Response> {
  const authHeader = request.headers.get("Authorization")?.trim();
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Missing Authorization bearer token." }, 401);
  }

  const token = authHeader.slice(7).trim();
  if (!token || token === deps.supabaseAnonKey) {
    return jsonResponse({ error: "Sign in required." }, 401);
  }

  const callerClient = deps.clientFactory(
    deps.supabaseUrl,
    deps.supabaseAnonKey,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data.user) {
    return jsonResponse({ error: "Invalid or expired session." }, 401);
  }

  return {
    adminClient: deps.adminClient,
    token,
    user: data.user,
  };
}

function requirePrivacyEnv(
  name: string,
  getEnv: PrivacyRuntimeDeps["getEnv"],
): string {
  if (!getEnv) {
    return requireEnv(name);
  }

  const value = getEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function methodNotAllowed() {
  return jsonResponse({ error: "Method not allowed." }, 405);
}
