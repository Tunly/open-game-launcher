// Follow this setup guide to integrate the Stripe SDK with Supabase Edge Functions:
// https://supabase.com/docs/guides/functions/examples/stripe-checkout

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { stripe } from "../_shared/stripe.ts";
import {
  createOrRetrieveCustomer,
  supabaseAdmin,
} from "../_shared/supabase-admin.ts";
import { requireEnv } from "../_shared/env.ts";
import { issueStoreLicenses } from "../_shared/store.ts";
import { createStripeCreateCheckoutAdapters } from "./adapters.ts";
import { handleStripeCreateCheckout } from "./handler.ts";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const CHECKOUT_URL_FALLBACK = requireEnv("OGL_CHECKOUT_URL_FALLBACK");
const CHECKOUT_ALLOWED_ORIGINS =
  (Deno.env.get("OGL_CHECKOUT_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
const adapters = createStripeCreateCheckoutAdapters({
  createClient,
  stripe,
  supabaseAdmin,
  supabaseAnonKey: SUPABASE_ANON_KEY,
  supabaseUrl: SUPABASE_URL,
});

Deno.serve((request) =>
  handleStripeCreateCheckout(request, {
    ...adapters,
    checkoutAllowedOrigins: CHECKOUT_ALLOWED_ORIGINS,
    checkoutUrlFallback: CHECKOUT_URL_FALLBACK,
    createOrRetrieveCustomer: (userId) => createOrRetrieveCustomer(userId, { stripe }),
    getLicenseSigningConfig: () => ({
      allowUnsignedFallback:
        Deno.env.get("OGL_LICENSE_ALLOW_UNSIGNED_FALLBACK") === "true",
      signingKey: Deno.env.get("OGL_LICENSE_SIGNING_KEY"),
    }),
    issueStoreLicenses,
  })
);
