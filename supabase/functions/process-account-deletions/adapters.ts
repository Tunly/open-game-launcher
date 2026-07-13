import {
  ACCOUNT_DELETION_USER_STORAGE_BUCKETS,
  type AccountDeletionProcessorRunEvidenceRecord,
  buildAccountDeletionCompletionMutation,
  buildAccountDeletionFailureMutation,
  buildAccountDeletionProcessingClaim,
  type DeletionRequestRow,
} from "./contract.ts";
import type { ProcessAccountDeletionsHandlerDeps } from "./handler.ts";

type SupabaseQueryError = {
  message?: string;
  statusCode?: string | number;
};

type SupabaseQueryResult<T> = {
  data: T | null;
  error: SupabaseQueryError | null;
};

type SupabaseTableClient = {
  eq: (column: string, value: unknown) => SupabaseTableClient;
  insert: (value: unknown) => SupabaseTableClient;
  limit: (count: number) => SupabaseTableClient;
  lte: (column: string, value: unknown) => SupabaseTableClient;
  maybeSingle: <T>() => Promise<SupabaseQueryResult<T>>;
  order: (
    column: string,
    options: { ascending: boolean },
  ) => SupabaseTableClient;
  returns: <T>() => Promise<SupabaseQueryResult<T>>;
  select: (columns: string) => SupabaseTableClient;
  single: <T>() => Promise<SupabaseQueryResult<T>>;
  update: (value: unknown) => SupabaseTableClient;
};

type SupabaseStorageBucketClient = {
  list: (
    prefix: string,
    options: { limit: number; offset: number },
  ) => Promise<
    SupabaseQueryResult<Array<{ id?: string | null; name: string }>>
  >;
  remove: (paths: string[]) => Promise<SupabaseQueryResult<unknown>>;
};

type SupabaseAdminClient = {
  auth: {
    admin: {
      deleteUser: (
        userId: string,
      ) => Promise<{ error: SupabaseQueryError | null }>;
    };
  };
  from: (table: string) => unknown;
  storage: {
    from: (bucket: string) => SupabaseStorageBucketClient;
  };
};

export type ProcessAccountDeletionsAdapterDeps = {
  getExpectedSecret: () => string;
  supabaseAdmin: SupabaseAdminClient;
};

export type ProcessAccountDeletionsAdapters = Omit<
  ProcessAccountDeletionsHandlerDeps,
  "now" | "randomUUID"
>;

export function createProcessAccountDeletionsAdapters(
  deps: ProcessAccountDeletionsAdapterDeps,
): ProcessAccountDeletionsAdapters {
  return {
    claimDeletionRequest: (input) =>
      claimDeletionRequest(deps.supabaseAdmin, input),
    deleteKnownUserStorage: (userId) =>
      deleteKnownUserStorage(deps.supabaseAdmin, userId),
    deleteUser: (userId) => deleteUser(deps.supabaseAdmin, userId),
    getExpectedSecret: deps.getExpectedSecret,
    listDueDeletionRequests: (input) =>
      listDueDeletionRequests(deps.supabaseAdmin, input),
    markCompletedDeletionRequest: (input) =>
      markCompletedDeletionRequest(deps.supabaseAdmin, input),
    markFailedDeletionRequest: (input) =>
      markFailedDeletionRequest(deps.supabaseAdmin, input),
    recordProcessorRunEvidence: (evidence) =>
      recordProcessorRunEvidence(deps.supabaseAdmin, evidence),
  };
}

async function listDueDeletionRequests(
  supabaseAdmin: SupabaseAdminClient,
  input: {
    dueBefore: string;
    limit: number;
  },
): Promise<DeletionRequestRow[]> {
  const { data, error } = await tableClient(
    supabaseAdmin,
    "account_deletion_requests",
  )
    .select("id, user_id, scheduled_at, request_metadata")
    .eq("status", "pending")
    .lte("scheduled_at", input.dueBefore)
    .order("scheduled_at", { ascending: true })
    .limit(input.limit)
    .returns<DeletionRequestRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function claimDeletionRequest(
  supabaseAdmin: SupabaseAdminClient,
  input: {
    claimedAt: string;
    request: DeletionRequestRow;
  },
): Promise<DeletionRequestRow | null> {
  const mutation = buildAccountDeletionProcessingClaim(input);
  let query = tableClient(supabaseAdmin, "account_deletion_requests")
    .update(mutation.update);
  for (const filter of mutation.filters) {
    query = query.eq(filter.column, filter.value);
  }
  const { data, error } = await query
    .lte(mutation.lte.column, mutation.lte.value)
    .select("id, user_id, scheduled_at, request_metadata")
    .maybeSingle<DeletionRequestRow>();

  if (error) {
    throw error;
  }

  return data;
}

async function deleteUser(
  supabaseAdmin: SupabaseAdminClient,
  userId: string,
): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    throw error;
  }
}

async function markCompletedDeletionRequest(
  supabaseAdmin: SupabaseAdminClient,
  input: {
    completedAt: string;
    requestId: string;
  },
): Promise<void> {
  const mutation = buildAccountDeletionCompletionMutation(input);
  let query = tableClient(supabaseAdmin, "account_deletion_requests")
    .update(mutation.update);
  for (const filter of mutation.filters) {
    query = query.eq(filter.column, filter.value);
  }
  const { data, error } = await query.select("id").maybeSingle<
    { id: string }
  >();

  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error(
      "Account deletion completion audit update did not match a processing request.",
    );
  }
}

async function markFailedDeletionRequest(
  supabaseAdmin: SupabaseAdminClient,
  input: {
    failedAt: string;
    message: string;
    request: DeletionRequestRow;
  },
): Promise<void> {
  const mutation = buildAccountDeletionFailureMutation(input);
  let query = tableClient(supabaseAdmin, "account_deletion_requests")
    .update(mutation.update);
  for (const filter of mutation.filters) {
    query = query.eq(filter.column, filter.value);
  }
  const { data, error } = await query.select("id").maybeSingle<
    { id: string }
  >();

  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error(
      "Account deletion failure audit update did not match a processing request.",
    );
  }
}

async function recordProcessorRunEvidence(
  supabaseAdmin: SupabaseAdminClient,
  evidence: AccountDeletionProcessorRunEvidenceRecord,
): Promise<AccountDeletionProcessorRunEvidenceRecord> {
  const { data, error } = await tableClient(
    supabaseAdmin,
    "account_deletion_processor_runs",
  )
    .insert(evidence)
    .select(
      "run_id, trigger_source, dry_run, limit_count, due_request_count, would_process_count, claimed_count, skipped_count, completed_count, failed_count, storage_bucket_count, skipped_summary, started_at, completed_at, status",
    )
    .single<AccountDeletionProcessorRunEvidenceRecord>();

  if (error) {
    throw error;
  }

  return data as AccountDeletionProcessorRunEvidenceRecord;
}

async function deleteKnownUserStorage(
  supabaseAdmin: SupabaseAdminClient,
  userId: string,
): Promise<void> {
  for (const bucket of ACCOUNT_DELETION_USER_STORAGE_BUCKETS) {
    await removeStoragePrefix(supabaseAdmin, bucket, userId);
  }
}

async function removeStoragePrefix(
  supabaseAdmin: SupabaseAdminClient,
  bucket: string,
  prefix: string,
): Promise<void> {
  const bucketClient = supabaseAdmin.storage.from(bucket);
  await drainStoragePrefix(bucketClient, bucket, prefix);
}

async function drainStoragePrefix(
  bucketClient: SupabaseStorageBucketClient,
  bucket: string,
  prefix: string,
): Promise<"empty" | "missing"> {
  while (true) {
    // Always drain the first page. Advancing an offset after removing objects
    // would skip entries that shifted into an earlier page.
    const { data, error } = await bucketClient.list(prefix, {
      limit: 1000,
      offset: 0,
    });

    if (error) {
      if (isMissingStorageResource(error)) {
        return "missing";
      }
      throw new Error(
        `Failed to list ${bucket}/${prefix}: ${error.message}`,
      );
    }

    const entries = data ?? [];
    if (entries.length === 0) {
      return "empty";
    }

    const paths: string[] = [];
    const childPrefixes = new Set<string>();
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id) {
        paths.push(path);
      } else {
        childPrefixes.add(path);
      }
    }

    for (const childPrefix of childPrefixes) {
      const status = await drainStoragePrefix(
        bucketClient,
        bucket,
        childPrefix,
      );
      if (status === "missing") {
        return status;
      }
    }

    if (paths.length > 0) {
      const { error: removeError } = await bucketClient.remove(paths);
      if (removeError) {
        throw new Error(
          `Failed to remove ${bucket} storage objects: ${removeError.message}`,
        );
      }
    }
  }
}

function isMissingStorageResource(error: SupabaseQueryError) {
  const message = error.message?.toLowerCase() ?? "";
  return error.statusCode === 404 || message.includes("not found");
}

function tableClient(
  supabaseAdmin: SupabaseAdminClient,
  table: string,
): SupabaseTableClient {
  return supabaseAdmin.from(table) as SupabaseTableClient;
}
