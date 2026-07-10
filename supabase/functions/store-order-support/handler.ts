import { corsHeaders } from "../_shared/cors.ts";
import {
  buildStripeRefundCreateArgs,
  parseStoreOrderSupportRequest,
  type StripeRefundCreateArgs,
} from "./contract.ts";

export type StoreOrderRow = {
  created_at: string;
  currency: string;
  id: string;
  paid_at: string | null;
  payment_method: string | null;
  status: string;
  stripe_payment_intent: string | null;
  stripe_session_id: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  updated_at: string;
  user_id: string;
};

export type StoreRefundRequestRow = {
  id: string;
  provider_refund_status?: string | null;
  status?: string | null;
  [key: string]: unknown;
};

export type StoreOrderSupportState = {
  invoice: unknown;
  order: StoreOrderRow | null;
  refund_request: unknown;
};

type InvoiceSyncSource = "manual_sync" | "refund_execution";

export interface StoreOrderSupportHandlerDeps {
  createStripeRefund: (args: StripeRefundCreateArgs) => Promise<unknown>;
  getUserId: (request: Request) => Promise<string | null>;
  logError?: (message: string, error: unknown) => void;
  logWarning?: (message: string, error: unknown) => void;
  readOwnedOrder: (
    orderId: string,
    userId: string,
  ) => Promise<StoreOrderRow | null>;
  readRefundRequest: (orderId: string) => Promise<StoreRefundRequestRow | null>;
  readSupportState: (
    orderId: string,
    userId: string,
  ) => Promise<StoreOrderSupportState>;
  rejectStagedRefund: (orderId: string, message: string) => Promise<void>;
  resolvePaymentIntentId: (order: StoreOrderRow) => Promise<string | null>;
  stageRefundRequest: (
    order: StoreOrderRow,
    reason: string,
    details: string | null,
  ) => Promise<StoreRefundRequestRow>;
  syncInvoiceForOrder: (
    order: StoreOrderRow,
    source: InvoiceSyncSource,
  ) => Promise<unknown>;
  syncRefundFromStripeRefund: (refund: unknown) => Promise<void>;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function handleStoreOrderSupport(
  request: Request,
  deps: StoreOrderSupportHandlerDeps,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const userId = await deps.getUserId(request);
    if (!userId) {
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const supportRequest = parseStoreOrderSupportRequest(
      body as Record<string, unknown>,
    );
    if (!supportRequest.ok) {
      return jsonResponse(
        { error: supportRequest.error },
        supportRequest.statusCode,
      );
    }

    const order = await deps.readOwnedOrder(supportRequest.orderId, userId);
    if (!order) {
      return jsonResponse({ error: "Store order not found" }, 404);
    }

    if (supportRequest.action === "sync_invoice") {
      const invoice = await deps.syncInvoiceForOrder(order, "manual_sync");
      return jsonResponse({
        invoice,
        order,
        refund_request: await deps.readRefundRequest(order.id),
      });
    }

    return await executeRefund(
      order,
      supportRequest.reason,
      supportRequest.details,
      deps,
    );
  } catch (error) {
    if (deps.logError) {
      deps.logError("Store order support error:", error);
    } else {
      console.error("Store order support error:", error);
    }
    return jsonResponse(
      { error: "Store order support failed." },
      500,
    );
  }
}

async function executeRefund(
  order: StoreOrderRow,
  reason: string,
  details: string | null,
  deps: StoreOrderSupportHandlerDeps,
) {
  if (!["paid", "fulfilled"].includes(order.status) || order.total_cents <= 0) {
    return jsonResponse(
      { error: "Order is not eligible for a Stripe refund" },
      409,
    );
  }

  const existing = await deps.readRefundRequest(order.id);
  if (
    existing?.status === "processed" ||
    existing?.provider_refund_status === "succeeded"
  ) {
    return jsonResponse(await deps.readSupportState(order.id, order.user_id));
  }
  if (
    existing &&
    ["rejected", "cancelled"].includes(String(existing.status)) &&
    existing.provider_refund_status !== "failed"
  ) {
    return jsonResponse({ error: "Refund request is closed" }, 409);
  }

  const stagedRefund = await deps.stageRefundRequest(order, reason, details);
  const paymentIntentId = await deps.resolvePaymentIntentId(order);
  if (!paymentIntentId) {
    const message = "Stripe payment intent is missing for this order";
    await deps.rejectStagedRefund(order.id, message);
    return jsonResponse({ error: message }, 409);
  }

  try {
    const refund = await deps.createStripeRefund(
      buildStripeRefundCreateArgs({
        amountCents: order.total_cents,
        orderId: order.id,
        paymentIntentId,
        reason,
        refundRequestId: stagedRefund.id,
        userId: order.user_id,
      }),
    );

    await deps.syncRefundFromStripeRefund(refund);
    await deps.syncInvoiceForOrder(
      { ...order, stripe_payment_intent: paymentIntentId },
      "refund_execution",
    ).catch((error) => {
      if (deps.logWarning) {
        deps.logWarning("Invoice sync after refund failed:", error);
      } else {
        console.warn("Invoice sync after refund failed:", error);
      }
    });

    return jsonResponse(await deps.readSupportState(order.id, order.user_id));
  } catch (error) {
    const message = "Stripe refund request failed.";
    await deps.rejectStagedRefund(order.id, message);
    throw error;
  }
}
