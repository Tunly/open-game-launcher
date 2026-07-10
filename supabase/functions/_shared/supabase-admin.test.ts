import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
Deno.env.set("STRIPE_SECRET_KEY", "sk_test_mock");

const adminModule = await import("./supabase-admin.ts");
const createOrRetrieveCustomer = adminModule.createOrRetrieveCustomer;
stopSupabaseClient(adminModule.supabaseAdmin);

Deno.test("createOrRetrieveCustomer reuses an existing store customer", async () => {
  const operations: Operation[] = [];
  const stripeCalls: StripeCreateParams[] = [];

  const customerId = await createOrRetrieveCustomer("user-1", {
    stripe: stripeStub({ calls: stripeCalls }),
    supabaseAdmin: supabaseStub({
      existingCustomerId: "cus_existing",
      operations,
    }),
  });

  assertEquals(customerId, "cus_existing");
  assertEquals(stripeCalls, []);
  assertEquals(operations, [
    { args: ["store_customers"], method: "from" },
    {
      args: ["stripe_customer_id"],
      method: "select",
      table: "store_customers",
    },
    {
      args: ["user_id", "user-1"],
      method: "eq",
      table: "store_customers",
    },
    { args: [], method: "maybeSingle", table: "store_customers" },
  ]);
});

Deno.test("createOrRetrieveCustomer creates Stripe and store rows without profiles metadata", async () => {
  const operations: Operation[] = [];
  const stripeCalls: StripeCreateParams[] = [];
  const stripeIdempotencyKeys: string[] = [];

  const customerId = await createOrRetrieveCustomer("user-1", {
    stripe: stripeStub({
      calls: stripeCalls,
      customerId: "cus_created",
      idempotencyKeys: stripeIdempotencyKeys,
    }),
    supabaseAdmin: supabaseStub({
      operations,
      userEmail: "player@example.test",
    }),
  });

  assertEquals(customerId, "cus_created");
  assertEquals(stripeCalls, [{
    email: "player@example.test",
    metadata: { user_id: "user-1" },
  }]);
  assertEquals(stripeIdempotencyKeys, ["og-store-customer:user-1"]);
  assertNoProfileReads(operations);
  assertEquals(operations, [
    { args: ["store_customers"], method: "from" },
    {
      args: ["stripe_customer_id"],
      method: "select",
      table: "store_customers",
    },
    {
      args: ["user_id", "user-1"],
      method: "eq",
      table: "store_customers",
    },
    { args: [], method: "maybeSingle", table: "store_customers" },
    { args: ["user-1"], method: "getUserById" },
    { args: ["store_customers"], method: "from" },
    {
      args: [
        {
          stripe_customer_id: "cus_created",
          user_id: "user-1",
        },
        { ignoreDuplicates: true, onConflict: "user_id" },
      ],
      method: "upsert",
      table: "store_customers",
    },
    { args: ["store_customers"], method: "from" },
    {
      args: ["stripe_customer_id"],
      method: "select",
      table: "store_customers",
    },
    {
      args: ["user_id", "user-1"],
      method: "eq",
      table: "store_customers",
    },
    { args: [], method: "maybeSingle", table: "store_customers" },
  ]);
});

Deno.test("createOrRetrieveCustomer returns a concurrent mapping winner", async () => {
  const stripeCalls: StripeCreateParams[] = [];

  const customerId = await createOrRetrieveCustomer("user-1", {
    stripe: stripeStub({ calls: stripeCalls, customerId: "cus_candidate" }),
    supabaseAdmin: supabaseStub({ persistedCustomerId: "cus_winner" }),
  });

  assertEquals(customerId, "cus_winner");
  assertEquals(stripeCalls.length, 1);
});

Deno.test("createOrRetrieveCustomer logs and propagates customer read errors", async () => {
  const readError = { message: "read failed" };
  const logger = logRecorder();
  const stripeCalls: StripeCreateParams[] = [];

  const error = await assertRejects(
    () =>
      createOrRetrieveCustomer("user-1", {
        logError: logger.logError,
        stripe: stripeStub({ calls: stripeCalls }),
        supabaseAdmin: supabaseStub({ customerReadError: readError }),
      }),
    Error,
  );

  assertStringIncludes(
    error.message,
    "Store customer lookup failed.",
  );
  assertEquals(stripeCalls, []);
  assertEquals(logger.logs, [{
    error: readError,
    message: "Failed to read Stripe customer mapping",
  }]);
});

Deno.test("createOrRetrieveCustomer logs and propagates checkout user read errors", async () => {
  const userError = { message: "auth read failed" };
  const logger = logRecorder();
  const stripeCalls: StripeCreateParams[] = [];

  const error = await assertRejects(
    () =>
      createOrRetrieveCustomer("user-1", {
        logError: logger.logError,
        stripe: stripeStub({ calls: stripeCalls }),
        supabaseAdmin: supabaseStub({ userError }),
      }),
    Error,
  );

  assertStringIncludes(
    error.message,
    "Checkout account lookup failed.",
  );
  assertEquals(stripeCalls, []);
  assertEquals(logger.logs, [{
    error: userError,
    message: "Failed to read checkout user",
  }]);
});

Deno.test("createOrRetrieveCustomer logs and propagates store customer write errors", async () => {
  const upsertError = { message: "write failed" };
  const logger = logRecorder();
  const stripeCalls: StripeCreateParams[] = [];

  const error = await assertRejects(
    () =>
      createOrRetrieveCustomer("user-1", {
        logError: logger.logError,
        stripe: stripeStub({ calls: stripeCalls, customerId: "cus_created" }),
        supabaseAdmin: supabaseStub({ upsertError }),
      }),
    Error,
  );

  assertStringIncludes(
    error.message,
    "Store customer mapping write failed.",
  );
  assertEquals(stripeCalls, [{
    email: "player@example.test",
    metadata: { user_id: "user-1" },
  }]);
  assertEquals(logger.logs, [{
    error: upsertError,
    message: "Failed to persist Stripe customer mapping",
  }]);
});

Deno.test("createOrRetrieveCustomer logs and propagates Stripe customer errors", async () => {
  const stripeError = new Error("Stripe down");
  const logger = logRecorder();
  const stripeCalls: StripeCreateParams[] = [];

  const error = await assertRejects(
    () =>
      createOrRetrieveCustomer("user-1", {
        logError: logger.logError,
        stripe: stripeStub({ calls: stripeCalls, error: stripeError }),
        supabaseAdmin: supabaseStub(),
      }),
    Error,
  );

  assertStringIncludes(
    error.message,
    "Stripe customer creation failed.",
  );
  assertEquals(stripeCalls, [{
    email: "player@example.test",
    metadata: { user_id: "user-1" },
  }]);
  assertEquals(logger.logs.length, 1);
  assertEquals(logger.logs[0].message, "Failed to create Stripe customer");
  assertStrictEquals(logger.logs[0].error, stripeError);
});

type DbError = { message: string };

type Operation = {
  args: unknown[];
  method: string;
  table?: string;
};

type StripeCreateParams = {
  email?: string;
  metadata: { user_id: string };
};

function supabaseStub(options: {
  customerReadError?: DbError | null;
  existingCustomerId?: unknown;
  operations?: Operation[];
  persistedCustomerId?: string;
  upsertError?: DbError | null;
  userEmail?: string | null;
  userError?: DbError | null;
} = {}) {
  const operations = options.operations ?? [];
  let didUpsert = false;
  let upsertedCustomerId: string | null = null;

  return {
    auth: {
      admin: {
        getUserById: (userId: string) => {
          operations.push({ args: [userId], method: "getUserById" });
          return Promise.resolve({
            data: {
              user: {
                app_metadata: { stripe_customer_id: "cus_app_metadata" },
                email: options.userEmail ?? "player@example.test",
                user_metadata: { stripe_customer_id: "cus_user_metadata" },
              },
            },
            error: options.userError ?? null,
          });
        },
      },
    },
    from: (table: string) => {
      operations.push({ args: [table], method: "from" });
      if (table === "profiles") {
        throw new Error("profiles metadata must not be queried");
      }

      const query = {
        eq(column: string, value: unknown) {
          operations.push({ args: [column, value], method: "eq", table });
          return query;
        },
        maybeSingle() {
          operations.push({ args: [], method: "maybeSingle", table });
          const customerId = didUpsert
            ? options.persistedCustomerId ?? upsertedCustomerId
            : options.existingCustomerId;
          const data = typeof customerId === "undefined" || customerId === null
            ? null
            : { stripe_customer_id: customerId };
          return Promise.resolve({
            data,
            error: options.customerReadError ?? null,
          });
        },
        select(columns: string) {
          operations.push({ args: [columns], method: "select", table });
          return query;
        },
        upsert(value: unknown, upsertOptions: unknown) {
          operations.push({
            args: [value, upsertOptions],
            method: "upsert",
            table,
          });
          didUpsert = true;
          upsertedCustomerId = (value as { stripe_customer_id?: string })
            .stripe_customer_id ?? null;
          return Promise.resolve({
            data: null,
            error: options.upsertError ?? null,
          });
        },
      };

      return query;
    },
  };
}

function stripeStub(options: {
  calls?: StripeCreateParams[];
  customerId?: string;
  error?: unknown;
  idempotencyKeys?: string[];
} = {}) {
  return {
    customers: {
      create: (
        input: StripeCreateParams,
        requestOptions: { idempotencyKey: string },
      ) => {
        options.calls?.push(input);
        options.idempotencyKeys?.push(requestOptions.idempotencyKey);
        if (options.error) {
          throw options.error;
        }
        return Promise.resolve({ id: options.customerId ?? "cus_created" });
      },
    },
  };
}

function logRecorder() {
  const logs: Array<{ error: unknown; message: string }> = [];
  return {
    logError: (message: string, error: unknown) => {
      logs.push({ error, message });
    },
    logs,
  };
}

function assertNoProfileReads(operations: Operation[]) {
  assertEquals(
    operations.some((operation) => operation.args.includes("profiles")),
    false,
  );
}

function stopSupabaseClient(client: unknown) {
  const supabaseClient = client as {
    auth?: { stopAutoRefresh?: () => void };
    realtime?: { disconnect?: () => void };
  };
  supabaseClient.auth?.stopAutoRefresh?.();
  supabaseClient.realtime?.disconnect?.();
}
