import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** Get or create a Stripe customer ID for the given Supabase user. */
export async function createOrRetrieveCustomer(userId: string): Promise<string> {
  // Check if user already has a stripe_customer_id in profile metadata
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("metadata")
    .eq("user_id", userId)
    .single();

  const existingCustomerId = profile?.metadata?.stripe_customer_id as string | undefined;
  if (existingCustomerId) return existingCustomerId;

  // Create new customer in Stripe
  const { default: Stripe } = await import("https://esm.sh/stripe@17.7.0?target=deno");
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    httpClient: Stripe.createFetchHttpClient(),
    apiVersion: "2025-03-31.basil",
  });

  const { data: user } = await supabaseAdmin.auth.admin.getUserById(userId);
  const customer = await stripe.customers.create({
    email: user?.user?.email,
    metadata: { user_id: userId },
  });

  // Store in profile metadata
  const currentMeta = profile?.metadata ?? {};
  await supabaseAdmin
    .from("profiles")
    .upsert({
      user_id: userId,
      metadata: { ...currentMeta, stripe_customer_id: customer.id },
    });

  return customer.id;
}
