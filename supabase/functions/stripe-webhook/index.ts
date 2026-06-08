import { stripe } from "../_shared/stripe.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { requireEnv } from "../_shared/env.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const signature = req.headers.get("Stripe-Signature");
    if (!signature) {
      return new Response(
        JSON.stringify({ error: "Missing Stripe-Signature header" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.text();
    const secret = requireEnv("STRIPE_WEBHOOK_SECRET");

    const event = stripe.webhooks.constructEvent(body, signature, secret);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.client_reference_id
          ?? (session.metadata as Record<string, string> | undefined)?.user_id;
        if (!userId) {
          console.error(
            "checkout.session.completed missing user id in client_reference_id or metadata",
          );
          break;
        }

        // TODO(D-2): The `orders` table schema is not yet defined. When
        // the Stripe integration goes live, replace this generic upsert
        // with the actual table + columns. For now the handler ACKs the
        // event and logs the user/session pair so the integration can be
        // verified end-to-end before the schema exists.
        const { error } = await supabaseAdmin
          .from("orders")
          .upsert(
            {
              user_id: userId,
              stripe_session_id: session.id,
              status: "completed",
            },
            { onConflict: "user_id, stripe_session_id" },
          );
        if (error) {
          console.error("Failed to update order:", error);
        } else {
          console.log(`Order completed for user ${userId}`);
        }
        break;
      }
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    if (err instanceof stripe.errors.StripeSignatureVerificationError) {
      console.error("Stripe signature verification failed:", err);
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
