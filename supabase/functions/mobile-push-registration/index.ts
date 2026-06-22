// deno-lint-ignore-file no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireEnv } from "../_shared/env.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { createMobilePushRegistrationAdapters } from "./adapters.ts";
import { handleMobilePushRegistrationRequest } from "./handler.ts";

/*
 * Env contract:
 * - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *
 * Browser/mobile clients call this endpoint with a normal user session. The
 * function validates consent and token-hash-only payloads, then performs
 * service-role-only registration mutations. Raw APNs/FCM device tokens are
 * rejected before storage, and this endpoint never sends push notifications.
 */

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const adapters = createMobilePushRegistrationAdapters({
  createClient,
  supabaseAdmin,
  supabaseAnonKey: SUPABASE_ANON_KEY,
  supabaseUrl: SUPABASE_URL,
});

Deno.serve((request) =>
  handleMobilePushRegistrationRequest(request, {
    ...adapters,
  })
);
