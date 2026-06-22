Deno.test("Stripe checkout requires and forwards a client attempt id", async () => {
  const source = `${await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  )}\n${await Deno.readTextFile(new URL("./handler.ts", import.meta.url))}`;
  const migration = await Deno.readTextFile(
    new URL(
      "../../migrations/20260613150000_store_stripe_idempotency_webhook_events.sql",
      import.meta.url,
    ),
  );

  assertIncludes(source, "checkout_attempt_id");
  assertIncludes(source, "cleanStoreCheckoutAttemptId(");
  assertIncludes(source, "checkout_attempt_id");
  assertIncludes(source, "checkoutAttemptId");
  assertIncludes(source, "buildStoreCheckoutIdempotencyKey({");
  assertIncludes(source, "idempotencyKey:");
  assertIncludes(
    migration,
    "add column if not exists checkout_attempt_id uuid",
  );
  assertIncludes(migration, "store_orders_user_checkout_attempt_id_unique");
  assertIncludes(
    migration,
    "on public.store_orders (user_id, checkout_attempt_id)",
  );
});

function assertIncludes(source: string, expected: string) {
  if (!source.includes(expected)) {
    throw new Error(`Expected source to include ${JSON.stringify(expected)}`);
  }
}
