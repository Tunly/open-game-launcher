export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined;

export const supabaseConfigError =
  !supabaseUrl || !supabaseAnonKey
    ? "Missing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Do not use a service_role key in the client."
    : null;

export const isSupabaseConfigured = !supabaseConfigError;
