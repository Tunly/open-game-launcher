import {
  ACTIVE_ACCOUNT_DELETION_STATUSES,
  buildActiveAccountDeletionOwnerFilter,
} from "../_shared/account-deletion-contract.ts";
import type { AccountDeletionAuthResult } from "../_shared/account-deletion-handler.ts";
import type {
  CreateDeletionRequestInput,
  DeletionRequestRow,
  RequestAccountDeletionHandlerDeps,
} from "./handler.ts";

type SupabaseQueryResult<T> = {
  data: T | null;
  error: unknown;
};

type SupabaseTableClient = {
  eq: (column: string, value: string) => SupabaseTableClient;
  in: (column: string, values: string[]) => SupabaseTableClient;
  insert: (value: unknown) => SupabaseTableClient;
  maybeSingle: <T>() => Promise<SupabaseQueryResult<T>>;
  select: (columns: string) => SupabaseTableClient;
  single: <T>() => Promise<SupabaseQueryResult<T>>;
};

type SupabaseAdminClient = {
  from: (table: string) => unknown;
};

type AuthenticatedRequestResult = { user: { id: string } } | Response;

export type RequestAccountDeletionAdapterDeps = {
  authenticateRequest: (
    request: Request,
  ) => Promise<AuthenticatedRequestResult>;
  supabaseAdmin: SupabaseAdminClient;
};

export function createRequestAccountDeletionAdapters(
  deps: RequestAccountDeletionAdapterDeps,
): RequestAccountDeletionHandlerDeps {
  return {
    authenticateRequest: (request) => authenticateRequest(deps, request),
    createDeletionRequest: (input) =>
      createDeletionRequest(deps.supabaseAdmin, input),
    findActiveRequest: (userId) =>
      findActiveRequest(deps.supabaseAdmin, userId),
  };
}

async function authenticateRequest(
  deps: Pick<RequestAccountDeletionAdapterDeps, "authenticateRequest">,
  request: Request,
): Promise<AccountDeletionAuthResult> {
  const authResult = await deps.authenticateRequest(request);
  if (authResult instanceof Response) {
    return authResult;
  }

  return { userId: authResult.user.id };
}

async function findActiveRequest(
  supabaseAdmin: SupabaseAdminClient,
  userId: string,
): Promise<DeletionRequestRow | null> {
  const activeOwnerFilter = buildActiveAccountDeletionOwnerFilter(userId);
  const { data: existing, error: existingError } = await tableClient(
    supabaseAdmin,
    "account_deletion_requests",
  )
    .select("*")
    .eq(activeOwnerFilter.column, activeOwnerFilter.value)
    .in("status", [...ACTIVE_ACCOUNT_DELETION_STATUSES])
    .maybeSingle<DeletionRequestRow>();

  if (existingError) {
    throw existingError;
  }

  return existing;
}

async function createDeletionRequest(
  supabaseAdmin: SupabaseAdminClient,
  input: CreateDeletionRequestInput,
): Promise<DeletionRequestRow> {
  const { data, error } = await tableClient(
    supabaseAdmin,
    "account_deletion_requests",
  )
    .insert({
      reason: input.reason,
      request_metadata: input.requestMetadata,
      user_id: input.userId,
    })
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
