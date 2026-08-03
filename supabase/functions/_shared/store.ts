// deno-lint-ignore-file no-import-prefix
import { supabaseAdmin } from "./supabase-admin.ts";
import {
  cleanStoreLicenseDeviceId,
  createStoreLicenseKey,
} from "./store-license.ts";
import { stripe } from "./stripe.ts";

export interface StoreProductRecord {
  id: string;
  title: string;
  platforms: string[] | null;
  price_cents: number;
  discount_percent: number;
}

export interface StoreOrderItemRecord {
  product_id: string;
}

export interface StoreOrderPaymentRecord {
  id: string;
  user_id: string;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  status?: string;
  total_cents?: number;
}

const STORE_ORDER_INVOICE_SELECT =
  "id, order_id, user_id, provider, provider_invoice_id, invoice_number, status, hosted_invoice_url, pdf_url, metadata, issued_at, created_at, updated_at";

export function effectivePriceCents(product: StoreProductRecord): number {
  const discountPercent = Math.min(
    Math.max(product.discount_percent ?? 0, 0),
    100,
  );
  return Math.max(
    0,
    Math.round(product.price_cents * ((100 - discountPercent) / 100)),
  );
}

export function chooseLicensePlatform(
  platforms: string[] | null | undefined,
): string {
  const firstPlatform = platforms?.find(
    (platform) => typeof platform === "string" && platform,
  );
  return firstPlatform ?? "pc";
}

function createLicenseKey(
  productId: string,
  platform: string,
  deviceId: string | null,
): string {
  const licenseKey = createStoreLicenseKey({
    allowUnsignedFallback:
      Deno.env.get("OGL_LICENSE_ALLOW_UNSIGNED_FALLBACK") === "true",
    deviceId,
    platform,
    productId,
    signingKey: Deno.env.get("OGL_LICENSE_SIGNING_KEY"),
  });
  if (licenseKey.mode === "unsigned_staging") {
    console.warn(
      `Issuing unsigned staging store license key because ${licenseKey.reason}`,
    );
  }

  return licenseKey.key;
}

export async function issueStoreLicenses(
  userId: string,
  orderId: string,
  products: StoreProductRecord[],
  deviceId?: string | null,
): Promise<void> {
  if (products.length === 0) return;

  const productIds = products.map((product) => product.id);
  const expectedLicenseKeys = new Set(
    products.map((product) =>
      `${product.id}:${chooseLicensePlatform(product.platforms)}`
    ),
  );
  const { data: existingLicenses, error: licenseReadError } =
    await supabaseAdmin
      .from("store_licenses")
      .select("product_id, platform")
      .eq("user_id", userId)
      .eq("is_revoked", false)
      .in("product_id", productIds);

  if (licenseReadError) {
    throw new Error(
      `Failed to read existing licenses: ${licenseReadError.message}`,
    );
  }

  const existingKeys = new Set(
    (existingLicenses ?? []).map(
      (license) => `${license.product_id}:${license.platform}`,
    ),
  );
  const licenseDeviceId = cleanStoreLicenseDeviceId(deviceId);
  const rows = [];
  for (const product of products) {
    const platform = chooseLicensePlatform(product.platforms);
    if (existingKeys.has(`${product.id}:${platform}`)) {
      continue;
    }
    const row = {
      user_id: userId,
      product_id: product.id,
      order_id: orderId,
      license_key: await createLicenseKey(
        product.id,
        platform,
        licenseDeviceId,
      ),
      platform,
      device_id: licenseDeviceId,
      activations_left: 3,
    };
    rows.push(row);
  }

  if (rows.length === 0) return;

  const { error: insertError } = await supabaseAdmin
    .from("store_licenses")
    .insert(rows);
  if (insertError) {
    if (insertError.code === "23505") {
      const { data: refreshedLicenses, error: refreshError } =
        await supabaseAdmin
          .from("store_licenses")
          .select("product_id, platform")
          .eq("user_id", userId)
          .eq("is_revoked", false)
          .in("product_id", productIds);

      if (refreshError) {
        throw new Error(
          `Failed to read existing licenses after conflict: ${refreshError.message}`,
        );
      }

      const refreshedKeys = new Set(
        (refreshedLicenses ?? []).map(
          (license) => `${license.product_id}:${license.platform}`,
        ),
      );
      const hasExpectedLicenses = [...expectedLicenseKeys].every((key) =>
        refreshedKeys.has(key)
      );
      if (hasExpectedLicenses) return;
    }

    throw new Error(`Failed to issue licenses: ${insertError.message}`);
  }
}

function asRecordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(
  value: Record<string, unknown> | null,
  key: string,
): string | null {
  const field = value?.[key];
  return typeof field === "string" && field.trim().length > 0
    ? field.trim()
    : null;
}

function readNumber(
  value: Record<string, unknown> | null,
  key: string,
): number | null {
  const field = value?.[key];
  return typeof field === "number" && Number.isFinite(field) ? field : null;
}

function stripeObjectId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return readString(asRecordValue(value), "id");
}

function unixSecondsToIso(value: number | null): string | null {
  return value === null ? null : new Date(value * 1000).toISOString();
}

function stripeInvoiceStatus(
  invoice: Record<string, unknown>,
): "available" | "pending" | "void" {
  const status = readString(invoice, "status");
  if (status === "void") return "void";
  return readString(invoice, "invoice_pdf") ||
      readString(invoice, "hosted_invoice_url")
    ? "available"
    : "pending";
}

async function retrieveStripeInvoice(
  value: unknown,
): Promise<Record<string, unknown> | null> {
  const invoiceObject = asRecordValue(value);
  if (invoiceObject) return invoiceObject;

  const invoiceId = stripeObjectId(value);
  if (!invoiceId) return null;

  const invoice = await stripe.invoices.retrieve(invoiceId);
  return asRecordValue(invoice);
}

async function getExistingStoreInvoice(orderId: string) {
  const { data, error } = await supabaseAdmin
    .from("store_order_invoices")
    .select(STORE_ORDER_INVOICE_SELECT)
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read store invoice: ${error.message}`);
  }

  return data;
}

async function getExistingStoreInvoiceByProviderInvoiceId(invoiceId: string) {
  const { data, error } = await supabaseAdmin
    .from("store_order_invoices")
    .select(STORE_ORDER_INVOICE_SELECT)
    .eq("provider", "stripe")
    .eq("provider_invoice_id", invoiceId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to read store invoice by provider id: ${error.message}`,
    );
  }

  return data;
}

async function readStoreOrderPaymentRecord(
  orderId: string,
): Promise<StoreOrderPaymentRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("store_orders")
    .select(
      "id, user_id, stripe_session_id, stripe_payment_intent, status, total_cents",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to read store order for invoice sync: ${error.message}`,
    );
  }

  return data as StoreOrderPaymentRecord | null;
}

async function readStoreOrderPaymentRecordByPaymentIntent(
  paymentIntentId: string,
): Promise<StoreOrderPaymentRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("store_orders")
    .select(
      "id, user_id, stripe_session_id, stripe_payment_intent, status, total_cents",
    )
    .eq("stripe_payment_intent", paymentIntentId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to read store order for refund payment intent: ${error.message}`,
    );
  }

  return data as StoreOrderPaymentRecord | null;
}

async function readStoreOrderPaymentRecordByProviderRefund(
  refundId: string,
): Promise<StoreOrderPaymentRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("store_order_refund_requests")
    .select("order_id")
    .eq("provider", "stripe")
    .eq("provider_refund_id", refundId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to read store refund by provider id: ${error.message}`,
    );
  }

  return data?.order_id
    ? await readStoreOrderPaymentRecord(data.order_id)
    : null;
}

async function readStoreOrderPaymentRecordForRefund(
  refundId: string,
  orderId: string | null,
  paymentIntentId: string | null,
): Promise<StoreOrderPaymentRecord | null> {
  let metadataOrder: StoreOrderPaymentRecord | null = null;
  if (orderId) {
    metadataOrder = await readStoreOrderPaymentRecord(orderId);
  }

  if (paymentIntentId) {
    if (metadataOrder?.stripe_payment_intent === paymentIntentId) {
      return metadataOrder;
    }
    if (
      metadataOrder?.stripe_payment_intent &&
      metadataOrder.stripe_payment_intent !== paymentIntentId
    ) {
      throw new Error("Stripe refund order payment intent mismatch");
    }
    const paymentIntentOrder = await readStoreOrderPaymentRecordByPaymentIntent(
      paymentIntentId,
    );
    if (
      metadataOrder && paymentIntentOrder &&
      metadataOrder.id !== paymentIntentOrder.id
    ) {
      throw new Error("Stripe refund order metadata mismatch");
    }
    if (paymentIntentOrder) return paymentIntentOrder;
  }

  if (metadataOrder) return metadataOrder;
  return await readStoreOrderPaymentRecordByProviderRefund(refundId);
}

async function updateOrderPaymentIntentIfNeeded(
  order: StoreOrderPaymentRecord,
  paymentIntentId: string | null,
  updatedAt: string,
): Promise<void> {
  if (!paymentIntentId || paymentIntentId === order.stripe_payment_intent) {
    return;
  }

  await supabaseAdmin
    .from("store_orders")
    .update({ stripe_payment_intent: paymentIntentId, updated_at: updatedAt })
    .eq("id", order.id);
}

async function upsertStripeInvoiceForOrder(
  order: StoreOrderPaymentRecord,
  invoice: Record<string, unknown>,
  syncSource: string,
  paymentIntentId: string | null,
) {
  const now = new Date().toISOString();
  const statusTransitions = asRecordValue(invoice.status_transitions);
  const issuedAt =
    unixSecondsToIso(readNumber(statusTransitions, "finalized_at")) ??
      unixSecondsToIso(readNumber(invoice, "created"));
  const invoiceId = readString(invoice, "id");
  const { data, error } = await supabaseAdmin
    .from("store_order_invoices")
    .upsert(
      {
        order_id: order.id,
        user_id: order.user_id,
        provider: "stripe",
        provider_invoice_id: invoiceId,
        invoice_number: readString(invoice, "number"),
        status: stripeInvoiceStatus(invoice),
        hosted_invoice_url: readString(invoice, "hosted_invoice_url"),
        pdf_url: readString(invoice, "invoice_pdf"),
        metadata: {
          stripe_invoice_id: invoiceId,
          stripe_invoice_status: readString(invoice, "status"),
          stripe_payment_intent: paymentIntentId,
          stripe_session_id: order.stripe_session_id,
          sync_source: syncSource,
          synced_at: now,
        },
        issued_at: issuedAt,
        updated_at: now,
      },
      { onConflict: "order_id" },
    )
    .select(STORE_ORDER_INVOICE_SELECT)
    .single();

  if (error) {
    throw new Error(`Failed to sync store invoice: ${error.message}`);
  }
  return data;
}

export async function resolveStripePaymentIntentIdForOrder(
  order: StoreOrderPaymentRecord,
): Promise<string | null> {
  if (order.stripe_payment_intent) return order.stripe_payment_intent;
  if (!order.stripe_session_id) return null;

  const session = asRecordValue(
    await stripe.checkout.sessions.retrieve(order.stripe_session_id, {
      expand: ["payment_intent"],
    }),
  );
  const paymentIntentId = stripeObjectId(session?.payment_intent);
  if (!paymentIntentId) return null;

  await supabaseAdmin
    .from("store_orders")
    .update({
      stripe_payment_intent: paymentIntentId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  return paymentIntentId;
}

export async function syncStoreInvoiceFromStripeInvoice(
  invoiceValue: unknown,
  syncSource = "invoice_webhook",
) {
  const invoice = asRecordValue(invoiceValue);
  if (!invoice) return null;

  const invoiceId = readString(invoice, "id");
  const metadata = asRecordValue(invoice.metadata);
  const existing = invoiceId === null
    ? null
    : await getExistingStoreInvoiceByProviderInvoiceId(invoiceId);
  const orderId = readString(metadata, "order_id") ?? existing?.order_id;
  if (!orderId) return null;

  const order = await readStoreOrderPaymentRecord(orderId);
  if (!order) return null;

  const now = new Date().toISOString();
  const paymentIntentId = stripeObjectId(invoice.payment_intent) ??
    order.stripe_payment_intent;
  await updateOrderPaymentIntentIfNeeded(order, paymentIntentId, now);

  return await upsertStripeInvoiceForOrder(
    order,
    invoice,
    syncSource,
    paymentIntentId,
  );
}

export async function syncStripeInvoiceForOrder(
  order: StoreOrderPaymentRecord,
  syncSource = "manual",
) {
  const now = new Date().toISOString();
  let invoice: Record<string, unknown> | null = null;
  let checkoutSession: Record<string, unknown> | null = null;
  let paymentIntent: Record<string, unknown> | null = null;
  let paymentIntentId = order.stripe_payment_intent;
  let receiptUrl: string | null = null;

  if (order.stripe_session_id) {
    checkoutSession = asRecordValue(
      await stripe.checkout.sessions.retrieve(order.stripe_session_id, {
        expand: ["invoice", "payment_intent"],
      }),
    );
    paymentIntentId = stripeObjectId(checkoutSession?.payment_intent) ??
      paymentIntentId;
    invoice = await retrieveStripeInvoice(checkoutSession?.invoice);
  }

  if (!invoice && paymentIntentId) {
    paymentIntent = asRecordValue(
      await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ["latest_charge"],
      }),
    );
    invoice = await retrieveStripeInvoice(paymentIntent?.invoice);
    const latestCharge = asRecordValue(paymentIntent?.latest_charge);
    receiptUrl = readString(latestCharge, "receipt_url");
  }

  await updateOrderPaymentIntentIfNeeded(order, paymentIntentId, now);

  if (!invoice) {
    const existing = await getExistingStoreInvoice(order.id);
    if (
      existing?.status === "available" &&
      (existing.pdf_url || existing.hosted_invoice_url)
    ) {
      return existing;
    }

    const status =
      order.status && ["paid", "fulfilled", "refunded"].includes(order.status)
        ? "unavailable"
        : "pending";
    const { data, error } = await supabaseAdmin
      .from("store_order_invoices")
      .upsert(
        {
          order_id: order.id,
          user_id: order.user_id,
          provider: "stripe",
          provider_invoice_id: null,
          invoice_number: null,
          status,
          hosted_invoice_url: null,
          pdf_url: null,
          metadata: {
            receipt_url: receiptUrl,
            stripe_payment_intent: paymentIntentId,
            stripe_session_id: order.stripe_session_id,
            sync_source: syncSource,
            synced_at: now,
            unavailable_reason: "stripe_checkout_invoice_missing",
          },
          issued_at: null,
          updated_at: now,
        },
        { onConflict: "order_id" },
      )
      .select(STORE_ORDER_INVOICE_SELECT)
      .single();

    if (error) {
      throw new Error(
        `Failed to stage unavailable store invoice: ${error.message}`,
      );
    }
    return data;
  }

  return await upsertStripeInvoiceForOrder(
    order,
    invoice,
    syncSource,
    paymentIntentId,
  );
}

export async function revokeStoreOrderLicenses(
  userId: string,
  orderId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("store_licenses")
    .update({ is_revoked: true })
    .eq("user_id", userId)
    .eq("order_id", orderId)
    .eq("is_revoked", false);

  if (error) {
    throw new Error(`Failed to revoke store licenses: ${error.message}`);
  }
}

export async function markStoreOrderRefunded(
  orderId: string,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("store_orders")
    .update({ status: "refunded", updated_at: now })
    .eq("id", orderId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to mark store order refunded: ${error.message}`);
  }

  await revokeStoreOrderLicenses(userId, orderId);
}

function refundRequestStatus(providerStatus: string | null) {
  if (providerStatus === "succeeded") return "processed";
  if (providerStatus === "canceled") return "cancelled";
  if (providerStatus === "failed") return "rejected";
  return "approved";
}

export async function syncStoreRefundFromStripeRefund(
  refundValue: unknown,
): Promise<void> {
  const refund = asRecordValue(refundValue);
  if (!refund) return;

  const refundId = readString(refund, "id");
  const providerStatus = readString(refund, "status");
  const metadata = asRecordValue(refund.metadata);
  const orderId = readString(metadata, "order_id");
  const paymentIntentId = stripeObjectId(refund.payment_intent);
  if (!refundId) return;

  const order = await readStoreOrderPaymentRecordForRefund(
    refundId,
    orderId,
    paymentIntentId,
  );
  if (!order) return;

  const now = new Date().toISOString();
  const status = refundRequestStatus(providerStatus);
  const refundAmount = readNumber(refund, "amount");
  const update: Record<string, unknown> = {
    provider: "stripe",
    provider_refund_id: refundId,
    provider_refund_status: providerStatus,
    refund_amount_cents: refundAmount,
    failure_reason: readString(refund, "failure_reason"),
    status,
    reviewed_at: now,
    updated_at: now,
    metadata: {
      stripe_charge: stripeObjectId(refund.charge),
      stripe_payment_intent: paymentIntentId,
      stripe_refund_id: refundId,
      stripe_refund_status: providerStatus,
      synced_at: now,
    },
  };

  if (status === "processed") {
    update.processed_at = now;
  } else if (status === "cancelled") {
    update.cancelled_at = now;
  }

  const { data: existingRefund, error: existingRefundError } =
    await supabaseAdmin
      .from("store_order_refund_requests")
      .select("id")
      .eq("order_id", order.id)
      .maybeSingle();

  if (existingRefundError) {
    throw new Error(
      `Failed to read store refund request: ${existingRefundError.message}`,
    );
  }

  const refundWrite = existingRefund
    ? supabaseAdmin
      .from("store_order_refund_requests")
      .update(update)
      .eq("id", existingRefund.id)
    : supabaseAdmin.from("store_order_refund_requests").insert({
      ...update,
      details: null,
      order_id: order.id,
      reason: "stripe_webhook",
      requested_at: now,
      user_id: order.user_id,
    });

  const { data: syncedRefund, error: refundError } = await refundWrite
    .select("id")
    .single();

  if (refundError) {
    throw new Error(`Failed to sync Stripe refund: ${refundError.message}`);
  }
  if (!syncedRefund) {
    throw new Error("Stripe refund sync did not persist a refund row");
  }

  if (status === "processed") {
    await markStoreOrderRefunded(order.id, order.user_id);
  }
}
