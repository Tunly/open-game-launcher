// deno-lint-ignore-file no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireEnv } from "../_shared/env.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { createCommunityArtworkModerationAdapters } from "./adapters.ts";
import { handleCommunityArtworkModeration } from "./handler.ts";

/*
 * Env contract:
 * - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *
 * Browser clients call this endpoint with a normal user session. The function
 * checks the private moderator allowlist, then performs service-role-only queue
 * and review RPC calls. Service-role keys never leave the function runtime.
 */

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");

const adapters = createCommunityArtworkModerationAdapters({
  createClient,
  supabaseAdmin,
  supabaseAnonKey: SUPABASE_ANON_KEY,
  supabaseUrl: SUPABASE_URL,
});

Deno.serve((request) => handleCommunityArtworkModeration(request, adapters));
