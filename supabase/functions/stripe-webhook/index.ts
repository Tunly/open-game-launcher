import { stripe } from "../_shared/stripe.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { requireEnv } from "../_shared/env.ts";
import {
  issueStoreLicenses,
  syncStoreInvoiceFromStripeInvoice,
  syncStoreRefundFromStripeRefund,
  syncStripeInvoiceForOrder,
} from "../_shared/store.ts";
import { createStripeWebhookAdapters } from "./adapters.ts";
import { handleStripeWebhook } from "./handler.ts";

const adapters = createStripeWebhookAdapters({
  issueStoreLicenses,
  supabaseAdmin,
  syncStoreInvoiceFromStripeInvoice,
  syncStoreRefundFromStripeRefund,
  syncStripeInvoiceForOrder,
});

Deno.serve((req) =>
  handleStripeWebhook(req, {
    ...adapters,
    constructEvent: (body, signature, secret) =>
      stripe.webhooks.constructEvent(body, signature, secret),
    isSignatureVerificationError: (error) =>
      error instanceof stripe.errors.StripeSignatureVerificationError,
    logError: (...args) => console.error(...args),
    logUnhandledEvent: (eventType) =>
      console.log(`Unhandled event type: ${eventType}`),
    requireWebhookSecret: () => requireEnv("STRIPE_WEBHOOK_SECRET"),
  })
);
