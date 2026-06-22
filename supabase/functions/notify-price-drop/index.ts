// deno-lint-ignore-file no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireEnv } from "../_shared/env.ts";
import { createNotifyPriceDropAdapters } from "./adapters.ts";
import { handleNotifyPriceDrop } from "./handler.ts";

/*
 * Env contract:
 * - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * - PRICE_DROP_NOTIFY_SECRET: bearer or x-price-drop-secret for cron/manual runs
 */

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const adapters = createNotifyPriceDropAdapters({
  getNotifySecret: () => requireEnv("PRICE_DROP_NOTIFY_SECRET"),
  supabaseAdmin: adminClient,
});

Deno.serve((request) =>
  handleNotifyPriceDrop(request, {
    ...adapters,
  })
);
