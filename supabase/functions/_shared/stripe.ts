// deno-lint-ignore-file no-import-prefix
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { requireEnv } from "./env.ts";

export const STRIPE_API_VERSION = "2026-05-27.dahlia";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  stripeClient ??= new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
    httpClient: Stripe.createFetchHttpClient(),
    apiVersion: STRIPE_API_VERSION,
  });
  return stripeClient;
}

// Keep existing adapters injectable while delaying secret validation until an
// authenticated Stripe operation is actually attempted. CORS preflights and
// missing-signature webhook requests must not cold-start with a 500 merely
// because an external Stripe credential has not been configured yet.
export const stripe = new Proxy({} as Stripe, {
  get(_target, property) {
    const client = getStripeClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
  set(_target, property, value) {
    return Reflect.set(getStripeClient(), property, value);
  },
});
