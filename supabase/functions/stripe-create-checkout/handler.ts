import { corsHeaders } from "../_shared/cors.ts";
import {
  cleanStoreLicenseDeviceId,
  planStoreLicenseSigning,
  StoreLicenseConfigError,
} from "../_shared/store-license.ts";
import {
  buildStoreCheckoutIdempotencyKey,
  buildStoreCheckoutSessionParams,
  cleanStoreCheckoutAttemptId,
} from "../_shared/store-stripe.ts";

export type StripeCheckoutProductRecord = {
  discount_percent: number;
  id: string;
  platforms: string[] | null;
  price_cents: number;
  title: string;
};

export type StripeCheckoutOrder = {
  id: string;
  status?: string | null;
  stripe_session_id?: string | null;
};

export type StripeCheckoutOrderItem = {
  price_cents_snapshot: number;
  product_id: string;
  quantity: 1;
  title_snapshot: string;
};

export type StripeCheckoutSessionParams = ReturnType<
  typeof buildStoreCheckoutSessionParams
>;

export type StripeCheckoutSession = {
  id: string;
  payment_intent?: unknown;
  url: string | null;
};

export type StripeCheckoutAuthResult =
  | { status: "ok"; userId: string }
  | { status: "missing" }
  | { status: "invalid" };

export type StripeCheckoutCreateOrderResult =
  | { order: StripeCheckoutOrder; status: "created" }
  | { errorMessage: string; status: "duplicate_attempt" };

export interface StripeCreateCheckoutHandlerDeps {
  attachStripeSessionToOrder: (
    orderId: string,
    input: { paymentIntentId: string | null; sessionId: string },
  ) => Promise<void>;
  checkoutUrlFallback: string;
  createCheckoutSession: (
    params: StripeCheckoutSessionParams,
    options: { idempotencyKey: string },
  ) => Promise<StripeCheckoutSession>;
  createOrder: (input: {
    checkoutAttemptId: string;
    subtotalCents: number;
    userId: string;
  }) => Promise<StripeCheckoutCreateOrderResult>;
  createOrderItems: (
    orderId: string,
    items: StripeCheckoutOrderItem[],
  ) => Promise<void>;
  createOrRetrieveCustomer: (userId: string) => Promise<string>;
  authenticateRequest: (request: Request) => Promise<StripeCheckoutAuthResult>;
  deleteCartItems: (userId: string, productIds: string[]) => Promise<void>;
  getLicenseSigningConfig: () => {
    allowUnsignedFallback: boolean;
    signingKey?: string | null;
  };
  issueStoreLicenses: (
    userId: string,
    orderId: string,
    products: StripeCheckoutProductRecord[],
    deviceId: string | null,
  ) => Promise<void>;
  logError?: (message: string, error: unknown) => void;
  markFreeOrderFulfilled: (orderId: string) => Promise<void>;
  markOrderFailed: (orderId: string) => Promise<void>;
  readExistingCheckoutAttempt: (
    userId: string,
    checkoutAttemptId: string,
  ) => Promise<StripeCheckoutOrder | null>;
  readOwnedProductIds: (
    userId: string,
    productIds: string[],
  ) => Promise<string[]>;
  readProducts: (
    productIds: string[],
  ) => Promise<StripeCheckoutProductRecord[]>;
  retrieveCheckoutSession: (
    sessionId: string,
  ) => Promise<StripeCheckoutSession>;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function handleStripeCreateCheckout(
  request: Request,
  deps: StripeCreateCheckoutHandlerDeps,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authResult = await deps.authenticateRequest(request);
    if (authResult.status === "missing") {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }
    if (authResult.status === "invalid") {
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }
    const userId = authResult.userId;

    const {
      product_ids,
      success_url,
      cancel_url,
      device_id,
      checkout_attempt_id,
    } = await request.json().catch(() => ({}));
    const productIds = readProductIds(product_ids);
    const checkoutAttemptId = cleanStoreCheckoutAttemptId(
      checkout_attempt_id,
    );
    const licenseDeviceId = typeof device_id === "string"
      ? cleanStoreLicenseDeviceId(device_id)
      : null;

    if (productIds.length === 0) {
      return jsonResponse(
        {
          error:
            "product_ids is required and must contain at least one product id",
        },
        400,
      );
    }

    if (productIds.length > 20) {
      return jsonResponse(
        { error: "A checkout can contain at most 20 products" },
        400,
      );
    }

    if (!checkoutAttemptId) {
      return jsonResponse({ error: "checkout_attempt_id must be a UUID" }, 400);
    }

    const products = await deps.readProducts(productIds);
    if (products.length !== productIds.length) {
      return jsonResponse(
        { error: "One or more products are unavailable" },
        400,
      );
    }

    const ownedProductIds = new Set(
      await deps.readOwnedProductIds(userId, productIds),
    );
    const purchasableProducts = products.filter(
      (product) => !ownedProductIds.has(product.id),
    );

    if (purchasableProducts.length === 0) {
      return jsonResponse(
        { error: "All requested products are already in your library" },
        409,
      );
    }

    try {
      planStoreLicenseSigning({
        ...deps.getLicenseSigningConfig(),
        deviceId: licenseDeviceId,
      });
    } catch (error) {
      if (
        error instanceof StoreLicenseConfigError &&
        error.reason === "missing_device_id"
      ) {
        return jsonResponse({ error: error.message }, 400);
      }
      throw error;
    }

    const orderItems = purchasableProducts.map((product) => ({
      price_cents_snapshot: effectivePriceCents(product),
      product_id: product.id,
      quantity: 1 as const,
      title_snapshot: product.title,
    }));
    const subtotalCents = orderItems.reduce(
      (total, item) => total + item.price_cents_snapshot * item.quantity,
      0,
    );

    const orderResult = await deps.createOrder({
      checkoutAttemptId,
      subtotalCents,
      userId,
    });
    if (orderResult.status === "duplicate_attempt") {
      const existingOrder = await deps.readExistingCheckoutAttempt(
        userId,
        checkoutAttemptId,
      );
      if (existingOrder) {
        return await checkoutAttemptResponse(existingOrder, deps);
      }
      throw new Error(
        `Failed to create store order: ${orderResult.errorMessage}`,
      );
    }

    const order = orderResult.order;
    try {
      await deps.createOrderItems(order.id, orderItems);
    } catch (error) {
      await deps.markOrderFailed(order.id);
      throw error instanceof Error
        ? new Error(`Failed to create order items: ${error.message}`)
        : error;
    }

    if (subtotalCents === 0) {
      try {
        await deps.issueStoreLicenses(
          userId,
          order.id,
          purchasableProducts,
          licenseDeviceId,
        );
        await deps.markFreeOrderFulfilled(order.id);
      } catch (error) {
        await deps.markOrderFailed(order.id);
        throw error;
      }
      await deps.deleteCartItems(
        userId,
        purchasableProducts.map((product) => product.id),
      );

      return jsonResponse({
        id: null,
        order_id: order.id,
        status: "fulfilled",
        url: null,
      });
    }

    const origin = request.headers.get("origin") ?? deps.checkoutUrlFallback;
    const successUrl = checkoutRedirectUrl(
      success_url,
      origin,
      "/store?tab=orders&session_id={CHECKOUT_SESSION_ID}",
    );
    const cancelUrl = checkoutRedirectUrl(
      cancel_url,
      origin,
      "/store?tab=browse",
    );
    const customer = await deps.createOrRetrieveCustomer(userId);
    const paidProducts = purchasableProducts.filter(
      (product) => effectivePriceCents(product) > 0,
    );
    const sessionParams = {
      ...buildStoreCheckoutSessionParams({
        cancelUrl,
        customer,
        deviceId: licenseDeviceId,
        orderId: order.id,
        products: paidProducts,
        successUrl,
        userId,
      }),
      // Stripe-hosted Checkout can use Dashboard-enabled dynamic payment methods.
      // The spread above stays pure/testable for staging contract tests.
    };
    let session;
    try {
      session = await deps.createCheckoutSession(
        sessionParams,
        {
          idempotencyKey: buildStoreCheckoutIdempotencyKey({
            checkoutAttemptId,
            userId,
          }),
        },
      );
    } catch (error) {
      await deps.markOrderFailed(order.id);
      throw error;
    }

    try {
      await deps.attachStripeSessionToOrder(order.id, {
        paymentIntentId: readStripePaymentIntentId(session.payment_intent),
        sessionId: session.id,
      });
    } catch (error) {
      await deps.markOrderFailed(order.id);
      throw error instanceof Error
        ? new Error(
          `Failed to attach Stripe session to order: ${error.message}`,
        )
        : error;
    }

    return jsonResponse({
      id: session.id,
      order_id: order.id,
      url: session.url,
    });
  } catch (error) {
    if (deps.logError) {
      deps.logError("Stripe checkout error:", error);
    } else {
      console.error("Stripe checkout error:", error);
    }
    return jsonResponse(
      { error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
}

async function checkoutAttemptResponse(
  order: StripeCheckoutOrder,
  deps: StripeCreateCheckoutHandlerDeps,
): Promise<Response> {
  if (order.stripe_session_id) {
    const session = await deps.retrieveCheckoutSession(order.stripe_session_id);
    return jsonResponse({
      id: session.id,
      order_id: order.id,
      status: order.status ?? "pending",
      url: session.url,
    });
  }

  return jsonResponse({
    id: null,
    order_id: order.id,
    status: order.status ?? "pending",
    url: null,
  });
}

function readProductIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter(
        (item): item is string =>
          typeof item === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
            .test(item),
      ),
    ),
  );
}

function checkoutRedirectUrl(
  value: unknown,
  origin: string,
  fallbackPath: string,
): string {
  const fallback = `${origin}${fallbackPath}`;
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }

  try {
    const parsed = new URL(value);
    if (parsed.origin === origin) {
      return value;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function effectivePriceCents(product: StripeCheckoutProductRecord): number {
  const discountPercent = Math.min(
    Math.max(product.discount_percent ?? 0, 0),
    100,
  );
  return Math.max(
    0,
    Math.round(product.price_cents * ((100 - discountPercent) / 100)),
  );
}

function readStripePaymentIntentId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = (value as Record<string, unknown>).id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}
