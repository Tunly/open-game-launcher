import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireEnv } from "../_shared/env.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { createStoreDownloadBuildAdapters } from "./adapters.ts";
import { handleStoreDownloadBuild } from "./handler.ts";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const STORE_BUILDS_BUCKET = Deno.env.get("STORE_BUILDS_BUCKET") ??
  "store-builds";
const SIGNED_URL_TTL_SECONDS = 10 * 60;
const adapters = createStoreDownloadBuildAdapters({
  createClient,
  signedUrlTtlSeconds: SIGNED_URL_TTL_SECONDS,
  storeBuildsBucket: STORE_BUILDS_BUCKET,
  supabaseAdmin,
  supabaseAnonKey: SUPABASE_ANON_KEY,
  supabaseUrl: SUPABASE_URL,
});

Deno.serve((request) =>
  handleStoreDownloadBuild(request, {
    ...adapters,
  })
);
