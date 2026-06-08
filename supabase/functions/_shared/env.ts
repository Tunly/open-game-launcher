/**
 * Read a required environment variable. Throws if the variable is
 * unset or an empty string so misconfiguration is loud (500 at
 * function load time) rather than silent (empty-string fallback
 * that only blows up later with a confusing Stripe / Supabase
 * error).
 */
export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
