// deno-lint-ignore-file no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireEnv } from "./env.ts";

type SupabaseQueryError = { message: string };
type SupabaseQueryResult<T> = {
  data: T | null;
  error: SupabaseQueryError | null;
};

type StoreCustomerRecord = {
  stripe_customer_id?: unknown;
};

type StoreCustomersTable = {
  eq: (column: string, value: unknown) => StoreCustomersTable;
  maybeSingle: () => Promise<SupabaseQueryResult<StoreCustomerRecord>>;
  select: (columns: string) => StoreCustomersTable;
  upsert: (value: {
    stripe_customer_id: string;
    user_id: string;
  }, options: {
    ignoreDuplicates: boolean;
    onConflict: string;
  }) => PromiseLike<SupabaseQueryResult<unknown>>;
};

type CheckoutUser = {
  user?: {
    email?: string | null;
  } | null;
};

type SupabaseCustomerAdminClient = {
  auth: {
    admin: {
      getUserById: (
        userId: string,
      ) => Promise<SupabaseQueryResult<CheckoutUser>>;
    };
  };
  from: (table: string) => unknown;
};

type StripeCustomerClient = {
  customers: {
    create: (input: {
      email?: string;
      metadata: { user_id: string };
    }, options: { idempotencyKey: string }) => Promise<{ id: string }>;
  };
};

export type CreateOrRetrieveCustomerDeps = {
  logError?: (message: string, error: unknown) => void;
  stripe: StripeCustomerClient;
  supabaseAdmin?: SupabaseCustomerAdminClient;
};

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

export const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
  },
);

/** Get or create a Stripe customer ID for the given Supabase user. */
export async function createOrRetrieveCustomer(
  userId: string,
  deps: CreateOrRetrieveCustomerDeps,
): Promise<string> {
  const adminClient = (deps.supabaseAdmin ??
    supabaseAdmin) as SupabaseCustomerAdminClient;
  const stripeClient = deps.stripe;
  const storeCustomers = storeCustomersTable(adminClient);
  const { data: customerRecord, error: customerError } = await storeCustomers
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (customerError) {
    logCustomerBootstrapError(
      deps,
      "Failed to read Stripe customer mapping",
      customerError,
    );
    throw new Error("Store customer lookup failed.");
  }

  const existingCustomerId =
    typeof customerRecord?.stripe_customer_id === "string"
      ? customerRecord.stripe_customer_id
      : null;
  if (existingCustomerId) return existingCustomerId;

  const { data: user, error: userError } = await adminClient.auth.admin
    .getUserById(userId);
  if (userError) {
    logCustomerBootstrapError(deps, "Failed to read checkout user", userError);
    throw new Error("Checkout account lookup failed.");
  }

  let customer: { id: string };
  try {
    customer = await stripeClient.customers.create({
      email: user?.user?.email ?? undefined,
      metadata: { user_id: userId },
    }, {
      idempotencyKey: `og-store-customer:${userId}`,
    });
  } catch (error) {
    logCustomerBootstrapError(deps, "Failed to create Stripe customer", error);
    throw new Error("Stripe customer creation failed.");
  }

  const { error: upsertError } = await storeCustomersTable(adminClient).upsert(
    {
      user_id: userId,
      stripe_customer_id: customer.id,
    },
    {
      ignoreDuplicates: true,
      onConflict: "user_id",
    },
  );
  if (upsertError) {
    logCustomerBootstrapError(
      deps,
      "Failed to persist Stripe customer mapping",
      upsertError,
    );
    throw new Error("Store customer mapping write failed.");
  }

  // A concurrent request may have won the mapping insert. Read the committed
  // row back instead of assuming this request's candidate owns the mapping.
  const { data: persistedRecord, error: persistedError } =
    await storeCustomersTable(adminClient)
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();
  const persistedCustomerId =
    typeof persistedRecord?.stripe_customer_id === "string"
      ? persistedRecord.stripe_customer_id
      : null;
  if (persistedError || !persistedCustomerId) {
    logCustomerBootstrapError(
      deps,
      "Failed to confirm Stripe customer mapping",
      persistedError ?? new Error("Stripe customer mapping is missing"),
    );
    throw new Error("Store customer mapping confirmation failed.");
  }

  return persistedCustomerId;
}

function storeCustomersTable(
  adminClient: SupabaseCustomerAdminClient,
): StoreCustomersTable {
  return adminClient.from("store_customers") as StoreCustomersTable;
}

function logCustomerBootstrapError(
  deps: CreateOrRetrieveCustomerDeps,
  message: string,
  error: unknown,
) {
  deps.logError?.(message, error);
}
