// Follow this setup guide to integrate the Stripe SDK with Supabase Edge Functions:
// https://supabase.com/docs/guides/functions/examples/stripe-checkout

import { stripe } from "../_shared/stripe.ts";
import { createOrRetrieveCustomer } from "../_shared/supabase-admin.ts";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { line_items, user_id, success_url, cancel_url } = await req.json();

    if (!line_items || !Array.isArray(line_items) || line_items.length === 0) {
      return new Response(
        JSON.stringify({ error: "line_items is required and must be a non-empty array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get or create Stripe customer
    const customer = await createOrRetrieveCustomer(user_id);
    console.log(`Customer: ${customer}`);

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "paypal", "klarna", "ideal", "giropay"],
      mode: "payment",
      line_items,
      customer,
      success_url: success_url || `${req.headers.get("origin")}/store/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${req.headers.get("origin")}/store/checkout/cancel`,
      metadata: {
        user_id,
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
