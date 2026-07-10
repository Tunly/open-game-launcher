// deno-lint-ignore-file no-import-prefix
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { STRIPE_API_VERSION } from "../_shared/stripe.ts";

Deno.test("Stripe webhook signatures verify with the Deno async crypto provider", async () => {
  const client = new Stripe("sk_test_og_launcher_contract", {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });
  const payload = JSON.stringify({
    data: { object: {} },
    id: "evt_async_contract",
    type: "checkout.session.completed",
  });
  const secret = "whsec_og_launcher_contract";
  const timestamp = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${payload}`),
  );
  const signatureHex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const signature = `t=${timestamp},v1=${signatureHex}`;

  const event = await client.webhooks.constructEventAsync(payload, signature, secret);

  if (event.id !== "evt_async_contract") {
    throw new Error(`Unexpected Stripe event id: ${event.id}`);
  }
});
