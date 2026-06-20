import { requireEnv } from "../_shared/env.ts";
import { createRemoteCompanionRelayAdapters } from "./adapters.ts";
import { handleRemoteCompanionRelay } from "./handler.ts";

/*
 * Env contract:
 * - SUPABASE_URL, SUPABASE_ANON_KEY
 *
 * The function is caller-authenticated and delegates authority to the
 * SECURITY DEFINER RPCs from 20260611110000_remote_companion_contract.sql.
 * Device secrets and pairing codes may pass through a one-time response, but
 * raw package URLs and signed URLs are rejected before job enqueue.
 */

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const adapters = createRemoteCompanionRelayAdapters({
  supabaseAnonKey: SUPABASE_ANON_KEY,
  supabaseUrl: SUPABASE_URL,
});

Deno.serve((request) => handleRemoteCompanionRelay(request, adapters));
