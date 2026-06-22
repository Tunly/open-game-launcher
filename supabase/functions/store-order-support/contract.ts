export type SupportAction = "execute_refund" | "sync_invoice";

export type StoreOrderSupportRequest =
  | {
    action: SupportAction;
    details: string | null;
    ok: true;
    orderId: string;
    reason: string;
  }
  | {
    error: string;
    ok: false;
    statusCode: 400;
  };

export type StripeRefundReason =
  | "duplicate"
  | "fraudulent"
  | "requested_by_customer";

export type StripeRefundCreateArgs = {
  options: {
    idempotencyKey: string;
  };
  params: {
    amount: number;
    metadata: {
      order_id: string;
      refund_request_id: string;
      user_id: string;
    };
    payment_intent: string;
    reason: StripeRefundReason;
  };
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseStoreOrderSupportRequest(
  body: Record<string, unknown>,
): StoreOrderSupportRequest {
  const action = cleanAction(body.action);
  const orderId = cleanOrderId(body.order_id);
  if (!action || !orderId) {
    return {
      error: "action and order_id are required",
      ok: false,
      statusCode: 400,
    };
  }

  return {
    action,
    details: cleanDetails(body.details),
    ok: true,
    orderId,
    reason: cleanShortText(body.reason, "requested_by_customer"),
  };
}

export function stripeRefundReason(reason: string): StripeRefundReason {
  if (reason === "duplicate_purchase") return "duplicate";
  if (reason === "fraud") return "fraudulent";
  return "requested_by_customer";
}

export function buildStripeRefundCreateArgs(input: {
  amountCents: number;
  orderId: string;
  paymentIntentId: string;
  reason: string;
  refundRequestId: string;
  userId: string;
}): StripeRefundCreateArgs {
  return {
    options: { idempotencyKey: `store-order-refund:${input.orderId}` },
    params: {
      amount: input.amountCents,
      metadata: {
        order_id: input.orderId,
        refund_request_id: input.refundRequestId,
        user_id: input.userId,
      },
      payment_intent: input.paymentIntentId,
      reason: stripeRefundReason(input.reason),
    },
  };
}

function cleanOrderId(value: unknown): string | null {
  return typeof value === "string" && uuidPattern.test(value.trim())
    ? value.trim()
    : null;
}

function cleanAction(value: unknown): SupportAction | null {
  return value === "execute_refund" || value === "sync_invoice" ? value : null;
}

function cleanShortText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 80) : fallback;
}

function cleanDetails(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 2000) : null;
}
