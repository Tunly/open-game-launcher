import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  createStripeWebhookAdapters,
  isRetryableStripeWebhookEvent,
  type StoreProductRecord,
} from "./adapters.ts";

Deno.test("stripe webhook adapters map insert claims and duplicates", async () => {
  const insertedAt = "2026-06-15T12:00:00.000Z";
  const supabase = new SupabaseStub([
    result({ updated_at: insertedAt }),
    result(null, { code: "23505", message: "duplicate" }),
    result({ processing_status: "processed", updated_at: insertedAt }),
  ]);
  const adapters = testAdapters(supabase);

  assertEquals(
    await adapters.claimStoreStripeWebhookEvent(
      "evt_new",
      "checkout.session.completed",
    ),
    { claimUpdatedAt: insertedAt, id: "evt_new" },
  );
  assertEquals(
    supabase.operations[0],
    {
      action: "insert",
      filters: [],
      payload: {
        error_message: null,
        event_type: "checkout.session.completed",
        id: "evt_new",
        processed_at: null,
        processing_status: "processing",
      },
      select: "updated_at",
      table: "store_stripe_webhook_events",
      terminal: "single",
    },
  );

  assertEquals(
    await adapters.claimStoreStripeWebhookEvent("evt_dup", "invoice.updated"),
    null,
  );
  assertEquals(supabase.operations.length, 3);
  assertEquals(supabase.operations[2].filters, [{
    op: "eq",
    column: "id",
    value: "evt_dup",
  }]);
});

Deno.test("stripe webhook adapters retry failed and stale processing claims with lease guards", async () => {
  const retryAt = "2026-06-15T12:01:00.000Z";
  const staleAt = "2026-06-15T11:44:59.000Z";
  const realNow = Date.now;
  Date.now = () => Date.parse("2026-06-15T12:00:00.000Z");
  try {
    const failedSupabase = new SupabaseStub([
      result(null, { code: "23505", message: "duplicate" }),
      result({ processing_status: "failed", updated_at: retryAt }),
      result({ updated_at: retryAt }),
    ]);
    const failedAdapters = testAdapters(failedSupabase);

    assertEquals(
      await failedAdapters.claimStoreStripeWebhookEvent(
        "evt_failed",
        "refund.updated",
      ),
      { claimUpdatedAt: retryAt, id: "evt_failed" },
    );
    assertEquals(failedSupabase.operations[2].payload, {
      error_message: null,
      event_type: "refund.updated",
      processed_at: null,
      processing_status: "processing",
    });
    assertEquals(failedSupabase.operations[2].filters, [
      { op: "eq", column: "id", value: "evt_failed" },
      { op: "eq", column: "processing_status", value: "failed" },
    ]);

    const staleSupabase = new SupabaseStub([
      result(null, { code: "23505", message: "duplicate" }),
      result({ processing_status: "processing", updated_at: staleAt }),
      result({ updated_at: retryAt }),
    ]);
    const staleAdapters = testAdapters(staleSupabase);

    assertEquals(
      await staleAdapters.claimStoreStripeWebhookEvent(
        "evt_stale",
        "invoice.paid",
      ),
      { claimUpdatedAt: retryAt, id: "evt_stale" },
    );
    assertEquals(staleSupabase.operations[2].filters, [
      { op: "eq", column: "id", value: "evt_stale" },
      { op: "eq", column: "processing_status", value: "processing" },
      {
        op: "lte",
        column: "updated_at",
        value: "2026-06-15T11:45:00.000Z",
      },
    ]);
  } finally {
    Date.now = realNow;
  }
});

Deno.test("stripe webhook retry helper only accepts failed or stale processing events", () => {
  const staleBefore = "2026-06-15T11:45:00.000Z";

  assert(isRetryableStripeWebhookEvent(
    { processing_status: "failed", updated_at: "not-a-date" },
    staleBefore,
  ));
  assert(isRetryableStripeWebhookEvent(
    { processing_status: "processing", updated_at: "2026-06-15T11:45:00.000Z" },
    staleBefore,
  ));
  assertEquals(
    isRetryableStripeWebhookEvent(
      {
        processing_status: "processing",
        updated_at: "2026-06-15T11:45:01.000Z",
      },
      staleBefore,
    ),
    false,
  );
  assertEquals(
    isRetryableStripeWebhookEvent(
      {
        processing_status: "processed",
        updated_at: "2026-06-15T11:00:00.000Z",
      },
      staleBefore,
    ),
    false,
  );
});

Deno.test("stripe webhook finalizers scope updates to the claimed lease token", async () => {
  const supabase = new SupabaseStub([
    result({ id: "evt_1" }),
    result({ id: "evt_1" }),
  ]);
  const adapters = testAdapters(supabase);
  const claim = {
    claimUpdatedAt: "2026-06-15T12:00:00.000Z",
    id: "evt_1",
  };

  assertEquals(
    await adapters.markStoreStripeWebhookEventProcessed(claim),
    true,
  );
  assertEquals(supabase.operations[0].payload, {
    error_message: null,
    processed_at: supabase.operations[0].payload.processed_at,
    processing_status: "processed",
  });
  assertEquals(supabase.operations[0].filters, [
    { op: "eq", column: "id", value: "evt_1" },
    { op: "eq", column: "updated_at", value: "2026-06-15T12:00:00.000Z" },
  ]);

  assertEquals(
    await adapters.markStoreStripeWebhookEventFailed(
      claim,
      new Error("x".repeat(2100)),
    ),
    true,
  );
  assertEquals(
    String(supabase.operations[1].payload.error_message).length,
    2000,
  );
  assertEquals(supabase.operations[1].payload.processing_status, "failed");
  assertEquals(supabase.operations[1].filters, [
    { op: "eq", column: "id", value: "evt_1" },
    { op: "eq", column: "updated_at", value: "2026-06-15T12:00:00.000Z" },
  ]);
});

Deno.test("stripe webhook checkout lookup falls back to metadata order and rejects user mismatch", async () => {
  const supabase = new SupabaseStub([
    result(null),
    result({
      id: "order_1",
      status: "pending",
      stripe_payment_intent: null,
      stripe_session_id: null,
      total_cents: null,
      user_id: "user_actual",
    }),
  ]);
  const adapters = testAdapters(supabase);

  await assertRejects(
    () =>
      adapters.persistCheckoutSessionProgress(
        "cs_1",
        {
          amount_total: 1234,
          metadata: { order_id: "order_1", user_id: "user_other" },
          payment_intent: "pi_1",
        },
        "pending",
      ),
    Error,
    "Stripe session cs_1 user metadata mismatch",
  );

  assertEquals(supabase.operations[0].filters, [
    { op: "eq", column: "stripe_session_id", value: "cs_1" },
  ]);
  assertEquals(supabase.operations[1].filters, [
    { op: "eq", column: "id", value: "order_1" },
  ]);
});

Deno.test("stripe webhook fulfilled orders sync payment data without reissuing licenses", async () => {
  const supabase = new SupabaseStub([
    result({
      id: "order_1",
      status: "fulfilled",
      stripe_payment_intent: "pi_old",
      stripe_session_id: "cs_1",
      total_cents: 1000,
      user_id: "user_1",
    }),
    result({}),
  ]);
  const calls = callLog();
  const adapters = testAdapters(supabase, calls);

  await adapters.fulfillCheckoutSession("cs_1", "device_1", {
    amount_subtotal: 1200,
    amount_total: 1300,
    currency: "eur",
    metadata: { user_id: "user_1" },
    payment_intent: "pi_new",
    total_details: { amount_tax: 100 },
  });

  assertEquals(calls.licenses, []);
  assertEquals(calls.invoices, [{
    order: {
      id: "order_1",
      status: "fulfilled",
      stripe_payment_intent: "pi_new",
      stripe_session_id: "cs_1",
      total_cents: 1300,
      user_id: "user_1",
    },
    syncSource: "checkout_session_completed",
  }]);
  assertEquals(supabase.operations.length, 2);
  assertEquals(supabase.operations[1].payload.status, undefined);
  assertEquals(supabase.operations[1].payload.stripe_payment_intent, "pi_new");
  assertEquals(supabase.operations[1].payload.stripe_session_id, "cs_1");
});

Deno.test("stripe webhook fulfillment maps order items products license issuance invoice sync and cart cleanup", async () => {
  const products: StoreProductRecord[] = [{
    discount_percent: 0,
    id: "prod_1",
    platforms: ["windows"],
    price_cents: 2000,
    title: "Game",
  }];
  const supabase = new SupabaseStub([
    result(null),
    result({
      id: "order_1",
      status: "pending",
      stripe_payment_intent: null,
      stripe_session_id: null,
      total_cents: null,
      user_id: "user_1",
    }),
    result([{ product_id: "prod_1" }]),
    result(products),
    result({}),
    result({}),
    result({}),
  ]);
  const calls = callLog();
  const adapters = testAdapters(supabase, calls);

  await adapters.fulfillCheckoutSession("cs_1", "device_1", {
    amount_total: 2200,
    currency: "eur",
    metadata: { order_id: "order_1", user_id: "user_1" },
    payment_intent: { id: "pi_1" },
  });

  assertEquals(calls.licenses, [{
    deviceId: "device_1",
    orderId: "order_1",
    products,
    userId: "user_1",
  }]);
  assertEquals(calls.invoices[0], {
    order: {
      id: "order_1",
      status: "fulfilled",
      stripe_payment_intent: "pi_1",
      stripe_session_id: "cs_1",
      total_cents: 2200,
      user_id: "user_1",
    },
    syncSource: "checkout_session_completed",
  });
  assertEquals(supabase.operations.map((operation) => operation.table), [
    "store_orders",
    "store_orders",
    "store_order_items",
    "store_products",
    "store_orders",
    "store_orders",
    "store_cart_items",
  ]);
  assertEquals(supabase.operations[4].payload.status, "paid");
  assertEquals(supabase.operations[5].payload.status, "fulfilled");
  assertEquals(supabase.operations[6].filters, [
    { op: "eq", column: "user_id", value: "user_1" },
    { op: "in", column: "product_id", value: ["prod_1"] },
  ]);
});

Deno.test("stripe webhook invoice and refund adapters delegate exact payloads", async () => {
  const calls = callLog();
  const adapters = testAdapters(new SupabaseStub([]), calls);
  const invoice = { id: "in_1" };
  const refund = { id: "re_1" };

  assertStrictEquals(
    await adapters.syncStoreInvoiceFromStripeInvoice(invoice, "invoice.paid"),
    calls.invoiceReturn,
  );
  await adapters.syncStoreRefundFromStripeRefund(refund);

  assertEquals(calls.invoicePayloads, [{ eventType: "invoice.paid", invoice }]);
  assertEquals(calls.refunds, [refund]);
});

function testAdapters(
  supabase: SupabaseStub,
  calls = callLog(),
): ReturnType<typeof createStripeWebhookAdapters> {
  return createStripeWebhookAdapters({
    issueStoreLicenses: async (userId, orderId, products, deviceId) => {
      calls.licenses.push({ deviceId, orderId, products, userId });
    },
    supabaseAdmin: supabase.client(),
    syncStoreInvoiceFromStripeInvoice: async (invoice, eventType) => {
      calls.invoicePayloads.push({ eventType, invoice });
      return calls.invoiceReturn;
    },
    syncStoreRefundFromStripeRefund: async (refund) => {
      calls.refunds.push(refund);
    },
    syncStripeInvoiceForOrder: async (order, syncSource) => {
      calls.invoices.push({ order, syncSource });
      return calls.invoiceReturn;
    },
  });
}

function callLog() {
  return {
    invoicePayloads: [] as Array<{ eventType: string; invoice: unknown }>,
    invoiceReturn: { id: "invoice_row" },
    invoices: [] as Array<{ order: unknown; syncSource: string }>,
    licenses: [] as Array<{
      deviceId?: string | null;
      orderId: string;
      products: StoreProductRecord[];
      userId: string;
    }>,
    refunds: [] as unknown[],
  };
}

function result(data: unknown, error: QueryError | null = null): QueryResult {
  return { data, error };
}

interface QueryError {
  code?: string;
  message: string;
}

interface QueryResult {
  data: unknown;
  error: QueryError | null;
}

interface Operation {
  action: string | null;
  filters: Array<{ column: string; op: "eq" | "in" | "lte"; value: unknown }>;
  payload: Record<string, unknown>;
  select?: string;
  table: string;
  terminal: "maybeSingle" | "single" | "then";
}

class SupabaseStub {
  operations: Operation[] = [];

  constructor(private readonly results: QueryResult[]) {}

  client() {
    return {
      from: (table: string) => new QueryBuilderStub(this, table),
    };
  }

  finish(operation: Operation): Promise<QueryResult> {
    this.operations.push(operation);
    const next = this.results.shift();
    if (!next) {
      throw new Error(`No Supabase stub result for ${operation.table}`);
    }
    return Promise.resolve(next);
  }
}

class QueryBuilderStub implements PromiseLike<QueryResult> {
  private action: string | null = null;
  private filters: Operation["filters"] = [];
  private payload: Record<string, unknown> = {};
  private selected?: string;

  constructor(
    private readonly supabase: SupabaseStub,
    private readonly table: string,
  ) {}

  delete() {
    this.action = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, op: "eq", value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ column, op: "in", value });
    return this;
  }

  insert(value: unknown) {
    this.action = "insert";
    this.payload = value as Record<string, unknown>;
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ column, op: "lte", value });
    return this;
  }

  maybeSingle() {
    return this.finish("maybeSingle");
  }

  select(columns?: string) {
    this.selected = columns;
    return this;
  }

  single() {
    return this.finish("single");
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.finish("then").then(onfulfilled, onrejected);
  }

  update(value: unknown) {
    this.action = "update";
    this.payload = value as Record<string, unknown>;
    return this;
  }

  private finish(terminal: Operation["terminal"]) {
    return this.supabase.finish({
      action: this.action,
      filters: this.filters,
      payload: this.payload,
      select: this.selected,
      table: this.table,
      terminal,
    });
  }
}
