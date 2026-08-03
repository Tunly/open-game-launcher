import {
  assertEquals,
  assertObjectMatch,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { createStripeCreateCheckoutAdapters } from "./adapters.ts";
import {
  StoreCheckoutProductConflictError,
  type StripeCheckoutSessionParams,
} from "./handler.ts";

Deno.test("stripe checkout adapters authenticate without live Supabase secrets", async () => {
  const calls: unknown[] = [];
  const adapters = createStripeCreateCheckoutAdapters({
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
    await adapters.authenticateRequest(new Request("https://example.test")),
    { status: "missing" },
  );
  assertEquals(
    await adapters.authenticateRequest(
      new Request("https://example.test", {
        headers: { Authorization: "Bearer test-token" },
      }),
    ),
    { status: "ok", userId: "user-1" },
  );
  assertEquals(calls, [
    {
      options: {
        auth: { persistSession: false },
        global: { headers: { Authorization: "Bearer test-token" } },
      },
      supabaseAnonKey: "anon-test",
      supabaseUrl: "https://supabase.test",
    },
  ]);
});

Deno.test("stripe checkout adapters map duplicate order insert to duplicate_attempt", async () => {
  const operations: Operation[] = [];
  const adapters = createStripeCreateCheckoutAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      error: {
        code: "23505",
        message: "duplicate key value violates unique constraint",
      },
      operations,
    }),
  });

  const result = await adapters.createOrder({
    checkoutAttemptId: "attempt-1",
    subtotalCents: 0,
    userId: "user-1",
  });

  assertEquals(result, {
    errorMessage: "duplicate key value violates unique constraint",
    status: "duplicate_attempt",
  });
  assertEquals(operations, [
    { args: ["store_orders"], method: "from" },
    {
      args: [{
        checkout_attempt_id: "attempt-1",
        currency: "eur",
        paid_at: null,
        payment_method: "free",
        status: "pending",
        subtotal_cents: 0,
        tax_cents: 0,
        total_cents: 0,
        user_id: "user-1",
      }],
      method: "insert",
      table: "store_orders",
    },
    {
      args: ["id, stripe_session_id, status"],
      method: "select",
      table: "store_orders",
    },
    { args: [], method: "single", table: "store_orders" },
  ]);
});

Deno.test("stripe checkout adapters write free fulfillment order fields without Stripe", async () => {
  const operations: Operation[] = [];
  const adapters = createStripeCreateCheckoutAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({ operations }),
  });

  await adapters.markFreeOrderFulfilled("order-free");

  const update = operations.find((operation) => operation.method === "update");
  assertObjectMatch(update?.args[0] as Record<string, unknown>, {
    status: "fulfilled",
  });
  assertEquals(
    typeof (update?.args[0] as Record<string, unknown>).paid_at,
    "string",
  );
  assertEquals(
    typeof (update?.args[0] as Record<string, unknown>).updated_at,
    "string",
  );
  assertEquals(operations.at(-1), {
    args: ["id", "order-free"],
    method: "eq",
    table: "store_orders",
  });
});

Deno.test("stripe checkout adapters scope cart deletion to user and product ids", async () => {
  const operations: Operation[] = [];
  const adapters = createStripeCreateCheckoutAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({ operations }),
  });

  await adapters.deleteCartItems("user-1", ["product-1", "product-2"]);

  assertEquals(operations, [
    { args: ["store_cart_items"], method: "from" },
    { args: [], method: "delete", table: "store_cart_items" },
    { args: ["user_id", "user-1"], method: "eq", table: "store_cart_items" },
    {
      args: ["product_id", ["product-1", "product-2"]],
      method: "in",
      table: "store_cart_items",
    },
  ]);
});

Deno.test("stripe checkout adapters read product and owned license query shapes", async () => {
  const operations: Operation[] = [];
  const adapters = createStripeCreateCheckoutAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      dataByTable: {
        store_licenses: [{ product_id: "product-owned" }],
        store_products: [{
          discount_percent: 0,
          id: "product-1",
          platforms: ["pc"],
          price_cents: 1200,
          title: "Game",
        }],
      },
      operations,
    }),
  });

  assertEquals(await adapters.readProducts(["product-1"]), [{
    discount_percent: 0,
    id: "product-1",
    platforms: ["pc"],
    price_cents: 1200,
    title: "Game",
  }]);
  assertEquals(
    await adapters.readOwnedProductIds("user-1", ["product-1"]),
    ["product-owned"],
  );
  assertEquals(operations, [
    { args: ["store_products"], method: "from" },
    {
      args: ["id, title, platforms, price_cents, discount_percent"],
      method: "select",
      table: "store_products",
    },
    { args: ["status", "published"], method: "eq", table: "store_products" },
    { args: ["id", ["product-1"]], method: "in", table: "store_products" },
    { args: ["store_licenses"], method: "from" },
    { args: ["product_id"], method: "select", table: "store_licenses" },
    { args: ["user_id", "user-1"], method: "eq", table: "store_licenses" },
    { args: ["is_revoked", false], method: "eq", table: "store_licenses" },
    {
      args: ["product_id", ["product-1"]],
      method: "in",
      table: "store_licenses",
    },
  ]);
});

Deno.test("stripe checkout adapters attach Stripe session update shape", async () => {
  const operations: Operation[] = [];
  const adapters = createStripeCreateCheckoutAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({ operations }),
  });

  await adapters.attachStripeSessionToOrder("order-1", {
    paymentIntentId: "pi_1",
    sessionId: "cs_1",
  });

  const update = operations.find((operation) => operation.method === "update");
  assertObjectMatch(update?.args[0] as Record<string, unknown>, {
    stripe_payment_intent: "pi_1",
    stripe_session_id: "cs_1",
  });
  assertEquals(
    typeof (update?.args[0] as Record<string, unknown>).updated_at,
    "string",
  );
  assertEquals(operations.at(-1), {
    args: ["id", "order-1"],
    method: "eq",
    table: "store_orders",
  });
});

Deno.test("stripe checkout adapters classify DB product claim conflicts", async () => {
  const adapters = createStripeCreateCheckoutAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      error: {
        code: "23505",
        message: "Store product is already reserved or owned by this user",
      },
    }),
  });

  await assertRejects(
    () =>
      adapters.createOrderItems("order-2", [{
        price_cents_snapshot: 1500,
        product_id: "product-1",
        quantity: 1,
        title_snapshot: "Game",
      }]),
    StoreCheckoutProductConflictError,
    "already reserved or owned",
  );
});

Deno.test("stripe checkout adapters return only checkout session response fields", async () => {
  const stripeCalls: unknown[] = [];
  const adapters = createStripeCreateCheckoutAdapters({
    ...deps(),
    stripe: {
      checkout: {
        sessions: {
          create: async (params, options) => {
            stripeCalls.push({ method: "create", options, params });
            return {
              id: "cs_created",
              livemode: true,
              payment_intent: { id: "pi_created" },
              url: "https://checkout.stripe.test/created",
            };
          },
          retrieve: async (sessionId) => {
            stripeCalls.push({ method: "retrieve", sessionId });
            return {
              id: sessionId,
              metadata: { order_id: "order-1" },
              payment_intent: "pi_retrieved",
              url: "https://checkout.stripe.test/retrieved",
            };
          },
        },
      },
    },
  });
  const params = {
    metadata: { order_id: "order-1", user_id: "user-1" },
  } as unknown as StripeCheckoutSessionParams;

  assertEquals(
    await adapters.createCheckoutSession(params, {
      idempotencyKey: "store-checkout:user-1:attempt-1",
    }),
    {
      id: "cs_created",
      payment_intent: { id: "pi_created" },
      url: "https://checkout.stripe.test/created",
    },
  );
  assertEquals(await adapters.retrieveCheckoutSession("cs_existing"), {
    id: "cs_existing",
    payment_intent: "pi_retrieved",
    url: "https://checkout.stripe.test/retrieved",
  });
  assertEquals(stripeCalls, [
    {
      method: "create",
      options: { idempotencyKey: "store-checkout:user-1:attempt-1" },
      params,
    },
    { method: "retrieve", sessionId: "cs_existing" },
  ]);
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
        getUser: async () => ({ data: { user: { id: "user-default" } } }),
      },
    }),
    stripe: {
      checkout: {
        sessions: {
          create: async () => ({
            id: "cs_default",
            payment_intent: null,
            url: "https://checkout.stripe.test/default",
          }),
          retrieve: async (sessionId: string) => ({
            id: sessionId,
            payment_intent: null,
            url: "https://checkout.stripe.test/retrieved",
          }),
        },
      },
    },
    supabaseAdmin: supabaseStub(),
    supabaseAnonKey: "anon-test",
    supabaseUrl: "https://supabase.test",
  };
}

function supabaseStub(options: {
  data?: unknown;
  dataByTable?: Record<string, unknown>;
  error?: { code?: string; message?: string } | null;
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
        delete() {
          operations.push({ args: [], method: "delete", table });
          return query;
        },
        eq(column: string, value: unknown) {
          operations.push({ args: [column, value], method: "eq", table });
          return query;
        },
        in(column: string, values: unknown[]) {
          operations.push({ args: [column, values], method: "in", table });
          return query;
        },
        insert(value: unknown) {
          operations.push({ args: [value], method: "insert", table });
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
      };
      return query;
    },
  };
}
