import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  buildStripeRefundCreateArgs,
  parseStoreOrderSupportRequest,
  stripeRefundReason,
} from "./contract.ts";

const orderId = "11111111-1111-4111-8111-111111111111";

Deno.test("store order support parses valid refund requests", () => {
  assertEquals(
    parseStoreOrderSupportRequest({
      action: "execute_refund",
      details: ` ${"x".repeat(2100)} `,
      order_id: ` ${orderId} `,
      reason: " duplicate_purchase ",
    }),
    {
      action: "execute_refund",
      details: "x".repeat(2000),
      ok: true,
      orderId,
      reason: "duplicate_purchase",
    },
  );
});

Deno.test("store order support parses valid invoice sync requests", () => {
  assertEquals(
    parseStoreOrderSupportRequest({
      action: "sync_invoice",
      order_id: orderId,
    }),
    {
      action: "sync_invoice",
      details: null,
      ok: true,
      orderId,
      reason: "requested_by_customer",
    },
  );
});

Deno.test("store order support rejects invalid actions and order ids", () => {
  const expected = {
    error: "action and order_id are required",
    ok: false,
    statusCode: 400,
  } as const;

  assertEquals(
    parseStoreOrderSupportRequest({ action: "refund", order_id: orderId }),
    expected,
  );
  assertEquals(
    parseStoreOrderSupportRequest({
      action: "sync_invoice",
      order_id: "../bad",
    }),
    expected,
  );
});

Deno.test("store order refund reason maps to Stripe enum", () => {
  assertEquals(stripeRefundReason("duplicate_purchase"), "duplicate");
  assertEquals(stripeRefundReason("fraud"), "fraudulent");
  assertEquals(stripeRefundReason("too_hard"), "requested_by_customer");
});

Deno.test("store order refund create args pin amount metadata and idempotency", () => {
  assertEquals(
    buildStripeRefundCreateArgs({
      amountCents: 2599,
      orderId,
      paymentIntentId: "pi_123",
      reason: "fraud",
      refundRequestId: "refund-request-1",
      userId: "user-1",
    }),
    {
      options: {
        idempotencyKey:
          "store-order-refund:11111111-1111-4111-8111-111111111111",
      },
      params: {
        amount: 2599,
        metadata: {
          order_id: orderId,
          refund_request_id: "refund-request-1",
          user_id: "user-1",
        },
        payment_intent: "pi_123",
        reason: "fraudulent",
      },
    },
  );
});
