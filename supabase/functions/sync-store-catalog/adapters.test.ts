import { assertEquals } from "jsr:@std/assert";
import { createSyncStoreCatalogAdapters } from "./adapters.ts";

Deno.test("adapters read ITAD and Supabase env vars", () => {
  const values: Record<string, string> = {
    ITAD_API_KEY: "  itad-test-key  ",
    SUPABASE_URL: " https://test.supabase.co ",
    SUPABASE_SERVICE_ROLE_KEY: " service-role-key ",
  };
  const adapters = createSyncStoreCatalogAdapters({ env: { get: (key) => values[key] } });
  assertEquals(adapters.getItadApiKey(), "itad-test-key");
  assertEquals(adapters.getSupabaseUrl(), "https://test.supabase.co");
  assertEquals(adapters.getSupabaseServiceRoleKey(), "service-role-key");
});

Deno.test("adapters return empty strings when env vars are missing", () => {
  const adapters = createSyncStoreCatalogAdapters({ env: { get: () => undefined } });
  assertEquals(adapters.getItadApiKey(), "");
  assertEquals(adapters.getSupabaseUrl(), "");
  assertEquals(adapters.getSupabaseServiceRoleKey(), "");
});
