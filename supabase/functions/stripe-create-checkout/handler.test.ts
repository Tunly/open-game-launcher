import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  handleStripeCreateCheckout,
  type StripeCheckoutSessionParams,
  type StripeCreateCheckoutHandlerDeps,
} from "./handler.ts";

const endpoint = "https://functions.example/stripe-create-checkout";
const userId = "99999999-9999-4999-8999-999999999999";
const paidProductId = "11111111-1111-4111-8111-111111111111";
const freeProductId = "22222222-2222-4222-8222-222222222222";
const checkoutAttemptId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

Deno.test("stripe checkout handler answers CORS and method guards without dependencies", async () => {
  const deps = stubDeps({
    authenticateRequest: () => {
      throw new Error("auth should not be checked");
    },
  });

  const optionsResponse = await handleStripeCreateCheckout(
    new Request(endpoint, { method: "OPTIONS" }),
    deps,
  );
  assertEquals(optionsResponse.status, 200);
  assertEquals(optionsResponse.headers.get("Access-Control-Allow-Origin"), "*");

  const getResponse = await handleStripeCreateCheckout(
    new Request(endpoint, { method: "GET" }),
    deps,
  );
  assertEquals(getResponse.status, 405);
  assertEquals(await getResponse.json(), { error: "Method not allowed" });
});

Deno.test("stripe checkout handler requires Authorization before body parsing", async () => {
  let readCalls = 0;
  const response = await handleStripeCreateCheckout(
    new Request(endpoint, {
      body: "{",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    stubDeps({
      authenticateRequest: async () => ({ status: "missing" }),
      readProducts: async () => {
        readCalls += 1;
        return [];
      },
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(await response.json(), {
    error: "Missing Authorization header",
  });
  assertEquals(readCalls, 0);
});

Deno.test("stripe checkout handler rejects invalid product and attempt bodies before reads", async () => {
  let readCalls = 0;
  const response = await handleStripeCreateCheckout(
    checkoutRequest({
      checkout_attempt_id: "not-a-uuid",
      product_ids: ["not-a-product-id"],
    }),
    stubDeps({
      readProducts: async () => {
        readCalls += 1;
        return [];
      },
    }),
  );

  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    error: "product_ids is required and must contain at least one product id",
  });
  assertEquals(readCalls, 0);
});

Deno.test("stripe checkout handler rejects unavailable products before owned-license reads", async () => {
  let ownedReads = 0;
  const response = await handleStripeCreateCheckout(
    checkoutRequest({
      checkout_attempt_id: checkoutAttemptId,
      product_ids: [paidProductId],
    }),
    stubDeps({
      readOwnedProductIds: async () => {
        ownedReads += 1;
        return [];
      },
      readProducts: async () => [],
    }),
  );

  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    error: "One or more products are unavailable",
  });
  assertEquals(ownedReads, 0);
});

Deno.test("stripe checkout handler rejects already-owned carts before order writes", async () => {
  let orderWrites = 0;
  const response = await handleStripeCreateCheckout(
    checkoutRequest({
      checkout_attempt_id: checkoutAttemptId,
      product_ids: [paidProductId],
    }),
    stubDeps({
      createOrder: async () => {
        orderWrites += 1;
        return { order: order(), status: "created" };
      },
      readOwnedProductIds: async () => [paidProductId],
    }),
  );

  assertEquals(response.status, 409);
  assertEquals(await response.json(), {
    error: "All requested products are already in your library",
  });
  assertEquals(orderWrites, 0);
});

Deno.test("stripe checkout handler rejects missing device ids before signed orders", async () => {
  let orderWrites = 0;
  const response = await handleStripeCreateCheckout(
    checkoutRequest({
      checkout_attempt_id: checkoutAttemptId,
      product_ids: [paidProductId],
    }),
    stubDeps({
      createOrder: async () => {
        orderWrites += 1;
        return { order: order(), status: "created" };
      },
      getLicenseSigningConfig: () => ({
        allowUnsignedFallback: false,
        signingKey: "11".repeat(32),
      }),
    }),
  );

  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    error: "device_id is required for signed Store license issuance.",
  });
  assertEquals(orderWrites, 0);
});

Deno.test("stripe checkout handler returns existing duplicate checkout attempts", async () => {
  const retrievedSessions: string[] = [];
  const response = await handleStripeCreateCheckout(
    checkoutRequest({
      checkout_attempt_id: checkoutAttemptId,
      product_ids: [paidProductId],
    }),
    stubDeps({
      createOrder: async () => ({
        errorMessage: "duplicate key value violates unique constraint",
        status: "duplicate_attempt",
      }),
      readExistingCheckoutAttempt: async () =>
        order({
          id: "order-existing",
          status: "pending",
          stripe_session_id: "cs_existing",
        }),
      retrieveCheckoutSession: async (sessionId) => {
        retrievedSessions.push(sessionId);
        return {
          id: sessionId,
          payment_intent: "pi_existing",
          url: "https://checkout.stripe.test/existing",
        };
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    id: "cs_existing",
    order_id: "order-existing",
    status: "pending",
    url: "https://checkout.stripe.test/existing",
  });
  assertEquals(retrievedSessions, ["cs_existing"]);
});

Deno.test("stripe checkout handler fulfills free orders without Stripe sessions", async () => {
  const operations: string[] = [];
  const response = await handleStripeCreateCheckout(
    checkoutRequest({
      checkout_attempt_id: checkoutAttemptId,
      product_ids: [freeProductId],
    }),
    stubDeps({
      createCheckoutSession: () => {
        throw new Error("Stripe should not be called for free orders");
      },
      createOrderItems: async (orderId, items) => {
        operations.push(`items:${orderId}:${items[0].price_cents_snapshot}`);
      },
      deleteCartItems: async (id, productIds) => {
        operations.push(`cart:${id}:${productIds.join(",")}`);
      },
      issueStoreLicenses: async (id, orderId, products) => {
        operations.push(`license:${id}:${orderId}:${products[0].id}`);
      },
      markFreeOrderFulfilled: async (orderId) => {
        operations.push(`fulfilled:${orderId}`);
      },
      readProducts: async () => [freeProduct()],
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    id: null,
    order_id: "order-1",
    status: "fulfilled",
    url: null,
  });
  assertEquals(operations, [
    "items:order-1:0",
    `license:${userId}:order-1:${freeProductId}`,
    "fulfilled:order-1",
    `cart:${userId}:${freeProductId}`,
  ]);
});

Deno.test("stripe checkout handler creates paid Checkout Sessions with idempotency", async () => {
  const orders: Array<{ attemptId: string; subtotal: number; userId: string }> =
    [];
  const orderItems: unknown[] = [];
  const sessions: Array<{
    options: { idempotencyKey: string };
    params: StripeCheckoutSessionParams;
  }> = [];
  const attachments: unknown[] = [];

  const response = await handleStripeCreateCheckout(
    checkoutRequest(
      {
        cancel_url: "https://evil.example/nope",
        checkout_attempt_id: checkoutAttemptId,
        device_id: " deck-1 ",
        product_ids: [paidProductId],
        success_url:
          "https://app.example/store/thanks?session_id={CHECKOUT_SESSION_ID}",
      },
      { origin: "https://app.example" },
    ),
    stubDeps({
      attachStripeSessionToOrder: async (orderId, input) => {
        attachments.push({ input, orderId });
      },
      createCheckoutSession: async (params, options) => {
        sessions.push({ options, params });
        return {
          id: "cs_paid",
          payment_intent: { id: "pi_paid" },
          url: "https://checkout.stripe.test/paid",
        };
      },
      createOrder: async (input) => {
        orders.push({
          attemptId: input.checkoutAttemptId,
          subtotal: input.subtotalCents,
          userId: input.userId,
        });
        return { order: order(), status: "created" };
      },
      createOrderItems: async (_orderId, items) => {
        orderItems.push(...items);
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    id: "cs_paid",
    order_id: "order-1",
    url: "https://checkout.stripe.test/paid",
  });
  assertEquals(orders, [
    {
      attemptId: checkoutAttemptId,
      subtotal: 1500,
      userId,
    },
  ]);
  assertEquals(orderItems, [
    {
      price_cents_snapshot: 1500,
      product_id: paidProductId,
      quantity: 1,
      title_snapshot: "Paid Game",
    },
  ]);
  assertEquals(sessions[0].options, {
    idempotencyKey: `store-checkout:${userId}:${checkoutAttemptId}`,
  });
  assertEquals(
    sessions[0].params.success_url,
    "https://app.example/store/thanks?session_id={CHECKOUT_SESSION_ID}",
  );
  assertEquals(
    sessions[0].params.cancel_url,
    "https://app.example/store?tab=browse",
  );
  assertEquals(sessions[0].params.customer, "cus_123");
  assertEquals(sessions[0].params.metadata, {
    device_id: "deck-1",
    order_id: "order-1",
    user_id: userId,
  });
  assertEquals(sessions[0].params.line_items[0].price_data.unit_amount, 1500);
  assertEquals(attachments, [
    {
      input: { paymentIntentId: "pi_paid", sessionId: "cs_paid" },
      orderId: "order-1",
    },
  ]);
});

Deno.test("stripe checkout handler marks failed orders when item writes fail", async () => {
  const failedOrders: string[] = [];
  const response = await handleStripeCreateCheckout(
    checkoutRequest({
      checkout_attempt_id: checkoutAttemptId,
      product_ids: [paidProductId],
    }),
    stubDeps({
      createOrderItems: () => {
        throw new Error("insert failed");
      },
      markOrderFailed: async (orderId) => {
        failedOrders.push(orderId);
      },
    }),
  );

  assertEquals(response.status, 500);
  assertEquals(await response.json(), {
    error: "Failed to create order items: insert failed",
  });
  assertEquals(failedOrders, ["order-1"]);
});

Deno.test("stripe checkout handler marks failed orders when session creation fails", async () => {
  const failedOrders: string[] = [];
  const response = await handleStripeCreateCheckout(
    checkoutRequest({
      checkout_attempt_id: checkoutAttemptId,
      product_ids: [paidProductId],
    }),
    stubDeps({
      createCheckoutSession: () => {
        throw new Error("Stripe unavailable");
      },
      markOrderFailed: async (orderId) => {
        failedOrders.push(orderId);
      },
    }),
  );

  assertEquals(response.status, 500);
  assertEquals(await response.json(), {
    error: "Stripe unavailable",
  });
  assertEquals(failedOrders, ["order-1"]);
});

Deno.test("stripe checkout handler marks failed orders when session attach fails", async () => {
  const failedOrders: string[] = [];
  const response = await handleStripeCreateCheckout(
    checkoutRequest({
      checkout_attempt_id: checkoutAttemptId,
      product_ids: [paidProductId],
    }),
    stubDeps({
      attachStripeSessionToOrder: () => {
        throw new Error("update failed");
      },
      markOrderFailed: async (orderId) => {
        failedOrders.push(orderId);
      },
    }),
  );

  assertEquals(response.status, 500);
  assertEquals(await response.json(), {
    error: "Failed to attach Stripe session to order: update failed",
  });
  assertEquals(failedOrders, ["order-1"]);
});

function checkoutRequest(
  body: unknown,
  options: { origin?: string } = {},
): Request {
  return new Request(endpoint, {
    body: JSON.stringify(body),
    headers: {
      Authorization: "Bearer token",
      "Content-Type": "application/json",
      ...(options.origin ? { origin: options.origin } : {}),
    },
    method: "POST",
  });
}

function paidProduct() {
  return {
    discount_percent: 25,
    id: paidProductId,
    platforms: ["pc"],
    price_cents: 2000,
    title: "Paid Game",
  };
}

function freeProduct() {
  return {
    discount_percent: 100,
    id: freeProductId,
    platforms: ["pc"],
    price_cents: 1500,
    title: "Free Game",
  };
}

function order(overrides: Partial<{
  id: string;
  status: string | null;
  stripe_session_id: string | null;
}> = {}) {
  return {
    id: "order-1",
    status: "pending",
    stripe_session_id: null,
    ...overrides,
  };
}

function stubDeps(
  overrides: Partial<StripeCreateCheckoutHandlerDeps> = {},
): StripeCreateCheckoutHandlerDeps {
  return {
    attachStripeSessionToOrder: async () => {},
    authenticateRequest: async () => ({ status: "ok", userId }),
    checkoutUrlFallback: "http://localhost:1420",
    createCheckoutSession: async () => ({
      id: "cs_default",
      payment_intent: null,
      url: "https://checkout.stripe.test/default",
    }),
    createOrder: async () => ({ order: order(), status: "created" }),
    createOrderItems: async () => {},
    createOrRetrieveCustomer: async () => "cus_123",
    deleteCartItems: async () => {},
    getLicenseSigningConfig: () => ({
      allowUnsignedFallback: true,
      signingKey: null,
    }),
    issueStoreLicenses: async () => {},
    logError: () => {},
    markFreeOrderFulfilled: async () => {},
    markOrderFailed: async () => {},
    readExistingCheckoutAttempt: async () => null,
    readOwnedProductIds: async () => [],
    readProducts: async () => [paidProduct()],
    retrieveCheckoutSession: async (sessionId) => ({
      id: sessionId,
      payment_intent: null,
      url: "https://checkout.stripe.test/retrieved",
    }),
    ...overrides,
  };
}
