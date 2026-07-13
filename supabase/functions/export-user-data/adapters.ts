import type {
  ExportUser,
  ExportUserDataHandlerDeps,
  JsonObject,
} from "./handler.ts";
import { exportOrderColumns } from "./contract.ts";

const DATA_API_PAGE_SIZE = 1000;
const MAX_EXPORT_PAGES = 100_000;

type SupabaseQueryResult = {
  data: JsonObject[] | null;
  error: (Error & { code?: string }) | null;
};

type SupabaseTableClient = {
  eq: (column: string, value: string) => SupabaseTableClient;
  in: (column: string, values: string[]) => SupabaseTableClient;
  or: (filter: string) => SupabaseTableClient;
  order: (
    column: string,
    options: { ascending: boolean },
  ) => SupabaseTableClient;
  range: (from: number, to: number) => Promise<SupabaseQueryResult>;
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

function readRows(
  adminClient: ExportReadClient,
  table: string,
  column: string,
  value: string,
  warnings: string[],
): Promise<JsonObject[]> {
  return readAllPages(
    adminClient,
    table,
    [column],
    warnings,
    (query) => query.eq(column, value),
  );
}

function readRowsIn(
  adminClient: ExportReadClient,
  table: string,
  column: string,
  values: string[],
  warnings: string[],
): Promise<JsonObject[]> {
  if (values.length === 0) {
    return Promise.resolve([]);
  }

  return readAllPages(
    adminClient,
    table,
    [column],
    warnings,
    (query) => query.in(column, values),
  );
}

function readRowsWithOr(
  adminClient: ExportReadClient,
  table: string,
  filter: string,
  warnings: string[],
): Promise<JsonObject[]> {
  return readAllPages(
    adminClient,
    table,
    [],
    warnings,
    (query) => query.or(filter),
  );
}

async function readAllPages(
  adminClient: ExportReadClient,
  table: string,
  filterColumns: readonly string[],
  warnings: string[],
  applyFilter: (query: SupabaseTableClient) => SupabaseTableClient,
): Promise<JsonObject[]> {
  const rows: JsonObject[] = [];
  const orderColumns = exportOrderColumns(table, filterColumns);
  const seenFullPages = new Set<string>();

  for (let page = 0; page < MAX_EXPORT_PAGES; page += 1) {
    const from = page * DATA_API_PAGE_SIZE;
    let query = applyFilter(tableClient(adminClient, table).select("*"));
    for (const column of orderColumns) {
      query = query.order(column, { ascending: true });
    }

    const { data, error } = await query.range(
      from,
      from + DATA_API_PAGE_SIZE - 1,
    );
    if (error) {
      if (isMissingRelationError(error)) {
        warnings.push(`Skipped missing table ${table}.`);
        return [];
      }
      throw error;
    }

    const pageRows = data ?? [];
    if (pageRows.length > DATA_API_PAGE_SIZE) {
      throw new Error(
        `Pagination for table ${table} returned more than ${DATA_API_PAGE_SIZE} rows in one page.`,
      );
    }

    if (pageRows.length === DATA_API_PAGE_SIZE) {
      const signature = pageBoundarySignature(pageRows);
      if (seenFullPages.has(signature)) {
        throw new Error(`Pagination for table ${table} did not advance.`);
      }
      seenFullPages.add(signature);
    }

    rows.push(...pageRows);
    if (pageRows.length < DATA_API_PAGE_SIZE) {
      return rows;
    }
  }

  throw new Error(
    `Pagination for table ${table} exceeded ${MAX_EXPORT_PAGES} pages.`,
  );
}

function pageBoundarySignature(rows: JsonObject[]) {
  return JSON.stringify([rows[0], rows[rows.length - 1]]);
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
