import {
  checkoutPaymentSnapshotToOrderUpdate,
  readCheckoutSessionPaymentSnapshot,
} from "../_shared/store-stripe.ts";
import type {
  StoreOrderPaymentRecord,
  StoreProductRecord,
} from "../_shared/store.ts";
import {
  type ClaimedStripeWebhookEvent,
  type StripeWebhookHandlerDeps,
} from "./handler.ts";

export type { StoreProductRecord } from "../_shared/store.ts";

interface CheckoutStoreOrder {
  id: string;
  user_id: string;
  status?: string;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  total_cents?: number | null;
}

export interface StripeWebhookAdapterDeps {
  issueStoreLicenses: (
    userId: string,
    orderId: string,
    products: StoreProductRecord[],
    deviceId?: string | null,
  ) => Promise<void>;
  supabaseAdmin: unknown;
  syncStoreInvoiceFromStripeInvoice: (
    invoice: unknown,
    eventType: string,
  ) => Promise<unknown>;
  syncStoreRefundFromStripeRefund: (refund: unknown) => Promise<void>;
  syncStripeInvoiceForOrder: (
    order: StoreOrderPaymentRecord,
    syncSource: string,
  ) => Promise<unknown>;
}

type SupabaseQueryClient = {
  from: (table: string) => SupabaseQueryBuilderRoot;
};

type SupabaseQueryBuilderRoot = {
  delete: () => SupabaseQueryBuilder;
  insert: (value: unknown) => SupabaseQueryBuilder;
  select: (columns?: string) => SupabaseQueryBuilder;
  update: (value: unknown) => SupabaseQueryBuilder;
};

type SupabaseQueryBuilder = {
  delete: () => SupabaseQueryBuilder;
  eq: (column: string, value: unknown) => SupabaseQueryBuilder;
  in: (column: string, values: unknown[]) => SupabaseQueryBuilder;
  insert: (value: unknown) => SupabaseQueryBuilder;
  lte: (column: string, value: unknown) => SupabaseQueryBuilder;
  maybeSingle: () => Promise<SupabaseQueryResult>;
  select: (columns?: string) => SupabaseQueryBuilder;
  single: () => Promise<SupabaseQueryResult>;
  then: Promise<SupabaseQueryResult>["then"];
  update: (value: unknown) => SupabaseQueryBuilder;
};

type SupabaseQueryResult = {
  data?: unknown;
  error?: { code?: string; message: string } | null;
};

const CHECKOUT_STORE_ORDER_SELECT =
  "id, user_id, status, stripe_session_id, stripe_payment_intent, total_cents";
export const WEBHOOK_EVENT_PROCESSING_STALE_MS = 15 * 60 * 1000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function checkoutSessionMetadataValue(
  checkoutSession: unknown,
  key: string,
): string | null {
  return readString(asRecord(asRecord(checkoutSession).metadata)[key]);
}

export function isRetryableStripeWebhookEvent(
  event:
    | { processing_status?: string | null; updated_at?: string | null }
    | null,
  staleBefore: string,
): boolean {
  if (event?.processing_status === "failed") {
    return true;
  }

  const updatedAt = typeof event?.updated_at === "string"
    ? Date.parse(event.updated_at)
    : Number.NaN;
  const staleAt = Date.parse(staleBefore);
  return event?.processing_status === "processing" &&
    Number.isFinite(updatedAt) &&
    Number.isFinite(staleAt) &&
    updatedAt <= staleAt;
}

export function createStripeWebhookAdapters(
  deps: StripeWebhookAdapterDeps,
): Pick<
  StripeWebhookHandlerDeps,
  | "claimStoreStripeWebhookEvent"
  | "fulfillCheckoutSession"
  | "markStoreStripeWebhookEventFailed"
  | "markStoreStripeWebhookEventProcessed"
  | "persistCheckoutSessionProgress"
  | "syncStoreInvoiceFromStripeInvoice"
  | "syncStoreRefundFromStripeRefund"
> {
  const supabaseAdmin = deps.supabaseAdmin as SupabaseQueryClient;

  async function claimStoreStripeWebhookEvent(
    eventId: string,
    eventType: string,
  ): Promise<ClaimedStripeWebhookEvent | null> {
    const { data: insertedEvent, error } = await supabaseAdmin
      .from("store_stripe_webhook_events")
      .insert({
        error_message: null,
        event_type: eventType,
        id: eventId,
        processed_at: null,
        processing_status: "processing",
      })
      .select("updated_at")
      .single();

    if (!error) {
      if (typeof asRecord(insertedEvent).updated_at !== "string") {
        throw new Error("Stripe webhook claim did not return updated_at");
      }
      return {
        claimUpdatedAt: asRecord(insertedEvent).updated_at as string,
        id: eventId,
      };
    }

    if (error.code !== "23505") {
      throw new Error(`Failed to claim Stripe webhook event: ${error.message}`);
    }

    const staleBefore = new Date(
      Date.now() - WEBHOOK_EVENT_PROCESSING_STALE_MS,
    ).toISOString();
    const { data: existingEvent, error: readError } = await supabaseAdmin
      .from("store_stripe_webhook_events")
      .select("processing_status, updated_at")
      .eq("id", eventId)
      .maybeSingle();

    if (readError) {
      throw new Error(
        `Failed to read Stripe webhook event: ${readError.message}`,
      );
    }

    if (
      !existingEvent ||
      !isRetryableStripeWebhookEvent(
        existingEvent as {
          processing_status?: string | null;
          updated_at?: string | null;
        },
        staleBefore,
      )
    ) {
      return null;
    }

    const existing = existingEvent as {
      processing_status?: string | null;
      updated_at?: string | null;
    };
    let retryQuery = supabaseAdmin
      .from("store_stripe_webhook_events")
      .update({
        error_message: null,
        event_type: eventType,
        processed_at: null,
        processing_status: "processing",
      })
      .eq("id", eventId)
      .eq("processing_status", existing.processing_status);

    if (existing.processing_status === "processing") {
      retryQuery = retryQuery.lte("updated_at", staleBefore);
    }

    const { data: retriedEvent, error: retryError } = await retryQuery
      .select("updated_at")
      .maybeSingle();

    if (retryError) {
      throw new Error(
        `Failed to retry Stripe webhook event: ${retryError.message}`,
      );
    }

    return typeof asRecord(retriedEvent).updated_at === "string"
      ? {
        claimUpdatedAt: asRecord(retriedEvent).updated_at as string,
        id: eventId,
      }
      : null;
  }

  async function markStoreStripeWebhookEventProcessed(
    claim: ClaimedStripeWebhookEvent,
  ): Promise<boolean> {
    const { data: finalizedEvent, error } = await supabaseAdmin
      .from("store_stripe_webhook_events")
      .update({
        error_message: null,
        processed_at: new Date().toISOString(),
        processing_status: "processed",
      })
      .eq("id", claim.id)
      .eq("updated_at", claim.claimUpdatedAt)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(
        `Failed to mark Stripe webhook event processed: ${error.message}`,
      );
    }

    return Boolean(asRecord(finalizedEvent).id);
  }

  async function markStoreStripeWebhookEventFailed(
    claim: ClaimedStripeWebhookEvent,
    error: unknown,
  ): Promise<boolean> {
    const message = error instanceof Error ? error.message : String(error);
    const { data: finalizedEvent, error: updateError } = await supabaseAdmin
      .from("store_stripe_webhook_events")
      .update({
        error_message: message.slice(0, 2000),
        processed_at: null,
        processing_status: "failed",
      })
      .eq("id", claim.id)
      .eq("updated_at", claim.claimUpdatedAt)
      .select("id")
      .maybeSingle();

    if (updateError) {
      throw new Error(
        `Failed to mark Stripe webhook event failed: ${updateError.message}`,
      );
    }

    return Boolean(asRecord(finalizedEvent).id);
  }

  async function readStoreOrderForCheckoutSession(
    sessionId: string,
    checkoutSession: unknown,
  ): Promise<CheckoutStoreOrder> {
    const metadataOrderId = checkoutSessionMetadataValue(
      checkoutSession,
      "order_id",
    );
    const metadataUserId = checkoutSessionMetadataValue(
      checkoutSession,
      "user_id",
    );

    const { data: sessionOrder, error: sessionOrderError } = await supabaseAdmin
      .from("store_orders")
      .select(CHECKOUT_STORE_ORDER_SELECT)
      .eq("stripe_session_id", sessionId)
      .maybeSingle();

    if (sessionOrderError) {
      throw new Error(
        `Failed to read store order for Stripe session ${sessionId}: ${sessionOrderError.message}`,
      );
    }

    let order = sessionOrder as CheckoutStoreOrder | null;
    if (!order && metadataOrderId) {
      const { data: metadataOrder, error: metadataOrderError } =
        await supabaseAdmin
          .from("store_orders")
          .select(CHECKOUT_STORE_ORDER_SELECT)
          .eq("id", metadataOrderId)
          .maybeSingle();

      if (metadataOrderError) {
        throw new Error(
          `Failed to read store order ${metadataOrderId}: ${metadataOrderError.message}`,
        );
      }
      order = metadataOrder as CheckoutStoreOrder | null;
    }

    if (!order) {
      throw new Error(`Store order not found for Stripe session ${sessionId}`);
    }
    if (metadataUserId && metadataUserId !== order.user_id) {
      throw new Error(`Stripe session ${sessionId} user metadata mismatch`);
    }

    return order;
  }

  async function persistCheckoutSessionProgress(
    sessionId: string,
    checkoutSession: unknown,
    status?: "expired" | "failed" | "pending",
  ): Promise<void> {
    const order = await readStoreOrderForCheckoutSession(
      sessionId,
      checkoutSession,
    );

    if (
      (status === "failed" || status === "expired") &&
      (order.status === "fulfilled" || order.status === "refunded")
    ) {
      return;
    }

    const update = {
      ...checkoutPaymentSnapshotToOrderUpdate(
        readCheckoutSessionPaymentSnapshot(checkoutSession),
        new Date().toISOString(),
      ),
      stripe_session_id: sessionId,
      ...(status ? { status } : {}),
    };
    const { error } = await supabaseAdmin
      .from("store_orders")
      .update(update)
      .eq("id", order.id);

    if (error) {
      throw new Error(
        `Failed to persist Stripe checkout progress: ${error.message}`,
      );
    }
  }

  async function fulfillCheckoutSession(
    sessionId: string,
    licenseDeviceId: string | null,
    checkoutSession: unknown,
  ): Promise<void> {
    const order = await readStoreOrderForCheckoutSession(
      sessionId,
      checkoutSession,
    );

    const paidAt = new Date().toISOString();
    const paymentSnapshot = readCheckoutSessionPaymentSnapshot(checkoutSession);
    const sessionOrderUpdate = checkoutPaymentSnapshotToOrderUpdate(
      paymentSnapshot,
      paidAt,
    );
    const syncedOrderPayment = {
      ...order,
      stripe_session_id: sessionId,
      stripe_payment_intent: paymentSnapshot.stripePaymentIntent ??
        order.stripe_payment_intent,
      total_cents: paymentSnapshot.totalCents ?? order.total_cents ??
        undefined,
    };

    if (order.status === "fulfilled") {
      const { error: updateError } = await supabaseAdmin
        .from("store_orders")
        .update({ ...sessionOrderUpdate, stripe_session_id: sessionId })
        .eq("id", order.id);
      if (updateError) {
        throw new Error(
          `Failed to persist Stripe checkout totals: ${updateError.message}`,
        );
      }
      await deps.syncStripeInvoiceForOrder(
        { ...syncedOrderPayment, status: "fulfilled" },
        "checkout_session_completed",
      );
      return;
    }

    const { data: orderItems, error: itemError } = await supabaseAdmin
      .from("store_order_items")
      .select("product_id")
      .eq("order_id", order.id);

    if (itemError) {
      throw new Error(`Failed to read order items: ${itemError.message}`);
    }

    const productIds = ((orderItems ?? []) as Array<{ product_id: string }>)
      .map((item) => item.product_id);
    if (productIds.length === 0) {
      throw new Error(`Store order ${order.id} has no order items`);
    }

    const { data: products, error: productError } = await supabaseAdmin
      .from("store_products")
      .select("id, title, platforms, price_cents, discount_percent")
      .in("id", productIds);

    if (productError) {
      throw new Error(
        `Failed to read purchased products: ${productError.message}`,
      );
    }

    const { error: paidError } = await supabaseAdmin
      .from("store_orders")
      .update({
        ...sessionOrderUpdate,
        stripe_session_id: sessionId,
        status: "paid",
        paid_at: paidAt,
      })
      .eq("id", order.id);
    if (paidError) {
      throw new Error(`Failed to mark order paid: ${paidError.message}`);
    }

    await deps.issueStoreLicenses(
      order.user_id,
      order.id,
      (products ?? []) as StoreProductRecord[],
      licenseDeviceId,
    );

    const { error: fulfillError } = await supabaseAdmin
      .from("store_orders")
      .update({
        ...sessionOrderUpdate,
        stripe_session_id: sessionId,
        status: "fulfilled",
        paid_at: paidAt,
      })
      .eq("id", order.id);

    if (fulfillError) {
      throw new Error(
        `Failed to mark order fulfilled: ${fulfillError.message}`,
      );
    }

    await deps.syncStripeInvoiceForOrder(
      { ...syncedOrderPayment, status: "fulfilled" },
      "checkout_session_completed",
    );

    await supabaseAdmin
      .from("store_cart_items")
      .delete()
      .eq("user_id", order.user_id)
      .in("product_id", productIds);
  }

  return {
    claimStoreStripeWebhookEvent,
    fulfillCheckoutSession,
    markStoreStripeWebhookEventFailed,
    markStoreStripeWebhookEventProcessed,
    persistCheckoutSessionProgress,
    syncStoreInvoiceFromStripeInvoice: deps.syncStoreInvoiceFromStripeInvoice,
    syncStoreRefundFromStripeRefund: deps.syncStoreRefundFromStripeRefund,
  };
}
