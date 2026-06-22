import type {
  ExportUser,
  ExportUserDataHandlerDeps,
  JsonObject,
} from "./handler.ts";

type SupabaseQueryResult = {
  data: JsonObject[] | null;
  error: (Error & { code?: string }) | null;
};

type SupabaseTableClient = {
  eq: (column: string, value: string) => Promise<SupabaseQueryResult>;
  in: (column: string, values: string[]) => Promise<SupabaseQueryResult>;
  or: (filter: string) => Promise<SupabaseQueryResult>;
  select: (columns: string) => SupabaseTableClient;
};

type ExportReadClient = {
  from: (table: string) => unknown;
};

type AuthenticatedRequestResult = { user: unknown } | Response;

export type ExportUserDataAdapterDeps = {
  adminClient: ExportReadClient;
  authenticateRequest: (
    request: Request,
  ) => Promise<AuthenticatedRequestResult>;
};

export type ExportUserDataAdapters = Omit<
  ExportUserDataHandlerDeps,
  "now"
>;

export function createExportUserDataAdapters(
  deps: ExportUserDataAdapterDeps,
): ExportUserDataAdapters {
  return {
    authenticateRequest: (request) => authenticateRequest(deps, request),
    readRows: (table, column, value, warnings) =>
      readRows(deps.adminClient, table, column, value, warnings),
    readRowsIn: (table, column, values, warnings) =>
      readRowsIn(deps.adminClient, table, column, values, warnings),
    readRowsWithOr: (table, filter, warnings) =>
      readRowsWithOr(deps.adminClient, table, filter, warnings),
  };
}

async function authenticateRequest(
  deps: Pick<ExportUserDataAdapterDeps, "authenticateRequest">,
  request: Request,
) {
  const authResult = await deps.authenticateRequest(request);
  if (authResult instanceof Response) {
    return authResult;
  }

  return { user: authResult.user as ExportUser };
}

async function readRows(
  adminClient: ExportReadClient,
  table: string,
  column: string,
  value: string,
  warnings: string[],
): Promise<JsonObject[]> {
  const { data, error } = await tableClient(adminClient, table)
    .select("*")
    .eq(column, value);
  return handleReadResult(table, data, error, warnings);
}

async function readRowsIn(
  adminClient: ExportReadClient,
  table: string,
  column: string,
  values: string[],
  warnings: string[],
): Promise<JsonObject[]> {
  if (values.length === 0) {
    return [];
  }

  const { data, error } = await tableClient(adminClient, table)
    .select("*")
    .in(column, values);
  return handleReadResult(table, data, error, warnings);
}

async function readRowsWithOr(
  adminClient: ExportReadClient,
  table: string,
  filter: string,
  warnings: string[],
): Promise<JsonObject[]> {
  const { data, error } = await tableClient(adminClient, table)
    .select("*")
    .or(filter);
  return handleReadResult(table, data, error, warnings);
}

function handleReadResult(
  table: string,
  data: JsonObject[] | null,
  error: (Error & { code?: string }) | null,
  warnings: string[],
): JsonObject[] {
  if (error) {
    if (isMissingRelationError(error)) {
      warnings.push(`Skipped missing table ${table}.`);
      return [];
    }
    throw error;
  }

  return data ?? [];
}

function isMissingRelationError(error: Error & { code?: string }) {
  return error.code === "42P01" || error.code === "PGRST205";
}

function tableClient(
  adminClient: ExportReadClient,
  table: string,
): SupabaseTableClient {
  return adminClient.from(table) as SupabaseTableClient;
}
