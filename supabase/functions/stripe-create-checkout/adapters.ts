import type {
  StripeCheckoutAuthResult,
  StripeCheckoutCreateOrderResult,
  StripeCheckoutOrder,
  StripeCheckoutOrderItem,
  StripeCheckoutProductRecord,
  StripeCheckoutSession,
  StripeCheckoutSessionParams,
  StripeCreateCheckoutHandlerDeps,
} from "./handler.ts";

type SupabaseQueryResult<T> = {
  data: T | null;
  error: { code?: string; message?: string } | null;
};

type SupabaseTableClient = {
  delete: () => SupabaseTableClient;
  eq: (column: string, value: unknown) => SupabaseTableClient;
  in: (column: string, values: unknown[]) => SupabaseTableClient;
  insert: (value: unknown) => SupabaseTableClient;
  maybeSingle: () => Promise<SupabaseQueryResult<unknown>>;
  select: (columns: string) => SupabaseTableClient;
  single: () => Promise<SupabaseQueryResult<unknown>>;
  then: PromiseLike<SupabaseQueryResult<unknown>>["then"];
  update: (value: unknown) => SupabaseTableClient;
};

type SupabaseAdminClient = {
  from: (table: string) => unknown;
};

type CallerClient = {
  auth: {
    getUser: () => Promise<{
      data?: { user?: { id?: string } | null } | null;
      error?: unknown;
    }>;
  };
};

type StripeCheckoutClient = {
  checkout: {
    sessions: {
      create: (
        params: StripeCheckoutSessionParams,
        options: { idempotencyKey: string },
      ) => Promise<StripeCheckoutSession>;
      retrieve: (sessionId: string) => Promise<StripeCheckoutSession>;
    };
  };
};

export type StripeCreateCheckoutAdapterDeps = {
  createClient: (
    supabaseUrl: string,
    supabaseAnonKey: string,
    options: {
      auth: { persistSession: false };
      global: { headers: { Authorization: string } };
    },
  ) => CallerClient;
  stripe: StripeCheckoutClient;
  supabaseAdmin: SupabaseAdminClient;
  supabaseAnonKey: string;
  supabaseUrl: string;
};

export type StripeCreateCheckoutAdapters = Pick<
  StripeCreateCheckoutHandlerDeps,
  | "attachStripeSessionToOrder"
  | "authenticateRequest"
  | "createCheckoutSession"
  | "createOrder"
  | "createOrderItems"
  | "deleteCartItems"
  | "markFreeOrderFulfilled"
  | "markOrderFailed"
  | "readExistingCheckoutAttempt"
  | "readOwnedProductIds"
  | "readProducts"
  | "retrieveCheckoutSession"
>;

export function createStripeCreateCheckoutAdapters(
  deps: StripeCreateCheckoutAdapterDeps,
): StripeCreateCheckoutAdapters {
  return {
    attachStripeSessionToOrder: (orderId, input) =>
      attachStripeSessionToOrder(deps.supabaseAdmin, orderId, input),
    authenticateRequest: (request) => authenticateRequest(deps, request),
    createCheckoutSession: (params, options) =>
      createCheckoutSession(deps.stripe, params, options),
    createOrder: (input) => createOrder(deps.supabaseAdmin, input),
    createOrderItems: (orderId, items) =>
      createOrderItems(deps.supabaseAdmin, orderId, items),
    deleteCartItems: (userId, productIds) =>
      deleteCartItems(deps.supabaseAdmin, userId, productIds),
    markFreeOrderFulfilled: (orderId) =>
      markFreeOrderFulfilled(deps.supabaseAdmin, orderId),
    markOrderFailed: (orderId) => markOrderFailed(deps.supabaseAdmin, orderId),
    readExistingCheckoutAttempt: (userId, checkoutAttemptId) =>
      readExistingCheckoutAttempt(
        deps.supabaseAdmin,
        userId,
        checkoutAttemptId,
      ),
    readOwnedProductIds: (userId, productIds) =>
      readOwnedProductIds(deps.supabaseAdmin, userId, productIds),
    readProducts: (productIds) => readProducts(deps.supabaseAdmin, productIds),
    retrieveCheckoutSession: (sessionId) =>
      retrieveCheckoutSession(deps.stripe, sessionId),
  };
}

async function authenticateRequest(
  deps: Pick<
    StripeCreateCheckoutAdapterDeps,
    "createClient" | "supabaseAnonKey" | "supabaseUrl"
  >,
  request: Request,
): Promise<StripeCheckoutAuthResult> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return { status: "missing" };
  }

  const callerClient = deps.createClient(
    deps.supabaseUrl,
    deps.supabaseAnonKey,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    },
  );
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data?.user?.id) {
    return { status: "invalid" };
  }

  return { status: "ok", userId: data.user.id };
}

async function readProducts(
  supabaseAdmin: SupabaseAdminClient,
  productIds: string[],
): Promise<StripeCheckoutProductRecord[]> {
  const { data, error } = await tableClient(supabaseAdmin, "store_products")
    .select("id, title, platforms, price_cents, discount_percent")
    .eq("status", "published")
    .in("id", productIds);

  if (error) {
    throw new Error(`Failed to read store products: ${error.message}`);
  }

  return (data ?? []) as StripeCheckoutProductRecord[];
}

async function readOwnedProductIds(
  supabaseAdmin: SupabaseAdminClient,
  userId: string,
  productIds: string[],
): Promise<string[]> {
  const { data, error } = await tableClient(supabaseAdmin, "store_licenses")
    .select("product_id")
    .eq("user_id", userId)
    .eq("is_revoked", false)
    .in("product_id", productIds);

  if (error) {
    throw new Error(`Failed to read owned licenses: ${error.message}`);
  }

  return ((data ?? []) as Array<{ product_id: string }>).map((license) =>
    license.product_id
  );
}

async function createOrder(
  supabaseAdmin: SupabaseAdminClient,
  input: {
    checkoutAttemptId: string;
    subtotalCents: number;
    userId: string;
  },
): Promise<StripeCheckoutCreateOrderResult> {
  const { data, error } = await tableClient(supabaseAdmin, "store_orders")
    .insert({
      checkout_attempt_id: input.checkoutAttemptId,
      currency: "eur",
      paid_at: null,
      payment_method: input.subtotalCents === 0 ? "free" : null,
      status: "pending",
      subtotal_cents: input.subtotalCents,
      tax_cents: 0,
      total_cents: input.subtotalCents,
      user_id: input.userId,
    })
    .select("id, stripe_session_id, status")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return {
        errorMessage: error.message ??
          "duplicate key value violates constraint",
        status: "duplicate_attempt",
      };
    }
    throw new Error(
      `Failed to create store order: ${error?.message ?? "unknown error"}`,
    );
  }

  return { order: data as StripeCheckoutOrder, status: "created" };
}

async function readExistingCheckoutAttempt(
  supabaseAdmin: SupabaseAdminClient,
  userId: string,
  checkoutAttemptId: string,
): Promise<StripeCheckoutOrder | null> {
  const { data, error } = await tableClient(supabaseAdmin, "store_orders")
    .select("id, stripe_session_id, status")
    .eq("checkout_attempt_id", checkoutAttemptId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to read existing checkout attempt: ${error.message}`,
    );
  }

  return data as StripeCheckoutOrder | null;
}

async function retrieveCheckoutSession(
  stripe: StripeCheckoutClient,
  sessionId: string,
): Promise<StripeCheckoutSession> {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return checkoutSessionResponse(session);
}

async function createOrderItems(
  supabaseAdmin: SupabaseAdminClient,
  orderId: string,
  items: StripeCheckoutOrderItem[],
): Promise<void> {
  const { error } = await tableClient(supabaseAdmin, "store_order_items")
    .insert(items.map((item) => ({ ...item, order_id: orderId })));

  if (error) {
    throw new Error(error.message);
  }
}

async function markOrderFailed(
  supabaseAdmin: SupabaseAdminClient,
  orderId: string,
): Promise<void> {
  await tableClient(supabaseAdmin, "store_orders")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("id", orderId);
}

async function markFreeOrderFulfilled(
  supabaseAdmin: SupabaseAdminClient,
  orderId: string,
): Promise<void> {
  const { error } = await tableClient(supabaseAdmin, "store_orders")
    .update({
      paid_at: new Date().toISOString(),
      status: "fulfilled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (error) {
    throw new Error(`Failed to mark free order fulfilled: ${error.message}`);
  }
}

async function deleteCartItems(
  supabaseAdmin: SupabaseAdminClient,
  userId: string,
  productIds: string[],
): Promise<void> {
  await tableClient(supabaseAdmin, "store_cart_items")
    .delete()
    .eq("user_id", userId)
    .in("product_id", productIds);
}

async function createCheckoutSession(
  stripe: StripeCheckoutClient,
  params: StripeCheckoutSessionParams,
  options: { idempotencyKey: string },
): Promise<StripeCheckoutSession> {
  const session = await stripe.checkout.sessions.create(params, options);
  return checkoutSessionResponse(session);
}

async function attachStripeSessionToOrder(
  supabaseAdmin: SupabaseAdminClient,
  orderId: string,
  input: { paymentIntentId: string | null; sessionId: string },
): Promise<void> {
  const { error } = await tableClient(supabaseAdmin, "store_orders")
    .update({
      stripe_payment_intent: input.paymentIntentId,
      stripe_session_id: input.sessionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (error) {
    throw new Error(error.message);
  }
}

function checkoutSessionResponse(session: StripeCheckoutSession) {
  return {
    id: session.id,
    payment_intent: session.payment_intent,
    url: session.url,
  };
}

function tableClient(
  supabaseAdmin: SupabaseAdminClient,
  table: string,
): SupabaseTableClient {
  return supabaseAdmin.from(table) as SupabaseTableClient;
}
