// deno-lint-ignore-file no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireEnv } from "../_shared/env.ts";
import { createInviteHostedProofAdapters } from "./adapters.ts";
import { parseInviteHostedProofAllowedOrigins } from "./contract.ts";
import { handleInviteHostedProof } from "./handler.ts";

/*
 * Env contract:
 * - SUPABASE_URL, SUPABASE_ANON_KEY
 * - INVITE_HOSTED_PROOF_ALLOWED_ORIGINS: comma-separated HTTPS origins
 *
 * The function is caller-authenticated. It returns only sanitized consumed-token
 * evidence after `prove_share_token_replay_denial` confirms the caller can view
 * the invite and a second `redeem_share_token` attempt is rejected.
 */

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const ALLOWED_ORIGINS = parseInviteHostedProofAllowedOrigins(
  Deno.env.get("INVITE_HOSTED_PROOF_ALLOWED_ORIGINS"),
);
const adapters = createInviteHostedProofAdapters({
  allowedOrigins: ALLOWED_ORIGINS,
  createClient,
  supabaseAnonKey: SUPABASE_ANON_KEY,
  supabaseUrl: SUPABASE_URL,
});

Deno.serve((request) =>
  handleInviteHostedProof(request, {
    ...adapters,
  })
);
