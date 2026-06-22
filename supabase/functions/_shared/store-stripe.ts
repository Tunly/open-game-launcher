export interface StoreCheckoutSessionParamsInput {
  cancelUrl: string;
  customer: string;
  deviceId: string | null;
  orderId: string;
  products: StoreCheckoutProductRecord[];
  successUrl: string;
  userId: string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface StoreCheckoutProductRecord {
  id: string;
  price_cents: number;
  discount_percent: number;
  title: string;
}

export interface StoreCheckoutPaymentSnapshot {
  currency: string | null;
  stripePaymentIntent: string | null;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
}

interface StoreCheckoutSessionParams {
  automatic_tax: { enabled: true };
  billing_address_collection: "required";
  cancel_url: string;
  client_reference_id: string;
  customer: string;
  customer_update: {
    address: "auto";
    name: "auto";
  };
  invoice_creation: {
    enabled: true;
    invoice_data: {
      description: string;
      metadata: StoreCheckoutMetadata;
    };
  };
  line_items: Array<{
    price_data: {
      currency: "eur";
      product_data: {
        metadata: { product_id: string };
        name: string;
      };
      tax_behavior: "exclusive";
      unit_amount: number;
    };
    quantity: 1;
  }>;
  metadata: StoreCheckoutMetadata;
  mode: "payment";
  payment_intent_data: {
    metadata: StoreCheckoutMetadata;
  };
  success_url: string;
  tax_id_collection: { enabled: true };
}

interface StoreCheckoutMetadata {
  device_id?: string;
  order_id: string;
  user_id: string;
}

export function cleanStoreCheckoutAttemptId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return uuidPattern.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function buildStoreCheckoutIdempotencyKey(input: {
  checkoutAttemptId: string;
  userId: string;
}): string {
  return `store-checkout:${input.userId}:${input.checkoutAttemptId}`;
}

export function buildStoreCheckoutSessionParams(
  input: StoreCheckoutSessionParamsInput,
): StoreCheckoutSessionParams {
  const metadata = {
    order_id: input.orderId,
    user_id: input.userId,
    ...(input.deviceId ? { device_id: input.deviceId } : {}),
  };

  return {
    automatic_tax: { enabled: true },
    billing_address_collection: "required",
    cancel_url: input.cancelUrl,
    client_reference_id: input.userId,
    customer: input.customer,
    customer_update: {
      address: "auto",
      name: "auto",
    },
    invoice_creation: {
      enabled: true,
      invoice_data: {
        description: "OG-Launcher Store Order",
        metadata,
      },
    },
    line_items: input.products.map((product) => ({
      price_data: {
        currency: "eur",
        product_data: {
          metadata: { product_id: product.id },
          name: product.title,
        },
        tax_behavior: "exclusive",
        unit_amount: effectivePriceCents(product),
      },
      quantity: 1,
    })),
    metadata,
    mode: "payment",
    payment_intent_data: {
      metadata,
    },
    success_url: input.successUrl,
    tax_id_collection: { enabled: true },
  };
}

export function readCheckoutSessionPaymentSnapshot(
  session: unknown,
): StoreCheckoutPaymentSnapshot {
  const record = asRecord(session);
  const totalDetails = asRecord(record.total_details);
  return {
    currency: readString(record.currency),
    stripePaymentIntent: stripeObjectId(record.payment_intent),
    subtotalCents: readNumber(record.amount_subtotal),
    taxCents: readNumber(totalDetails.amount_tax),
    totalCents: readNumber(record.amount_total),
  };
}

export function checkoutPaymentSnapshotToOrderUpdate(
  snapshot: StoreCheckoutPaymentSnapshot,
  updatedAt: string,
): Record<string, unknown> {
  return {
    ...(snapshot.currency ? { currency: snapshot.currency } : {}),
    ...(snapshot.stripePaymentIntent
      ? { stripe_payment_intent: snapshot.stripePaymentIntent }
      : {}),
    ...(snapshot.subtotalCents !== null
      ? { subtotal_cents: snapshot.subtotalCents }
      : {}),
    ...(snapshot.taxCents !== null ? { tax_cents: snapshot.taxCents } : {}),
    ...(snapshot.totalCents !== null
      ? { total_cents: snapshot.totalCents }
      : {}),
    updated_at: updatedAt,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function stripeObjectId(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value;
  const record = asRecord(value);
  return readString(record.id);
}

function effectivePriceCents(product: StoreCheckoutProductRecord): number {
  const discountPercent = Math.min(
    Math.max(product.discount_percent ?? 0, 0),
    100,
  );
  return Math.max(
    0,
    Math.round(product.price_cents * ((100 - discountPercent) / 100)),
  );
}
