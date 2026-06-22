import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

import { requireEnv } from "../_shared/env.ts";
import { createPresencePollAdapters } from "./adapters.ts";
import { handlePresencePoll } from "./handler.ts";
import { pollPlatformPresence } from "./provider-client.ts";

/*
 * Env contract:
 * - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * - PRESENCE_POLL_SECRET: bearer token for cron/manual invocations
 * - STEAM_WEB_API_KEY: enables direct Steam presence polling
 * - <PLATFORM>_PRESENCE_ENDPOINT: optional POST bridge for EPIC/GOG/EA/XBOX/BATTLENET/UBISOFT
 * - PRESENCE_PROVIDER_TOKEN: optional bearer token sent to provider bridge endpoints
 * - PRESENCE_POLL_CADENCE_SECONDS: default 60, persisted in platform_accounts.metadata
 */

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const adapters = createPresencePollAdapters({
  cadenceMs: readPositiveInt("PRESENCE_POLL_CADENCE_SECONDS", 60) * 1000,
  maxBatchSize: readPositiveInt("PRESENCE_POLL_MAX_BATCH", 100),
  pollPlatformPresence,
  pollSecret: requireEnv("PRESENCE_POLL_SECRET"),
  supabaseAdmin: adminClient,
});

Deno.serve((request) =>
  handlePresencePoll(request, {
    ...adapters,
  })
);

function readPositiveInt(name: string, fallback: number) {
  const raw = Deno.env.get(name);
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
