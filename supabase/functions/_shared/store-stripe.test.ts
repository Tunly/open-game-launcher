import {
  buildStoreCheckoutIdempotencyKey,
  buildStoreCheckoutSessionParams,
  checkoutPaymentSnapshotToOrderUpdate,
  cleanStoreCheckoutAttemptId,
  readCheckoutSessionPaymentSnapshot,
} from "./store-stripe.ts";

Deno.test(
  "buildStoreCheckoutSessionParams enables invoice, tax, and billing staging",
  () => {
    const params = buildStoreCheckoutSessionParams({
      cancelUrl: "http://localhost:1420/store?tab=browse",
      customer: "cus_mock",
      deviceId: "device-1",
      orderId: "order-1",
      products: [
        {
          discount_percent: 0,
          id: "product-1",
          price_cents: 1000,
          title: "Mock Game",
        },
      ],
      successUrl:
        "http://localhost:1420/store?tab=orders&session_id={CHECKOUT_SESSION_ID}",
      userId: "user-1",
    });

    assertEquals(params.mode, "payment");
    assertEquals(params.automatic_tax, { enabled: true });
    assertEquals(params.tax_id_collection, { enabled: true });
    assertEquals(params.billing_address_collection, "required");
    assertEquals(params.customer_update, { address: "auto", name: "auto" });
    assertEquals(params.metadata, {
      device_id: "device-1",
      order_id: "order-1",
      user_id: "user-1",
    });
    assertEquals(params.invoice_creation, {
      enabled: true,
      invoice_data: {
        description: "OG-Launcher Store Order",
        metadata: {
          device_id: "device-1",
          order_id: "order-1",
          user_id: "user-1",
        },
      },
    });
    assertEquals(params.payment_intent_data, {
      metadata: {
        device_id: "device-1",
        order_id: "order-1",
        user_id: "user-1",
      },
    });
    assertEquals((params.line_items as unknown[]).length, 1);
    assertEquals(
      (params.line_items as Array<{ price_data: Record<string, unknown> }>)[0]
        .price_data,
      {
        currency: "eur",
        product_data: {
          metadata: { product_id: "product-1" },
          name: "Mock Game",
        },
        tax_behavior: "exclusive",
        unit_amount: 1000,
      },
    );
  },
);

Deno.test("cleanStoreCheckoutAttemptId accepts UUID attempts only", () => {
  assertEquals(
    cleanStoreCheckoutAttemptId(" AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA "),
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  );
  assertEquals(cleanStoreCheckoutAttemptId("not-a-uuid"), null);
  assertEquals(cleanStoreCheckoutAttemptId(null), null);
});

Deno.test("buildStoreCheckoutIdempotencyKey scopes retries to a user attempt", () => {
  assertEquals(
    buildStoreCheckoutIdempotencyKey({
      checkoutAttemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    }),
    "store-checkout:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  );
});

Deno.test(
  "readCheckoutSessionPaymentSnapshot maps Stripe totals into order update payload",
  () => {
    const snapshot = readCheckoutSessionPaymentSnapshot({
      amount_subtotal: 1000,
      amount_total: 1190,
      currency: "eur",
      payment_intent: { id: "pi_mock" },
      total_details: {
        amount_tax: 190,
      },
    });

    assertEquals(snapshot, {
      currency: "eur",
      stripePaymentIntent: "pi_mock",
      subtotalCents: 1000,
      taxCents: 190,
      totalCents: 1190,
    });
    assertEquals(
      checkoutPaymentSnapshotToOrderUpdate(
        snapshot,
        "2026-06-10T10:00:00.000Z",
      ),
      {
        currency: "eur",
        stripe_payment_intent: "pi_mock",
        subtotal_cents: 1000,
        tax_cents: 190,
        total_cents: 1190,
        updated_at: "2026-06-10T10:00:00.000Z",
      },
    );
  },
);

function assertEquals(actual: unknown, expected: unknown) {
  const actualJson = stableJson(actual);
  const expectedJson = stableJson(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      `Assertion failed:\nactual:   ${actualJson}\nexpected: ${expectedJson}`,
    );
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${
      Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
        .join(",")
    }}`;
  }

  return JSON.stringify(value);
}
