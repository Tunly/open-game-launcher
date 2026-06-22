// deno-lint-ignore-file no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireEnv } from "../_shared/env.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { createIngestPlaytimeAdapters } from "./adapters.ts";
import { handlePlaytimeIngestion } from "./handler.ts";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const adapters = createIngestPlaytimeAdapters({
  createClient,
  supabaseAdmin,
  supabaseAnonKey: SUPABASE_ANON_KEY,
  supabaseUrl: SUPABASE_URL,
});

Deno.serve((request) =>
  handlePlaytimeIngestion(request, {
    ...adapters,
  })
);
