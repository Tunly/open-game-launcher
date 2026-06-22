import type { MobilePushRegistrationMutationPlan } from "./contract.ts";
import type {
  MobilePushRegistrationApplyResult,
  MobilePushRegistrationHandlerDeps,
} from "./handler.ts";

type SupabaseQueryResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

type SupabaseTableClient = {
  delete: () => SupabaseTableClient;
  eq: (column: string, value: unknown) => SupabaseTableClient;
  insert: (value: unknown) => SupabaseTableClient;
  is: (column: string, value: unknown) => SupabaseTableClient;
  maybeSingle: () => Promise<SupabaseQueryResult<unknown>>;
  select: (columns: string) => SupabaseTableClient;
  single: () => Promise<SupabaseQueryResult<unknown>>;
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

export type MobilePushRegistrationAdapterDeps = {
  createClient: (
    supabaseUrl: string,
    supabaseAnonKey: string,
    options: {
      auth: { autoRefreshToken: false; persistSession: false };
      global: { headers: { Authorization: string } };
    },
  ) => CallerClient;
  supabaseAdmin: SupabaseAdminClient;
  supabaseAnonKey: string;
  supabaseUrl: string;
};

export function createMobilePushRegistrationAdapters(
  deps: MobilePushRegistrationAdapterDeps,
): MobilePushRegistrationHandlerDeps {
  return {
    applyMutation: (plan) => applyMutation(deps.supabaseAdmin, plan),
    getAuthenticatedUserId: (request) => getAuthenticatedUserId(deps, request),
  };
}

async function getAuthenticatedUserId(
  deps: Pick<
    MobilePushRegistrationAdapterDeps,
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
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    },
  );
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

async function applyMutation(
  supabaseAdmin: SupabaseAdminClient,
  plan: MobilePushRegistrationMutationPlan,
): Promise<MobilePushRegistrationApplyResult> {
  if (plan.status === "error") {
    throw new Error(plan.error);
  }

  if (plan.action === "delete") {
    const { data, error } = await tableClient(
      supabaseAdmin,
      "mobile_push_registrations",
    )
      .delete()
      .eq("id", plan.registrationId)
      .eq("owner_id", plan.ownerId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(
        `Failed to unregister mobile push token: ${error.message}`,
      );
    }

    return {
      action: "delete",
      deleted: Boolean((data as { id?: unknown } | null)?.id),
      registrationId: plan.registrationId,
    };
  }

  const existing = await tableClient(supabaseAdmin, "mobile_push_registrations")
    .select("id")
    .eq("owner_id", plan.row.owner_id)
    .eq("platform", plan.row.platform)
    .eq("token_hash", plan.row.token_hash)
    .is("revoked_at", null)
    .maybeSingle();

  if (existing.error) {
    throw new Error(
      `Failed to read mobile push registration: ${existing.error.message}`,
    );
  }

  const now = new Date().toISOString();
  const row = {
    ...plan.row,
    last_registered_at: now,
    revoked_at: null,
  };
  const existingId = (existing.data as { id?: unknown } | null)?.id;
  const mutation = typeof existingId === "string"
    ? await tableClient(supabaseAdmin, "mobile_push_registrations")
      .update(row)
      .eq("id", existingId)
      .select("id, updated_at")
      .single()
    : await tableClient(supabaseAdmin, "mobile_push_registrations")
      .insert(row)
      .select("id, updated_at")
      .single();

  if (mutation.error) {
    throw new Error(
      `Failed to register mobile push token: ${mutation.error.message}`,
    );
  }

  const registrationId =
    typeof (mutation.data as { id?: unknown } | null)?.id === "string"
      ? (mutation.data as { id: string }).id
      : null;
  if (!registrationId) {
    throw new Error("Mobile push registration did not return an id.");
  }

  const updatedAt = (mutation.data as { updated_at?: unknown } | null)
    ?.updated_at;
  return {
    action: "upsert",
    registrationId,
    updatedAt: typeof updatedAt === "string" ? updatedAt : null,
  };
}

function tableClient(
  supabaseAdmin: SupabaseAdminClient,
  table: string,
): SupabaseTableClient {
  return supabaseAdmin.from(table) as SupabaseTableClient;
}
