import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { requireEnv } from "./env.ts";

const STRIPE_SECRET_KEY = requireEnv("STRIPE_SECRET_KEY");
export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  httpClient: Stripe.createFetchHttpClient(),
  apiVersion: "2025-03-31.basil",
});
