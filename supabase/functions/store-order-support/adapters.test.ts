import {
  assertEquals,
  assertObjectMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import type { StripeRefundCreateArgs } from "./contract.ts";
import { createStoreOrderSupportAdapters } from "./adapters.ts";
import type { StoreOrderRow } from "./handler.ts";

const userId = "22222222-2222-4222-8222-222222222222";
const orderId = "11111111-1111-4111-8111-111111111111";

Deno.test("store order support adapters authenticate without live Supabase secrets", async () => {
  const calls: unknown[] = [];
  const adapters = createStoreOrderSupportAdapters({
    ...deps(),
    createClient: (supabaseUrl, supabaseAnonKey, options) => {
      calls.push({ options, supabaseAnonKey, supabaseUrl });
      return {
        auth: {
          getUser: async () => ({
            data: { user: { id: "user-1" } },
            error: null,
          }),
        },
      };
    },
  });

  assertEquals(
    await adapters.getUserId(new Request("https://example.test")),
    null,
  );
  assertEquals(
    await adapters.getUserId(
      new Request("https://example.test", {
        headers: { Authorization: "Bearer user-jwt" },
      }),
    ),
    "user-1",
  );
  assertEquals(calls, [
    {
      options: {
        auth: { persistSession: false },
        global: { headers: { Authorization: "Bearer user-jwt" } },
      },
      supabaseAnonKey: "anon-test",
      supabaseUrl: "https://supabase.test",
    },
  ]);
});

Deno.test("store order support adapters read owned order refund and invoice query shapes", async () => {
  const operations: Operation[] = [];
  const adapters = createStoreOrderSupportAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      dataByTable: {
        store_order_invoices: { id: "invoice-1" },
        store_order_refund_requests: { id: "refund-1", status: "reviewing" },
        store_orders: order(),
      },
      operations,
    }),
  });

  assertEquals(await adapters.readOwnedOrder(orderId, userId), order());
  assertEquals(await adapters.readRefundRequest(orderId), {
    id: "refund-1",
    status: "reviewing",
  });
  assertEquals(await adapters.readSupportState(orderId, userId), {
    invoice: { id: "invoice-1" },
    order: order(),
    refund_request: { id: "refund-1", status: "reviewing" },
  });
  assertEquals(operations, [
    { args: ["store_orders"], method: "from" },
    {
      args: [
        "id, user_id, stripe_session_id, stripe_payment_intent, subtotal_cents, tax_cents, total_cents, currency, status, payment_method, paid_at, created_at, updated_at",
      ],
      method: "select",
      table: "store_orders",
    },
    { args: ["id", orderId], method: "eq", table: "store_orders" },
    { args: ["user_id", userId], method: "eq", table: "store_orders" },
    { args: [], method: "maybeSingle", table: "store_orders" },
    { args: ["store_order_refund_requests"], method: "from" },
    {
      args: [
        "id, order_id, user_id, reason, details, status, requested_at, reviewed_at, processed_at, cancelled_at, provider, provider_refund_id, provider_refund_status, refund_amount_cents, failure_reason, metadata, created_at, updated_at",
      ],
      method: "select",
      table: "store_order_refund_requests",
    },
    {
      args: ["order_id", orderId],
      method: "eq",
      table: "store_order_refund_requests",
    },
    {
      args: [],
      method: "maybeSingle",
      table: "store_order_refund_requests",
    },
    { args: ["store_orders"], method: "from" },
    {
      args: [
        "id, user_id, stripe_session_id, stripe_payment_intent, subtotal_cents, tax_cents, total_cents, currency, status, payment_method, paid_at, created_at, updated_at",
      ],
      method: "select",
      table: "store_orders",
    },
    { args: ["id", orderId], method: "eq", table: "store_orders" },
    { args: ["user_id", userId], method: "eq", table: "store_orders" },
    { args: [], method: "maybeSingle", table: "store_orders" },
    { args: ["store_order_refund_requests"], method: "from" },
    {
      args: [
        "id, order_id, user_id, reason, details, status, requested_at, reviewed_at, processed_at, cancelled_at, provider, provider_refund_id, provider_refund_status, refund_amount_cents, failure_reason, metadata, created_at, updated_at",
      ],
      method: "select",
      table: "store_order_refund_requests",
    },
    {
      args: ["order_id", orderId],
      method: "eq",
      table: "store_order_refund_requests",
    },
    {
      args: [],
      method: "maybeSingle",
      table: "store_order_refund_requests",
    },
    { args: ["store_order_invoices"], method: "from" },
    {
      args: [
        "id, order_id, user_id, provider, provider_invoice_id, invoice_number, status, hosted_invoice_url, pdf_url, metadata, issued_at, created_at, updated_at",
      ],
      method: "select",
      table: "store_order_invoices",
    },
    {
      args: ["order_id", orderId],
      method: "eq",
      table: "store_order_invoices",
    },
    {
      args: [],
      method: "maybeSingle",
      table: "store_order_invoices",
    },
  ]);
});

Deno.test("store order support adapters stage refund request mutation shape", async () => {
  const operations: Operation[] = [];
  const adapters = createStoreOrderSupportAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      data: { id: "refund-1", status: "reviewing" },
      operations,
    }),
  });

  assertEquals(
    await adapters.stageRefundRequest(
      order(),
      "duplicate_purchase",
      "please refund",
    ),
    { id: "refund-1", status: "reviewing" },
  );

  const upsert = operations.find((operation) => operation.method === "upsert");
  assertObjectMatch(upsert?.args[0] as Record<string, unknown>, {
    details: "please refund",
    failure_reason: null,
    metadata: {
      requested_by_user_id: userId,
      self_service: true,
    },
    order_id: orderId,
    provider: "stripe",
    provider_refund_status: "creating",
    reason: "duplicate_purchase",
    refund_amount_cents: 2599,
    status: "reviewing",
    user_id: userId,
  });
  assertEquals(
    typeof (upsert?.args[0] as Record<string, unknown>).updated_at,
    "string",
  );
  assertEquals(
    typeof ((upsert?.args[0] as Record<string, unknown>).metadata as Record<
      string,
      unknown
    >).staged_at,
    "string",
  );
  assertEquals(upsert?.args[1], { onConflict: "order_id" });
  assertEquals(operations.at(-1), {
    args: [],
    method: "single",
    table: "store_order_refund_requests",
  });
});

Deno.test("store order support adapters reject staged refund mutation shape", async () => {
  const operations: Operation[] = [];
  const adapters = createStoreOrderSupportAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({ operations }),
  });

  await adapters.rejectStagedRefund(
    orderId,
    "Stripe payment intent is missing",
  );

  const update = operations.find((operation) => operation.method === "update");
  assertObjectMatch(update?.args[0] as Record<string, unknown>, {
    failure_reason: "Stripe payment intent is missing",
    provider_refund_status: "failed",
    status: "rejected",
  });
  assertEquals(
    typeof (update?.args[0] as Record<string, unknown>).reviewed_at,
    "string",
  );
  assertEquals(
    typeof (update?.args[0] as Record<string, unknown>).updated_at,
    "string",
  );
  assertEquals(operations.at(-1), {
    args: ["order_id", orderId],
    method: "eq",
    table: "store_order_refund_requests",
  });
});

Deno.test("store order support adapters delegate Stripe refund create args", async () => {
  const stripeCalls: unknown[] = [];
  const adapters = createStoreOrderSupportAdapters({
    ...deps(),
    stripe: {
      refunds: {
        create: async (params, options) => {
          stripeCalls.push({ options, params });
          return { id: "re_123", status: "succeeded" };
        },
      },
    },
  });
  const args: StripeRefundCreateArgs = {
    options: { idempotencyKey: `store-order-refund:${orderId}` },
    params: {
      amount: 2599,
      metadata: {
        order_id: orderId,
        refund_request_id: "refund-request-1",
        user_id: userId,
      },
      payment_intent: "pi_123",
      reason: "requested_by_customer",
    },
  };

  assertEquals(await adapters.createStripeRefund(args), {
    id: "re_123",
    status: "succeeded",
  });
  assertEquals(stripeCalls, [{ options: args.options, params: args.params }]);
});

type Operation = {
  args: unknown[];
  method: string;
  table?: string;
};

function deps() {
  return {
    createClient: () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: userId } }, error: null }),
      },
    }),
    resolvePaymentIntentId: async () => "pi_123",
    stripe: {
      refunds: {
        create: async () => ({ id: "re_default" }),
      },
    },
    supabaseAdmin: supabaseStub(),
    supabaseAnonKey: "anon-test",
    supabaseUrl: "https://supabase.test",
    syncInvoiceForOrder: async () => ({ id: "invoice-1" }),
    syncRefundFromStripeRefund: async () => {},
  };
}

function supabaseStub(options: {
  data?: unknown;
  dataByTable?: Record<string, unknown>;
  error?: { message?: string } | null;
  operations?: Operation[];
} = {}) {
  const operations = options.operations ?? [];
  return {
    from: (table: string) => {
      operations.push({ args: [table], method: "from" });
      const result = () => ({
        data: options.dataByTable?.[table] ?? options.data ?? null,
        error: options.error ?? null,
      });
      const query = {
        eq(column: string, value: unknown) {
          operations.push({ args: [column, value], method: "eq", table });
          return query;
        },
        maybeSingle() {
          operations.push({ args: [], method: "maybeSingle", table });
          return Promise.resolve(result());
        },
        select(columns: string) {
          operations.push({ args: [columns], method: "select", table });
          return query;
        },
        single() {
          operations.push({ args: [], method: "single", table });
          return Promise.resolve(result());
        },
        then(
          onfulfilled?: ((value: unknown) => unknown) | null,
          onrejected?: ((reason: unknown) => unknown) | null,
        ) {
          return Promise.resolve(result()).then(onfulfilled, onrejected);
        },
        update(value: unknown) {
          operations.push({ args: [value], method: "update", table });
          return query;
        },
        upsert(value: unknown, upsertOptions?: unknown) {
          operations.push({
            args: [value, upsertOptions],
            method: "upsert",
            table,
          });
          return query;
        },
      };
      return query;
    },
  };
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
