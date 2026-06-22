/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_INVITE_FALLBACK_ORIGIN?: string;
  readonly VITE_OG_TRUSTED_INGESTION_STRICT?: string;
  readonly VITE_OG_REMOTE_HOSTED_RELAY_ENABLED?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
