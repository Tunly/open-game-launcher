import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import type { StripeRefundCreateArgs } from "./contract.ts";
import {
  handleStoreOrderSupport,
  type StoreOrderRow,
  type StoreOrderSupportHandlerDeps,
  type StoreOrderSupportState,
  type StoreRefundRequestRow,
} from "./handler.ts";

const userId = "22222222-2222-4222-8222-222222222222";
const orderId = "11111111-1111-4111-8111-111111111111";

Deno.test("store order support handler answers CORS and method guards without dependencies", async () => {
  const deps = stubDeps({
    getUserId: () => {
      throw new Error("auth should not be checked");
    },
  });

  const optionsResponse = await handleStoreOrderSupport(
    new Request("https://functions.example/store-order-support", {
      method: "OPTIONS",
    }),
    deps,
  );
  assertEquals(optionsResponse.status, 200);
  assertEquals(optionsResponse.headers.get("Access-Control-Allow-Origin"), "*");

  const getResponse = await handleStoreOrderSupport(
    new Request("https://functions.example/store-order-support", {
      method: "GET",
    }),
    deps,
  );
  assertEquals(getResponse.status, 405);
  assertEquals(await getResponse.json(), { error: "Method not allowed" });
});

Deno.test("store order support handler requires user auth before parsing", async () => {
  let readCalls = 0;
  const response = await handleStoreOrderSupport(
    jsonRequest({ action: "sync_invoice", order_id: orderId }),
    stubDeps({
      getUserId: async () => null,
      readOwnedOrder: async () => {
        readCalls += 1;
        return order();
      },
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(await response.json(), { error: "Invalid or expired token" });
  assertEquals(readCalls, 0);
});

Deno.test("store order support handler rejects invalid bodies before order reads", async () => {
  let readCalls = 0;
  const response = await handleStoreOrderSupport(
    jsonRequest({ action: "refund", order_id: orderId }),
    stubDeps({
      readOwnedOrder: async () => {
        readCalls += 1;
        return order();
      },
    }),
  );

  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    error: "action and order_id are required",
  });
  assertEquals(readCalls, 0);
});

Deno.test("store order support handler returns 404 for missing owned order", async () => {
  const response = await handleStoreOrderSupport(
    jsonRequest({ action: "sync_invoice", order_id: orderId }),
    stubDeps({
      readOwnedOrder: async () => null,
    }),
  );

  assertEquals(response.status, 404);
  assertEquals(await response.json(), { error: "Store order not found" });
});

Deno.test("store order support handler syncs invoices manually", async () => {
  const invoiceCalls: Array<{ id: string; source: string }> = [];
  const response = await handleStoreOrderSupport(
    jsonRequest({ action: "sync_invoice", order_id: orderId }),
    stubDeps({
      readRefundRequest: async () => refundRequest({ status: "reviewing" }),
      syncInvoiceForOrder: async (storeOrder, source) => {
        invoiceCalls.push({ id: storeOrder.id, source });
        return { id: "invoice-1", status: "available" };
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    invoice: { id: "invoice-1", status: "available" },
    order: order(),
    refund_request: refundRequest({ status: "reviewing" }),
  });
  assertEquals(invoiceCalls, [{ id: orderId, source: "manual_sync" }]);
});

Deno.test("store order support handler rejects ineligible refunds before staging", async () => {
  let stageCalls = 0;
  const response = await handleStoreOrderSupport(
    jsonRequest({ action: "execute_refund", order_id: orderId }),
    stubDeps({
      readOwnedOrder: async () =>
        order({ status: "pending", total_cents: 2599 }),
      stageRefundRequest: async () => {
        stageCalls += 1;
        return refundRequest();
      },
    }),
  );

  assertEquals(response.status, 409);
  assertEquals(await response.json(), {
    error: "Order is not eligible for a Stripe refund",
  });
  assertEquals(stageCalls, 0);
});

Deno.test("store order support handler returns existing state for processed refunds", async () => {
  let stripeCalls = 0;
  const state = supportState({ refund_request: refundRequest() });
  const response = await handleStoreOrderSupport(
    jsonRequest({ action: "execute_refund", order_id: orderId }),
    stubDeps({
      createStripeRefund: async () => {
        stripeCalls += 1;
        return {};
      },
      readRefundRequest: async () => refundRequest({ status: "processed" }),
      readSupportState: async () => state,
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), state);
  assertEquals(stripeCalls, 0);
});

Deno.test("store order support handler rejects closed refund requests", async () => {
  let stageCalls = 0;
  const response = await handleStoreOrderSupport(
    jsonRequest({ action: "execute_refund", order_id: orderId }),
    stubDeps({
      readRefundRequest: async () =>
        refundRequest({
          provider_refund_status: "cancelled",
          status: "cancelled",
        }),
      stageRefundRequest: async () => {
        stageCalls += 1;
        return refundRequest();
      },
    }),
  );

  assertEquals(response.status, 409);
  assertEquals(await response.json(), { error: "Refund request is closed" });
  assertEquals(stageCalls, 0);
});

Deno.test("store order support handler rejects staged refund without payment intent", async () => {
  const rejected: Array<{ orderId: string; message: string }> = [];
  const response = await handleStoreOrderSupport(
    jsonRequest({
      action: "execute_refund",
      details: "please refund",
      order_id: orderId,
      reason: "duplicate_purchase",
    }),
    stubDeps({
      rejectStagedRefund: async (id, message) => {
        rejected.push({ message, orderId: id });
      },
      resolvePaymentIntentId: async () => null,
    }),
  );

  assertEquals(response.status, 409);
  assertEquals(await response.json(), {
    error: "Stripe payment intent is missing for this order",
  });
  assertEquals(rejected, [
    {
      message: "Stripe payment intent is missing for this order",
      orderId,
    },
  ]);
});

Deno.test("store order support handler executes refunds and tolerates invoice sync warnings", async () => {
  const refundArgs: StripeRefundCreateArgs[] = [];
  const invoiceCalls: Array<{ paymentIntent: string | null; source: string }> =
    [];
  const warnings: unknown[] = [];
  const state = supportState({ refund_request: refundRequest() });
  const response = await handleStoreOrderSupport(
    jsonRequest({
      action: "execute_refund",
      order_id: orderId,
      reason: "fraud",
    }),
    stubDeps({
      createStripeRefund: async (args) => {
        refundArgs.push(args);
        return { id: "re_123" };
      },
      logWarning: (_message, error) => {
        warnings.push(error);
      },
      readSupportState: async () => state,
      syncInvoiceForOrder: async (storeOrder, source) => {
        invoiceCalls.push({
          paymentIntent: storeOrder.stripe_payment_intent,
          source,
        });
        throw new Error("invoice unavailable");
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), state);
  assertEquals(refundArgs, [
    {
      options: { idempotencyKey: `store-order-refund:${orderId}` },
      params: {
        amount: 2599,
        metadata: {
          order_id: orderId,
          refund_request_id: "refund-request-1",
          user_id: userId,
        },
        payment_intent: "pi_123",
        reason: "fraudulent",
      },
    },
  ]);
  assertEquals(invoiceCalls, [
    { paymentIntent: "pi_123", source: "refund_execution" },
  ]);
  assertEquals(warnings.length, 1);
});

Deno.test("store order support handler rejects staged refund after Stripe errors", async () => {
  const rejected: Array<{ orderId: string; message: string }> = [];
  const logged: unknown[] = [];
  const response = await handleStoreOrderSupport(
    jsonRequest({ action: "execute_refund", order_id: orderId }),
    stubDeps({
      createStripeRefund: async () => {
        throw new Error("Stripe refund failed hard");
      },
      logError: (_message, error) => {
        logged.push(error);
      },
      rejectStagedRefund: async (id, message) => {
        rejected.push({ message, orderId: id });
      },
    }),
  );

  assertEquals(response.status, 500);
  assertEquals(await response.json(), { error: "Stripe refund failed hard" });
  assertEquals(rejected, [
    { message: "Stripe refund failed hard", orderId },
  ]);
  assertEquals(logged.length, 1);
});

function jsonRequest(body: Record<string, unknown>) {
  return new Request("https://functions.example/store-order-support", {
    body: JSON.stringify(body),
    headers: {
      Authorization: "Bearer user-jwt",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

function order(overrides: Partial<StoreOrderRow> = {}): StoreOrderRow {
  return {
    created_at: "2026-06-10T10:00:00.000Z",
    currency: "eur",
    id: orderId,
    paid_at: "2026-06-10T10:05:00.000Z",
    payment_method: "card",
    status: "paid",
    stripe_payment_intent: "pi_123",
    stripe_session_id: "cs_123",
    subtotal_cents: 2199,
    tax_cents: 400,
    total_cents: 2599,
    updated_at: "2026-06-10T10:05:00.000Z",
    user_id: userId,
    ...overrides,
  };
}

function refundRequest(
  overrides: Partial<StoreRefundRequestRow> = {},
): StoreRefundRequestRow {
  return {
    id: "refund-request-1",
    provider_refund_status: "creating",
    status: "reviewing",
    ...overrides,
  };
}

function supportState(
  overrides: Partial<StoreOrderSupportState> = {},
): StoreOrderSupportState {
  return {
    invoice: { id: "invoice-1" },
    order: order(),
    refund_request: null,
    ...overrides,
  };
}

function stubDeps(
  overrides: Partial<StoreOrderSupportHandlerDeps> = {},
): StoreOrderSupportHandlerDeps {
  return {
    createStripeRefund: async () => ({ id: "re_123" }),
    getUserId: async () => userId,
    logError: () => {},
    logWarning: () => {},
    readOwnedOrder: async () => order(),
    readRefundRequest: async () => null,
    readSupportState: async () => supportState(),
    rejectStagedRefund: async () => {},
    resolvePaymentIntentId: async () => "pi_123",
    stageRefundRequest: async () => refundRequest(),
    syncInvoiceForOrder: async () => ({ id: "invoice-1" }),
    syncRefundFromStripeRefund: async () => {},
    ...overrides,
  };
}
