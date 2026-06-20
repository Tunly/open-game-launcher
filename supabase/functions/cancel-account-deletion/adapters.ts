import {
  buildCancelAccountDeletionMutation,
  buildPendingAccountDeletionFilters,
} from "../_shared/account-deletion-contract.ts";
import type { AccountDeletionAuthResult } from "../_shared/account-deletion-handler.ts";
import type {
  CancelAccountDeletionHandlerDeps,
  DeletionRequestRow,
} from "./handler.ts";

type SupabaseQueryResult<T> = {
  data: T | null;
  error: Error | null;
};

type SupabaseTableClient = {
  eq: (column: string, value: string) => SupabaseTableClient;
  maybeSingle: <T>() => Promise<SupabaseQueryResult<T>>;
  select: (columns: string) => SupabaseTableClient;
  single: <T>() => Promise<SupabaseQueryResult<T>>;
  update: (value: unknown) => SupabaseTableClient;
};

type SupabaseAdminClient = {
  from: (table: string) => unknown;
};

type AuthenticatedRequestResult = { user: { id: string } } | Response;

export type CancelAccountDeletionAdapterDeps = {
  authenticateRequest: (
    request: Request,
  ) => Promise<AuthenticatedRequestResult>;
  supabaseAdmin: SupabaseAdminClient;
};

export type CancelAccountDeletionAdapters = Omit<
  CancelAccountDeletionHandlerDeps,
  "now"
>;

export function createCancelAccountDeletionAdapters(
  deps: CancelAccountDeletionAdapterDeps,
): CancelAccountDeletionAdapters {
  return {
    authenticateRequest: (request) => authenticateRequest(deps, request),
    cancelDeletionRequest: (mutation) =>
      cancelDeletionRequest(deps.supabaseAdmin, mutation),
    findPendingRequestId: (userId) =>
      findPendingRequestId(deps.supabaseAdmin, userId),
  };
}

async function authenticateRequest(
  deps: Pick<CancelAccountDeletionAdapterDeps, "authenticateRequest">,
  request: Request,
): Promise<AccountDeletionAuthResult> {
  const authResult = await deps.authenticateRequest(request);
  if (authResult instanceof Response) {
    return authResult;
  }

  return { userId: authResult.user.id };
}

async function findPendingRequestId(
  supabaseAdmin: SupabaseAdminClient,
  userId: string,
): Promise<string | null> {
  let pendingQuery = tableClient(supabaseAdmin, "account_deletion_requests")
    .select("id");
  for (const filter of buildPendingAccountDeletionFilters(userId)) {
    pendingQuery = pendingQuery.eq(filter.column, filter.value);
  }
  const { data: pending, error: pendingError } = await pendingQuery
    .maybeSingle<{ id: string }>();

  if (pendingError) {
    throw pendingError;
  }

  return pending?.id ?? null;
}

async function cancelDeletionRequest(
  supabaseAdmin: SupabaseAdminClient,
  mutation: ReturnType<typeof buildCancelAccountDeletionMutation>,
): Promise<DeletionRequestRow> {
  let updateQuery = tableClient(supabaseAdmin, "account_deletion_requests")
    .update(mutation.update);
  for (const filter of mutation.filters) {
    updateQuery = updateQuery.eq(filter.column, filter.value);
  }
  const { data, error } = await updateQuery
    .select("*")
    .single<DeletionRequestRow>();

  if (error) {
    throw error;
  }

  return data as DeletionRequestRow;
}

function tableClient(
  supabaseAdmin: SupabaseAdminClient,
  table: string,
): SupabaseTableClient {
  return supabaseAdmin.from(table) as SupabaseTableClient;
}
