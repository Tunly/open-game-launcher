import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireEnv } from "../_shared/env.ts";
import { stripe } from "../_shared/stripe.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import {
  resolveStripePaymentIntentIdForOrder,
  syncStoreRefundFromStripeRefund,
  syncStripeInvoiceForOrder,
} from "../_shared/store.ts";
import { createStoreOrderSupportAdapters } from "./adapters.ts";
import { handleStoreOrderSupport } from "./handler.ts";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const adapters = createStoreOrderSupportAdapters({
  createClient,
  resolvePaymentIntentId: resolveStripePaymentIntentIdForOrder,
  stripe,
  supabaseAdmin,
  supabaseAnonKey: SUPABASE_ANON_KEY,
  supabaseUrl: SUPABASE_URL,
  syncInvoiceForOrder: syncStripeInvoiceForOrder,
  syncRefundFromStripeRefund: syncStoreRefundFromStripeRefund,
});

Deno.serve((request) =>
  handleStoreOrderSupport(request, {
    ...adapters,
  })
);
