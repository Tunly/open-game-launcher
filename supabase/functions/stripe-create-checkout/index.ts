// Follow this setup guide to integrate the Stripe SDK with Supabase Edge Functions:
// https://supabase.com/docs/guides/functions/examples/stripe-checkout

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { stripe } from "../_shared/stripe.ts";
import { createOrRetrieveCustomer } from "../_shared/supabase-admin.ts";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate the caller: never trust user_id from the request body.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const userId = userData.user.id;

    const { line_items, success_url, cancel_url } = await req.json();

    if (!line_items || !Array.isArray(line_items) || line_items.length === 0) {
      return new Response(
        JSON.stringify({ error: "line_items is required and must be a non-empty array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get or create Stripe customer for the authenticated user
    const customer = await createOrRetrieveCustomer(userId);
    console.log(`Customer: ${customer}`);

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "paypal", "klarna", "ideal", "giropay"],
      mode: "payment",
      line_items,
      customer,
      // client_reference_id is the Stripe-blessed place for the caller's user id.
      // Metadata is still attached for legacy webhooks that read it, but new code
      // should read from client_reference_id.
      client_reference_id: userId,
      success_url: success_url || `${req.headers.get("origin")}/store/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${req.headers.get("origin")}/store/checkout/cancel`,
      metadata: {
        user_id: userId,
      },
      // Save payment details for future purchases
      payment_intent_data: {
        setup_future_usage: "off_session",
      },
    });

    return new Response(
      JSON.stringify({ id: session.id, url: session.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
