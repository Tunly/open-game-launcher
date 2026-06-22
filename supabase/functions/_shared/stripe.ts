// deno-lint-ignore-file no-import-prefix
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { requireEnv } from "./env.ts";

const STRIPE_SECRET_KEY = requireEnv("STRIPE_SECRET_KEY");
export const STRIPE_API_VERSION = "2026-05-27.dahlia";

export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  httpClient: Stripe.createFetchHttpClient(),
  apiVersion: STRIPE_API_VERSION,
});
