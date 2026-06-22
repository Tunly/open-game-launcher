import type { StripeRefundCreateArgs } from "./contract.ts";
import type {
  StoreOrderRow,
  StoreOrderSupportHandlerDeps,
  StoreOrderSupportState,
  StoreRefundRequestRow,
} from "./handler.ts";

const ORDER_SELECT =
  "id, user_id, stripe_session_id, stripe_payment_intent, subtotal_cents, tax_cents, total_cents, currency, status, payment_method, paid_at, created_at, updated_at";
const REFUND_REQUEST_SELECT =
  "id, order_id, user_id, reason, details, status, requested_at, reviewed_at, processed_at, cancelled_at, provider, provider_refund_id, provider_refund_status, refund_amount_cents, failure_reason, metadata, created_at, updated_at";
const INVOICE_SELECT =
  "id, order_id, user_id, provider, provider_invoice_id, invoice_number, status, hosted_invoice_url, pdf_url, metadata, issued_at, created_at, updated_at";

type SupabaseQueryResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

type SupabaseTableClient = {
  eq: (column: string, value: unknown) => SupabaseTableClient;
  maybeSingle: () => Promise<SupabaseQueryResult<unknown>>;
  select: (columns: string) => SupabaseTableClient;
  single: () => Promise<SupabaseQueryResult<unknown>>;
  then: PromiseLike<SupabaseQueryResult<unknown>>["then"];
  update: (value: unknown) => SupabaseTableClient;
  upsert: (value: unknown, options?: unknown) => SupabaseTableClient;
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

type StripeRefundClient = {
  refunds: {
    create: (
      params: StripeRefundCreateArgs["params"],
      options: StripeRefundCreateArgs["options"],
    ) => Promise<unknown>;
  };
};

export type StoreOrderSupportAdapterDeps =
  & Pick<
    StoreOrderSupportHandlerDeps,
    | "resolvePaymentIntentId"
    | "syncInvoiceForOrder"
    | "syncRefundFromStripeRefund"
  >
  & {
    createClient: (
      supabaseUrl: string,
      supabaseAnonKey: string,
      options: {
        auth: { persistSession: false };
        global: { headers: { Authorization: string } };
      },
    ) => CallerClient;
    stripe: StripeRefundClient;
    supabaseAdmin: SupabaseAdminClient;
    supabaseAnonKey: string;
    supabaseUrl: string;
  };

export type StoreOrderSupportAdapters = Omit<
  StoreOrderSupportHandlerDeps,
  "logError" | "logWarning"
>;

export function createStoreOrderSupportAdapters(
  deps: StoreOrderSupportAdapterDeps,
): StoreOrderSupportAdapters {
  return {
    createStripeRefund: (args) => createStripeRefund(deps.stripe, args),
    getUserId: (request) => getUserId(deps, request),
    readOwnedOrder: (orderId, userId) =>
      readOwnedOrder(deps.supabaseAdmin, orderId, userId),
    readRefundRequest: (orderId) =>
      readRefundRequest(deps.supabaseAdmin, orderId),
    readSupportState: (orderId, userId) =>
      readSupportState(deps.supabaseAdmin, orderId, userId),
    rejectStagedRefund: (orderId, message) =>
      rejectStagedRefund(deps.supabaseAdmin, orderId, message),
    resolvePaymentIntentId: deps.resolvePaymentIntentId,
    stageRefundRequest: (order, reason, details) =>
      stageRefundRequest(deps.supabaseAdmin, order, reason, details),
    syncInvoiceForOrder: deps.syncInvoiceForOrder,
    syncRefundFromStripeRefund: deps.syncRefundFromStripeRefund,
  };
}

async function getUserId(
  deps: Pick<
    StoreOrderSupportAdapterDeps,
    "createClient" | "supabaseAnonKey" | "supabaseUrl"
  >,
  request: Request,
): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return null;

  const callerClient = deps.createClient(
    deps.supabaseUrl,
    deps.supabaseAnonKey,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    },
  );
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

async function readOwnedOrder(
  supabaseAdmin: SupabaseAdminClient,
  orderId: string,
  userId: string,
): Promise<StoreOrderRow | null> {
  const { data, error } = await tableClient(supabaseAdmin, "store_orders")
    .select(ORDER_SELECT)
    .eq("id", orderId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read store order: ${error.message}`);
  }

  return data as StoreOrderRow | null;
}

async function readRefundRequest(
  supabaseAdmin: SupabaseAdminClient,
  orderId: string,
): Promise<StoreRefundRequestRow | null> {
  const { data, error } = await tableClient(
    supabaseAdmin,
    "store_order_refund_requests",
  )
    .select(REFUND_REQUEST_SELECT)
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read store refund request: ${error.message}`);
  }

  return data as StoreRefundRequestRow | null;
}

async function readInvoice(
  supabaseAdmin: SupabaseAdminClient,
  orderId: string,
): Promise<unknown> {
  const { data, error } = await tableClient(
    supabaseAdmin,
    "store_order_invoices",
  )
    .select(INVOICE_SELECT)
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read store invoice: ${error.message}`);
  }

  return data;
}

async function readSupportState(
  supabaseAdmin: SupabaseAdminClient,
  orderId: string,
  userId: string,
): Promise<StoreOrderSupportState> {
  const [order, refundRequest, invoice] = await Promise.all([
    readOwnedOrder(supabaseAdmin, orderId, userId),
    readRefundRequest(supabaseAdmin, orderId),
    readInvoice(supabaseAdmin, orderId),
  ]);
  return {
    invoice,
    order,
    refund_request: refundRequest,
  };
}

async function stageRefundRequest(
  supabaseAdmin: SupabaseAdminClient,
  order: StoreOrderRow,
  reason: string,
  details: string | null,
): Promise<StoreRefundRequestRow> {
  const now = new Date().toISOString();
  const { data, error } = await tableClient(
    supabaseAdmin,
    "store_order_refund_requests",
  )
    .upsert(
      {
        order_id: order.id,
        user_id: order.user_id,
        reason,
        details,
        status: "reviewing",
        provider: "stripe",
        provider_refund_status: "creating",
        refund_amount_cents: order.total_cents,
        failure_reason: null,
        metadata: {
          requested_by_user_id: order.user_id,
          self_service: true,
          staged_at: now,
        },
        updated_at: now,
      },
      { onConflict: "order_id" },
    )
    .select(REFUND_REQUEST_SELECT)
    .single();

  if (error) {
    throw new Error(`Failed to stage refund request: ${error.message}`);
  }

  return data as StoreRefundRequestRow;
}

async function rejectStagedRefund(
  supabaseAdmin: SupabaseAdminClient,
  orderId: string,
  message: string,
): Promise<void> {
  const now = new Date().toISOString();
  await tableClient(supabaseAdmin, "store_order_refund_requests")
    .update({
      failure_reason: message,
      provider_refund_status: "failed",
      reviewed_at: now,
      status: "rejected",
      updated_at: now,
    })
    .eq("order_id", orderId);
}

async function createStripeRefund(
  stripe: StripeRefundClient,
  args: StripeRefundCreateArgs,
): Promise<unknown> {
  return await stripe.refunds.create(args.params, args.options);
}

function tableClient(
  supabaseAdmin: SupabaseAdminClient,
  table: string,
): SupabaseTableClient {
  return supabaseAdmin.from(table) as SupabaseTableClient;
}
