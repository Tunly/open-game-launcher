Deno.test("Stripe webhook verifies signatures before claiming event ids", async () => {
  const source = await Deno.readTextFile(
    new URL("./handler.ts", import.meta.url),
  );

  assertOrdered(source, [
    "const event = await deps.constructEvent(body, signature, secret);",
    "const claimedEvent = await deps.claimStoreStripeWebhookEvent(",
    "switch (event.type)",
    "deps.markStoreStripeWebhookEventProcessed(claimedEvent)",
  ]);
  assertIncludes(
    source,
    "return jsonResponse({ duplicate: true, received: true })",
  );
  assertIncludes(
    source,
    "deps.markStoreStripeWebhookEventFailed(claimedWebhookEvent, err)",
  );
});

Deno.test("Stripe webhook classifies signature failures without dereferencing the lazy client", async () => {
  const indexSource = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );

  assertIncludes(
    indexSource,
    "isSignatureVerificationError: isStripeSignatureVerificationError",
  );
  assertIncludes(indexSource, "stripe.webhooks.constructEventAsync(");
  if (indexSource.includes("stripe.errors")) {
    throw new Error(
      "Webhook error handling must not dereference stripe.errors",
    );
  }
});

Deno.test("Stripe webhook event ledger is service-role only and replay-safe", async () => {
  const migration = await Deno.readTextFile(
    new URL(
      "../../migrations/20260613150000_store_stripe_idempotency_webhook_events.sql",
      import.meta.url,
    ),
  );

  assertIncludes(
    migration,
    "create table if not exists public.store_stripe_webhook_events",
  );
  assertIncludes(migration, "id text primary key");
  assertIncludes(
    migration,
    "check (processing_status in ('processing', 'processed', 'failed'))",
  );
  assertIncludes(
    migration,
    "alter table public.store_stripe_webhook_events enable row level security",
  );
  assertIncludes(
    migration,
    "revoke all on public.store_stripe_webhook_events from anon, authenticated",
  );
  assertIncludes(
    migration,
    "grant all on public.store_stripe_webhook_events to service_role",
  );
});

Deno.test("Stripe webhook retry claim leases failed and stale processing events", async () => {
  const source = await Deno.readTextFile(
    new URL("./adapters.ts", import.meta.url),
  );

  assertIncludes(source, "WEBHOOK_EVENT_PROCESSING_STALE_MS");
  assertIncludes(source, "processing_status, updated_at");
  assertIncludes(source, "isRetryableStripeWebhookEvent");
  assertIncludes(source, 'processing_status: "processing"');
  assertIncludes(source, 'event?.processing_status === "failed"');
  assertIncludes(source, 'event?.processing_status === "processing"');
  assertIncludes(source, "Date.parse(event.updated_at)");
  assertIncludes(
    source,
    '.eq("processing_status", existing.processing_status)',
  );
  assertIncludes(
    source,
    'if (existing.processing_status === "processing")',
  );
  assertIncludes(source, '.lte("updated_at", staleBefore)');
  assertIncludes(source, '.select("updated_at")');
  assertIncludes(source, ".maybeSingle()");
  assertIncludes(source, "claimUpdatedAt: asRecord(retriedEvent).updated_at");
});

Deno.test("Stripe webhook finalizers are scoped to the claimed lease token", async () => {
  const source = await Deno.readTextFile(
    new URL("./handler.ts", import.meta.url),
  );
  const indexSource = await Deno.readTextFile(
    new URL("./adapters.ts", import.meta.url),
  );

  assertIncludes(source, "export interface ClaimedStripeWebhookEvent");
  assertIncludes(source, "claimUpdatedAt");
  assertIncludes(source, "claimedWebhookEvent = claimedEvent");
  assertIncludes(
    source,
    "deps.markStoreStripeWebhookEventProcessed(claimedEvent)",
  );
  assertIncludes(
    source,
    "deps.markStoreStripeWebhookEventFailed(claimedWebhookEvent, err)",
  );
  assertIncludes(indexSource, '.eq("updated_at", claim.claimUpdatedAt)');
  assertIncludes(indexSource, "return Boolean(asRecord(finalizedEvent).id);");
});

function assertIncludes(source: string, expected: string) {
  if (!source.includes(expected)) {
    throw new Error(`Expected source to include ${JSON.stringify(expected)}`);
  }
}

function assertOrdered(source: string, expected: string[]) {
  let previousIndex = -1;
  for (const value of expected) {
    const index = source.indexOf(value);
    if (index === -1) {
      throw new Error(`Expected source to include ${JSON.stringify(value)}`);
    }
    if (index <= previousIndex) {
      throw new Error(
        `Expected ${JSON.stringify(value)} after previous assertion`,
      );
    }
    previousIndex = index;
  }
}
