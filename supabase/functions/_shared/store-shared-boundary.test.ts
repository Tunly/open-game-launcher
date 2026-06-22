import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

type StoreModule = typeof import("./store.ts");

type SupabaseError = {
  code?: string;
  message: string;
};

type SupabaseQueryResult = {
  data?: unknown;
  error?: SupabaseError | null;
};

type SupabaseFilter = {
  column: string;
  op: "eq" | "in" | "lte";
  value: unknown;
};

type SupabaseOperation = {
  action: "insert" | "select" | "update" | "upsert";
  filters: SupabaseFilter[];
  options?: unknown;
  payload?: unknown;
  select?: string;
  table: string;
  terminal: "maybeSingle" | "single" | "then";
};

type StripeCalls = {
  checkoutSessionsRetrieve: Array<{ id: string; options?: unknown }>;
  invoicesRetrieve: Array<{ id: string; options?: unknown }>;
  paymentIntentsRetrieve: Array<{ id: string; options?: unknown }>;
};

type StoreBoundaryContext = {
  store: StoreModule;
  stripeCalls: StripeCalls;
  supabase: SupabaseStub;
};

const invoiceSelect =
  "id, order_id, user_id, provider, provider_invoice_id, invoice_number, status, hosted_invoice_url, pdf_url, metadata, issued_at, created_at, updated_at";

const signingSeedHex =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

Deno.test(
  "resolveStripePaymentIntentIdForOrder retrieves expanded Checkout Session and persists the payment intent",
  async () => {
    const supabase = new SupabaseStub([result({})]);
    await withMockedStoreBoundary(
      {
        stripe: {
          checkoutSessions: [{ id: "cs_1", payment_intent: { id: "pi_1" } }],
        },
        supabase,
      },
      async ({ store, stripeCalls }) => {
        assertEquals(
          await store.resolveStripePaymentIntentIdForOrder(order()),
          "pi_1",
        );

        assertEquals(stripeCalls.checkoutSessionsRetrieve, [{
          id: "cs_1",
          options: { expand: ["payment_intent"] },
        }]);
      },
    );

    assertEquals(supabase.operations.length, 1);
    const update = supabase.operations[0];
    assertEquals(operationWithoutPayload(update), {
      action: "update",
      filters: [{ column: "id", op: "eq", value: "order_1" }],
      table: "store_orders",
      terminal: "then",
    });
    assertEquals(normalizeTimestamps(update.payload), {
      stripe_payment_intent: "pi_1",
      updated_at: "<timestamp>",
    });
  },
);

Deno.test(
  "resolveStripePaymentIntentIdForOrder skips Stripe and Supabase when no lookup is needed",
  async () => {
    const supabase = new SupabaseStub();
    await withMockedStoreBoundary(
      { supabase },
      async ({ store, stripeCalls }) => {
        assertEquals(
          await store.resolveStripePaymentIntentIdForOrder(
            order({ stripe_payment_intent: "pi_existing" }),
          ),
          "pi_existing",
        );
        assertEquals(
          await store.resolveStripePaymentIntentIdForOrder(
            order({ stripe_payment_intent: null, stripe_session_id: null }),
          ),
          null,
        );
        assertEquals(stripeCalls.checkoutSessionsRetrieve, []);
      },
    );

    assertEquals(supabase.operations, []);
  },
);

Deno.test(
  "syncStripeInvoiceForOrder retrieves session invoice ids and upserts mapped invoice rows",
  async () => {
    const finalizedAt = 1_780_000_000;
    const supabase = new SupabaseStub([
      result({}),
      result({ id: "store_invoice_1" }),
    ]);

    await withMockedStoreBoundary(
      {
        stripe: {
          checkoutSessions: [{
            id: "cs_1",
            invoice: "in_1",
            payment_intent: { id: "pi_new" },
          }],
          invoices: [{
            created: 1_770_000_000,
            hosted_invoice_url: "https://stripe.test/invoice/in_1",
            id: "in_1",
            invoice_pdf: "https://stripe.test/invoice/in_1.pdf",
            number: "OGL-2026-0001",
            status: "paid",
            status_transitions: { finalized_at: finalizedAt },
          }],
        },
        supabase,
      },
      async ({ store, stripeCalls }) => {
        assertEquals(
          await store.syncStripeInvoiceForOrder(
            order({ status: "paid" }),
          ) as unknown,
          { id: "store_invoice_1" },
        );

        assertEquals(stripeCalls.checkoutSessionsRetrieve, [{
          id: "cs_1",
          options: { expand: ["invoice", "payment_intent"] },
        }]);
        assertEquals(stripeCalls.invoicesRetrieve, [{
          id: "in_1",
          options: undefined,
        }]);
      },
    );

    assertEquals(supabase.operations.length, 2);
    assertEquals(operationWithoutPayload(supabase.operations[0]), {
      action: "update",
      filters: [{ column: "id", op: "eq", value: "order_1" }],
      table: "store_orders",
      terminal: "then",
    });
    assertEquals(normalizeTimestamps(supabase.operations[0].payload), {
      stripe_payment_intent: "pi_new",
      updated_at: "<timestamp>",
    });

    const upsert = supabase.operations[1];
    assertEquals(operationWithoutPayload(upsert), {
      action: "upsert",
      filters: [],
      options: { onConflict: "order_id" },
      select: invoiceSelect,
      table: "store_order_invoices",
      terminal: "single",
    });
    assertEquals(normalizeStoreInvoicePayload(upsert.payload), {
      hosted_invoice_url: "https://stripe.test/invoice/in_1",
      invoice_number: "OGL-2026-0001",
      issued_at: new Date(finalizedAt * 1000).toISOString(),
      metadata: {
        stripe_invoice_id: "in_1",
        stripe_invoice_status: "paid",
        stripe_payment_intent: "pi_new",
        stripe_session_id: "cs_1",
        sync_source: "manual",
        synced_at: "<timestamp>",
      },
      order_id: "order_1",
      pdf_url: "https://stripe.test/invoice/in_1.pdf",
      provider: "stripe",
      provider_invoice_id: "in_1",
      status: "available",
      updated_at: "<timestamp>",
      user_id: "user_1",
    });
  },
);

Deno.test(
  "syncStripeInvoiceForOrder stages unavailable invoice metadata when Stripe has only a receipt",
  async () => {
    const supabase = new SupabaseStub([
      result(null),
      result({ id: "store_invoice_unavailable", status: "unavailable" }),
    ]);

    await withMockedStoreBoundary(
      {
        stripe: {
          paymentIntents: [{
            id: "pi_1",
            invoice: null,
            latest_charge: { receipt_url: "https://stripe.test/receipt/pi_1" },
          }],
        },
        supabase,
      },
      async ({ store, stripeCalls }) => {
        assertEquals(
          await store.syncStripeInvoiceForOrder(
            order({
              status: "paid",
              stripe_payment_intent: "pi_1",
              stripe_session_id: null,
            }),
          ) as unknown,
          { id: "store_invoice_unavailable", status: "unavailable" },
        );

        assertEquals(stripeCalls.paymentIntentsRetrieve, [{
          id: "pi_1",
          options: { expand: ["latest_charge"] },
        }]);
      },
    );

    assertEquals(supabase.operations.length, 2);
    assertEquals(operationWithoutPayload(supabase.operations[0]), {
      action: "select",
      filters: [{ column: "order_id", op: "eq", value: "order_1" }],
      select: invoiceSelect,
      table: "store_order_invoices",
      terminal: "maybeSingle",
    });

    const upsert = supabase.operations[1];
    assertEquals(operationWithoutPayload(upsert), {
      action: "upsert",
      filters: [],
      options: { onConflict: "order_id" },
      select: invoiceSelect,
      table: "store_order_invoices",
      terminal: "single",
    });
    assertEquals(normalizeStoreInvoicePayload(upsert.payload), {
      hosted_invoice_url: null,
      invoice_number: null,
      issued_at: null,
      metadata: {
        receipt_url: "https://stripe.test/receipt/pi_1",
        stripe_payment_intent: "pi_1",
        stripe_session_id: null,
        sync_source: "manual",
        synced_at: "<timestamp>",
        unavailable_reason: "stripe_checkout_invoice_missing",
      },
      order_id: "order_1",
      pdf_url: null,
      provider: "stripe",
      provider_invoice_id: null,
      status: "unavailable",
      updated_at: "<timestamp>",
      user_id: "user_1",
    });
  },
);

Deno.test(
  "syncStripeInvoiceForOrder returns an existing available invoice instead of overwriting it when Stripe invoice data is missing",
  async () => {
    const existingInvoice = {
      hosted_invoice_url: null,
      id: "store_invoice_existing",
      pdf_url: "https://cdn.test/store_invoice_existing.pdf",
      status: "available",
    };
    const supabase = new SupabaseStub([result(existingInvoice)]);

    await withMockedStoreBoundary(
      {
        stripe: {
          paymentIntents: [{
            id: "pi_1",
            invoice: null,
            latest_charge: null,
          }],
        },
        supabase,
      },
      async ({ store }) => {
        assertEquals(
          await store.syncStripeInvoiceForOrder(
            order({
              status: "paid",
              stripe_payment_intent: "pi_1",
              stripe_session_id: null,
            }),
          ) as unknown,
          existingInvoice,
        );
      },
    );

    assertEquals(supabase.operations.length, 1);
    assertEquals(operationWithoutPayload(supabase.operations[0]), {
      action: "select",
      filters: [{ column: "order_id", op: "eq", value: "order_1" }],
      select: invoiceSelect,
      table: "store_order_invoices",
      terminal: "maybeSingle",
    });
  },
);

Deno.test(
  "syncStoreInvoiceFromStripeInvoice reads provider invoice mappings, updates order payment intent, and upserts webhook invoices",
  async () => {
    const createdAt = 1_790_000_000;
    const supabase = new SupabaseStub([
      result(null),
      result(order({ stripe_payment_intent: null })),
      result({}),
      result({ id: "store_invoice_webhook" }),
    ]);

    await withMockedStoreBoundary(
      { supabase },
      async ({ store }) => {
        assertEquals(
          await store.syncStoreInvoiceFromStripeInvoice(
            {
              created: createdAt,
              hosted_invoice_url: "https://stripe.test/invoice/in_webhook",
              id: "in_webhook",
              invoice_pdf: null,
              metadata: { order_id: "order_1" },
              number: "OGL-2026-0002",
              payment_intent: "pi_webhook",
              status: "void",
            },
            "invoice.updated",
          ) as unknown,
          { id: "store_invoice_webhook" },
        );
      },
    );

    assertEquals(supabase.operations.length, 4);
    assertEquals(operationWithoutPayload(supabase.operations[0]), {
      action: "select",
      filters: [
        { column: "provider", op: "eq", value: "stripe" },
        { column: "provider_invoice_id", op: "eq", value: "in_webhook" },
      ],
      select: invoiceSelect,
      table: "store_order_invoices",
      terminal: "maybeSingle",
    });
    assertEquals(operationWithoutPayload(supabase.operations[1]), {
      action: "select",
      filters: [{ column: "id", op: "eq", value: "order_1" }],
      select:
        "id, user_id, stripe_session_id, stripe_payment_intent, status, total_cents",
      table: "store_orders",
      terminal: "maybeSingle",
    });
    assertEquals(operationWithoutPayload(supabase.operations[2]), {
      action: "update",
      filters: [{ column: "id", op: "eq", value: "order_1" }],
      table: "store_orders",
      terminal: "then",
    });
    assertEquals(normalizeTimestamps(supabase.operations[2].payload), {
      stripe_payment_intent: "pi_webhook",
      updated_at: "<timestamp>",
    });

    assertEquals(normalizeStoreInvoicePayload(supabase.operations[3].payload), {
      hosted_invoice_url: "https://stripe.test/invoice/in_webhook",
      invoice_number: "OGL-2026-0002",
      issued_at: new Date(createdAt * 1000).toISOString(),
      metadata: {
        stripe_invoice_id: "in_webhook",
        stripe_invoice_status: "void",
        stripe_payment_intent: "pi_webhook",
        stripe_session_id: "cs_1",
        sync_source: "invoice.updated",
        synced_at: "<timestamp>",
      },
      order_id: "order_1",
      pdf_url: null,
      provider: "stripe",
      provider_invoice_id: "in_webhook",
      status: "void",
      updated_at: "<timestamp>",
      user_id: "user_1",
    });
  },
);

Deno.test(
  "syncStoreInvoiceFromStripeInvoice falls back to an existing provider invoice mapping when metadata lacks order_id",
  async () => {
    const supabase = new SupabaseStub([
      result({ order_id: "order_existing" }),
      result(order({
        id: "order_existing",
        stripe_payment_intent: "pi_existing",
        stripe_session_id: "cs_existing",
      })),
      result({ id: "store_invoice_existing" }),
    ]);

    await withMockedStoreBoundary(
      { supabase },
      async ({ store }) => {
        assertEquals(
          await store.syncStoreInvoiceFromStripeInvoice({
            id: "in_existing",
            metadata: {},
            payment_intent: "pi_existing",
          }) as unknown,
          { id: "store_invoice_existing" },
        );
      },
    );

    assertEquals(supabase.operations.length, 3);
    assertEquals(operationWithoutPayload(supabase.operations[1]), {
      action: "select",
      filters: [{ column: "id", op: "eq", value: "order_existing" }],
      select:
        "id, user_id, stripe_session_id, stripe_payment_intent, status, total_cents",
      table: "store_orders",
      terminal: "maybeSingle",
    });
    assertEquals(supabase.operations[2].action, "upsert");
    assertEquals(supabase.operations[2].table, "store_order_invoices");
  },
);

Deno.test(
  "syncStoreInvoiceFromStripeInvoice no-ops when invoice metadata and provider mappings cannot resolve an order",
  async () => {
    const supabase = new SupabaseStub([result(null)]);

    await withMockedStoreBoundary(
      { supabase },
      async ({ store }) => {
        assertEquals(
          await store.syncStoreInvoiceFromStripeInvoice({
            id: "in_unmapped",
            metadata: {},
          }),
          null,
        );
        assertEquals(await store.syncStoreInvoiceFromStripeInvoice(null), null);
      },
    );

    assertEquals(supabase.operations.length, 1);
    assertEquals(operationWithoutPayload(supabase.operations[0]), {
      action: "select",
      filters: [
        { column: "provider", op: "eq", value: "stripe" },
        { column: "provider_invoice_id", op: "eq", value: "in_unmapped" },
      ],
      select: invoiceSelect,
      table: "store_order_invoices",
      terminal: "maybeSingle",
    });
  },
);

Deno.test(
  "syncStoreInvoiceFromStripeInvoice surfaces provider invoice read errors",
  async () => {
    const supabase = new SupabaseStub([
      result(null, { message: "read failed" }),
    ]);

    await withMockedStoreBoundary(
      { supabase },
      async ({ store }) => {
        await assertRejects(
          () =>
            store.syncStoreInvoiceFromStripeInvoice({
              id: "in_error",
              metadata: {},
            }),
          Error,
          "Failed to read store invoice by provider id: read failed",
        );
      },
    );
  },
);

Deno.test(
  "syncStoreRefundFromStripeRefund inserts processed Stripe refunds and finalizes store orders",
  async () => {
    const supabase = new SupabaseStub([
      result(order()),
      result(null),
      result({ id: "refund_row" }),
      result({}),
      result({}),
    ]);

    await withMockedStoreBoundary(
      { supabase },
      async ({ store }) => {
        await store.syncStoreRefundFromStripeRefund({
          amount: 1299,
          charge: { id: "ch_1" },
          id: "re_1",
          metadata: { order_id: "order_1" },
          payment_intent: "pi_1",
          status: "succeeded",
        });
      },
    );

    assertEquals(supabase.operations.length, 5);
    assertEquals(operationWithoutPayload(supabase.operations[0]), {
      action: "select",
      filters: [{ column: "id", op: "eq", value: "order_1" }],
      select:
        "id, user_id, stripe_session_id, stripe_payment_intent, status, total_cents",
      table: "store_orders",
      terminal: "maybeSingle",
    });
    assertEquals(operationWithoutPayload(supabase.operations[1]), {
      action: "select",
      filters: [{ column: "order_id", op: "eq", value: "order_1" }],
      select: "id",
      table: "store_order_refund_requests",
      terminal: "maybeSingle",
    });
    assertEquals(operationWithoutPayload(supabase.operations[2]), {
      action: "insert",
      filters: [],
      select: "id",
      table: "store_order_refund_requests",
      terminal: "single",
    });
    assertEquals(normalizeRefundPayload(supabase.operations[2].payload), {
      details: null,
      failure_reason: null,
      metadata: {
        stripe_charge: "ch_1",
        stripe_payment_intent: "pi_1",
        stripe_refund_id: "re_1",
        stripe_refund_status: "succeeded",
        synced_at: "<timestamp>",
      },
      order_id: "order_1",
      processed_at: "<timestamp>",
      provider: "stripe",
      provider_refund_id: "re_1",
      provider_refund_status: "succeeded",
      reason: "stripe_webhook",
      refund_amount_cents: 1299,
      requested_at: "<timestamp>",
      reviewed_at: "<timestamp>",
      status: "processed",
      updated_at: "<timestamp>",
      user_id: "user_1",
    });
    assertEquals(normalizeTimestamps(supabase.operations[3].payload), {
      status: "refunded",
      updated_at: "<timestamp>",
    });
    assertEquals(operationWithoutPayload(supabase.operations[3]), {
      action: "update",
      filters: [
        { column: "id", op: "eq", value: "order_1" },
        { column: "user_id", op: "eq", value: "user_1" },
      ],
      table: "store_orders",
      terminal: "then",
    });
    assertEquals(operationWithoutPayload(supabase.operations[4]), {
      action: "update",
      filters: [
        { column: "user_id", op: "eq", value: "user_1" },
        { column: "order_id", op: "eq", value: "order_1" },
        { column: "is_revoked", op: "eq", value: false },
      ],
      table: "store_licenses",
      terminal: "then",
    });
    assertEquals(supabase.operations[4].payload, { is_revoked: true });
  },
);

Deno.test(
  "syncStoreRefundFromStripeRefund updates existing cancelled refunds found by payment intent",
  async () => {
    const supabase = new SupabaseStub([
      result(order({ stripe_payment_intent: "pi_1" })),
      result({ id: "refund_existing" }),
      result({ id: "refund_existing" }),
    ]);

    await withMockedStoreBoundary(
      { supabase },
      async ({ store }) => {
        await store.syncStoreRefundFromStripeRefund({
          amount: 500,
          charge: "ch_1",
          id: "re_cancelled",
          payment_intent: { id: "pi_1" },
          status: "canceled",
        });
      },
    );

    assertEquals(supabase.operations.length, 3);
    assertEquals(operationWithoutPayload(supabase.operations[0]), {
      action: "select",
      filters: [{ column: "stripe_payment_intent", op: "eq", value: "pi_1" }],
      select:
        "id, user_id, stripe_session_id, stripe_payment_intent, status, total_cents",
      table: "store_orders",
      terminal: "maybeSingle",
    });
    assertEquals(operationWithoutPayload(supabase.operations[2]), {
      action: "update",
      filters: [{ column: "id", op: "eq", value: "refund_existing" }],
      select: "id",
      table: "store_order_refund_requests",
      terminal: "single",
    });
    assertEquals(normalizeRefundPayload(supabase.operations[2].payload), {
      cancelled_at: "<timestamp>",
      failure_reason: null,
      metadata: {
        stripe_charge: "ch_1",
        stripe_payment_intent: "pi_1",
        stripe_refund_id: "re_cancelled",
        stripe_refund_status: "canceled",
        synced_at: "<timestamp>",
      },
      provider: "stripe",
      provider_refund_id: "re_cancelled",
      provider_refund_status: "canceled",
      refund_amount_cents: 500,
      reviewed_at: "<timestamp>",
      status: "cancelled",
      updated_at: "<timestamp>",
    });
  },
);

Deno.test(
  "syncStoreRefundFromStripeRefund no-ops for malformed refunds and unresolved provider refund mappings",
  async () => {
    const supabase = new SupabaseStub([result(null)]);

    await withMockedStoreBoundary(
      { supabase },
      async ({ store }) => {
        await store.syncStoreRefundFromStripeRefund(null);
        await store.syncStoreRefundFromStripeRefund({ status: "succeeded" });
        await store.syncStoreRefundFromStripeRefund({
          id: "re_unmapped",
          status: "failed",
        });
      },
    );

    assertEquals(supabase.operations.length, 1);
    assertEquals(operationWithoutPayload(supabase.operations[0]), {
      action: "select",
      filters: [
        { column: "provider", op: "eq", value: "stripe" },
        { column: "provider_refund_id", op: "eq", value: "re_unmapped" },
      ],
      select: "order_id",
      table: "store_order_refund_requests",
      terminal: "maybeSingle",
    });
  },
);

Deno.test("syncStoreRefundFromStripeRefund surfaces refund write errors", async () => {
  const supabase = new SupabaseStub([
    result(order()),
    result(null),
    result(null, { message: "write failed" }),
  ]);

  await withMockedStoreBoundary(
    { supabase },
    async ({ store }) => {
      await assertRejects(
        () =>
          store.syncStoreRefundFromStripeRefund({
            id: "re_error",
            metadata: { order_id: "order_1" },
            status: "succeeded",
          }),
        Error,
        "Failed to sync Stripe refund: write failed",
      );
    },
  );
});

class SupabaseStub {
  operations: SupabaseOperation[] = [];
  #results: SupabaseQueryResult[];

  constructor(results: SupabaseQueryResult[] = []) {
    this.#results = [...results];
  }

  from = (table: string) => new SupabaseQueryBuilder(this, table);

  nextResult(): SupabaseQueryResult {
    return this.#results.shift() ?? result(null);
  }
}

class SupabaseQueryBuilder {
  #action: SupabaseOperation["action"] | null = null;
  #filters: SupabaseFilter[] = [];
  #options: unknown;
  #payload: unknown;
  #select?: string;

  constructor(
    private readonly supabase: SupabaseStub,
    private readonly table: string,
  ) {}

  delete() {
    this.#action = "update";
    return this;
  }

  insert(payload: unknown) {
    this.#action = "insert";
    this.#payload = payload;
    return this;
  }

  select(columns?: string) {
    if (!this.#action) this.#action = "select";
    this.#select = columns;
    return this;
  }

  update(payload: unknown) {
    this.#action = "update";
    this.#payload = payload;
    return this;
  }

  upsert(payload: unknown, options?: unknown) {
    this.#action = "upsert";
    this.#payload = payload;
    this.#options = options;
    return this;
  }

  eq(column: string, value: unknown) {
    this.#filters.push({ column, op: "eq", value });
    return this;
  }

  in(column: string, value: unknown) {
    this.#filters.push({ column, op: "in", value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.#filters.push({ column, op: "lte", value });
    return this;
  }

  maybeSingle() {
    return this.#finish("maybeSingle");
  }

  single() {
    return this.#finish("single");
  }

  then(
    onfulfilled?: ((value: SupabaseQueryResult) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) {
    return this.#finish("then").then(onfulfilled, onrejected);
  }

  #finish(terminal: SupabaseOperation["terminal"]) {
    this.supabase.operations.push({
      action: this.#action ?? "select",
      filters: [...this.#filters],
      ...(this.#options !== undefined ? { options: this.#options } : {}),
      ...(this.#payload !== undefined ? { payload: this.#payload } : {}),
      ...(this.#select !== undefined ? { select: this.#select } : {}),
      table: this.table,
      terminal,
    });
    return Promise.resolve(this.supabase.nextResult());
  }
}

function result(
  data: unknown = null,
  error: SupabaseError | null = null,
): SupabaseQueryResult {
  return { data, error };
}

function order(
  overrides: Partial<{
    id: string;
    status: string;
    stripe_payment_intent: string | null;
    stripe_session_id: string | null;
    total_cents: number;
    user_id: string;
  }> = {},
) {
  return {
    id: "order_1",
    status: "pending",
    stripe_payment_intent: null,
    stripe_session_id: "cs_1",
    total_cents: 1299,
    user_id: "user_1",
    ...overrides,
  };
}

async function withMockedStoreBoundary(
  input: {
    stripe?: {
      checkoutSessions?: unknown[];
      invoices?: unknown[];
      paymentIntents?: unknown[];
    };
    supabase: SupabaseStub;
  },
  run: (context: StoreBoundaryContext) => Promise<void>,
) {
  setStoreModuleEnv();
  const [store, adminModule, stripeModule] = await Promise.all([
    import("./store.ts"),
    import("./supabase-admin.ts"),
    import("./stripe.ts"),
  ]);
  const admin = adminModule.supabaseAdmin as unknown as {
    auth?: { stopAutoRefresh?: () => void };
    from: (table: string) => unknown;
    realtime?: { disconnect?: () => void };
  };
  const stripe = stripeModule.stripe as unknown as {
    checkout: {
      sessions: {
        retrieve: (id: string, options?: unknown) => Promise<unknown> | unknown;
      };
    };
    invoices: {
      retrieve: (id: string, options?: unknown) => Promise<unknown> | unknown;
    };
    paymentIntents: {
      retrieve: (id: string, options?: unknown) => Promise<unknown> | unknown;
    };
  };

  const stripeCalls: StripeCalls = {
    checkoutSessionsRetrieve: [],
    invoicesRetrieve: [],
    paymentIntentsRetrieve: [],
  };
  const checkoutSessions = [...(input.stripe?.checkoutSessions ?? [])];
  const invoices = [...(input.stripe?.invoices ?? [])];
  const paymentIntents = [...(input.stripe?.paymentIntents ?? [])];

  const originalFrom = admin.from;
  const originalCheckoutSessionRetrieve = stripe.checkout.sessions.retrieve;
  const originalInvoiceRetrieve = stripe.invoices.retrieve;
  const originalPaymentIntentRetrieve = stripe.paymentIntents.retrieve;

  admin.from = input.supabase.from;
  stripe.checkout.sessions.retrieve = (id: string, options?: unknown) => {
    stripeCalls.checkoutSessionsRetrieve.push({ id, options });
    return nextStripeResponse(checkoutSessions, "checkout.sessions.retrieve");
  };
  stripe.invoices.retrieve = (id: string, options?: unknown) => {
    stripeCalls.invoicesRetrieve.push({ id, options });
    return nextStripeResponse(invoices, "invoices.retrieve");
  };
  stripe.paymentIntents.retrieve = (id: string, options?: unknown) => {
    stripeCalls.paymentIntentsRetrieve.push({ id, options });
    return nextStripeResponse(paymentIntents, "paymentIntents.retrieve");
  };

  try {
    await run({ store, stripeCalls, supabase: input.supabase });
  } finally {
    admin.from = originalFrom;
    stripe.checkout.sessions.retrieve = originalCheckoutSessionRetrieve;
    stripe.invoices.retrieve = originalInvoiceRetrieve;
    stripe.paymentIntents.retrieve = originalPaymentIntentRetrieve;
    admin.auth?.stopAutoRefresh?.();
    admin.realtime?.disconnect?.();
  }
}

function setStoreModuleEnv() {
  Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  Deno.env.set("STRIPE_SECRET_KEY", "sk_test_mock");
  Deno.env.set("OGL_LICENSE_SIGNING_KEY", signingSeedHex);
}

function nextStripeResponse(queue: unknown[], operation: string) {
  if (queue.length === 0) {
    throw new Error(`Unexpected Stripe ${operation} call`);
  }
  return queue.shift();
}

function operationWithoutPayload(operation: SupabaseOperation) {
  return {
    action: operation.action,
    filters: operation.filters,
    ...(operation.options !== undefined ? { options: operation.options } : {}),
    ...(operation.select !== undefined ? { select: operation.select } : {}),
    table: operation.table,
    terminal: operation.terminal,
  };
}

function normalizeStoreInvoicePayload(
  payload: unknown,
): Record<string, unknown> {
  const record = payload as Record<string, unknown>;
  const metadata = record.metadata as Record<string, unknown>;
  return {
    ...record,
    metadata: {
      ...metadata,
      synced_at: timestampToken(metadata.synced_at),
    },
    updated_at: timestampToken(record.updated_at),
  };
}

function normalizeRefundPayload(payload: unknown): Record<string, unknown> {
  const record = normalizeTimestamps(payload) as Record<string, unknown>;
  const metadata = record.metadata as Record<string, unknown> | undefined;
  return metadata
    ? {
      ...record,
      metadata: {
        ...metadata,
        synced_at: timestampToken(metadata.synced_at),
      },
    }
    : record;
}

function normalizeTimestamps(payload: unknown) {
  const record = payload as Record<string, unknown>;
  const normalized = { ...record };
  for (
    const key of [
      "cancelled_at",
      "processed_at",
      "requested_at",
      "reviewed_at",
      "updated_at",
    ]
  ) {
    if (key in normalized) {
      normalized[key] = timestampToken(normalized[key]);
    }
  }
  return normalized;
}

function timestampToken(value: unknown) {
  assert(typeof value === "string", `Expected timestamp string, got ${value}`);
  assertEquals(new Date(value).toISOString(), value);
  return "<timestamp>";
}
