import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { createProcessAccountDeletionsAdapters } from "./adapters.ts";
import {
  ACCOUNT_DELETION_USER_STORAGE_BUCKETS,
  type AccountDeletionProcessorRunEvidenceRecord,
  type DeletionRequestRow,
} from "./contract.ts";

const userId = "22222222-2222-4222-8222-222222222222";
const requestId = "11111111-1111-4111-8111-111111111111";
const dueBefore = "2026-07-13T10:00:00.000Z";

Deno.test("process account deletion adapters list due pending requests with schedule bounds", async () => {
  const operations: Operation[] = [];
  const dueRows = [dueRequest()];
  const adapters = createProcessAccountDeletionsAdapters({
    getExpectedSecret: () => "processor-secret",
    supabaseAdmin: supabaseStub({
      dataByMethod: { returns: dueRows },
      operations,
    }),
  });

  assertEquals(
    await adapters.listDueDeletionRequests({ dueBefore, limit: 25 }),
    dueRows,
  );
  assertEquals(operations, [
    { args: ["account_deletion_requests"], method: "from" },
    {
      args: ["id, user_id, scheduled_at, request_metadata"],
      method: "select",
      table: "account_deletion_requests",
    },
    {
      args: ["status", "pending"],
      method: "eq",
      table: "account_deletion_requests",
    },
    {
      args: ["scheduled_at", dueBefore],
      method: "lte",
      table: "account_deletion_requests",
    },
    {
      args: ["scheduled_at", { ascending: true }],
      method: "order",
      table: "account_deletion_requests",
    },
    {
      args: [25],
      method: "limit",
      table: "account_deletion_requests",
    },
    { args: [], method: "returns", table: "account_deletion_requests" },
  ]);
});

Deno.test("process account deletion adapters claim pending rows with owner and schedule guards", async () => {
  const operations: Operation[] = [];
  const request = dueRequest();
  const claimed = dueRequest({
    request_metadata: {
      processor_started_at: dueBefore,
      source: "test",
    },
  });
  const adapters = createProcessAccountDeletionsAdapters({
    getExpectedSecret: () => "processor-secret",
    supabaseAdmin: supabaseStub({
      dataByMethod: { maybeSingle: claimed },
      operations,
    }),
  });

  assertEquals(
    await adapters.claimDeletionRequest({ claimedAt: dueBefore, request }),
    claimed,
  );
  assertEquals(operations, [
    { args: ["account_deletion_requests"], method: "from" },
    {
      args: [
        {
          request_metadata: {
            processor_started_at: dueBefore,
            source: "test",
          },
          status: "processing",
        },
      ],
      method: "update",
      table: "account_deletion_requests",
    },
    {
      args: ["id", requestId],
      method: "eq",
      table: "account_deletion_requests",
    },
    {
      args: ["user_id", userId],
      method: "eq",
      table: "account_deletion_requests",
    },
    {
      args: ["status", "pending"],
      method: "eq",
      table: "account_deletion_requests",
    },
    {
      args: ["scheduled_at", dueBefore],
      method: "lte",
      table: "account_deletion_requests",
    },
    {
      args: ["id, user_id, scheduled_at, request_metadata"],
      method: "select",
      table: "account_deletion_requests",
    },
    { args: [], method: "maybeSingle", table: "account_deletion_requests" },
  ]);
});

Deno.test("process account deletion adapters apply processing-only audit mutations", async () => {
  const operations: Operation[] = [];
  const adapters = createProcessAccountDeletionsAdapters({
    getExpectedSecret: () => "processor-secret",
    supabaseAdmin: supabaseStub({
      dataByMethod: { maybeSingle: { id: requestId } },
      operations,
    }),
  });

  await adapters.markCompletedDeletionRequest({
    completedAt: dueBefore,
    requestId,
  });
  await adapters.markFailedDeletionRequest({
    failedAt: dueBefore,
    message: "Auth delete failed",
    request: dueRequest(),
  });

  assertEquals(operations, [
    { args: ["account_deletion_requests"], method: "from" },
    {
      args: [{ completed_at: dueBefore, status: "completed" }],
      method: "update",
      table: "account_deletion_requests",
    },
    {
      args: ["id", requestId],
      method: "eq",
      table: "account_deletion_requests",
    },
    {
      args: ["status", "processing"],
      method: "eq",
      table: "account_deletion_requests",
    },
    { args: ["id"], method: "select", table: "account_deletion_requests" },
    { args: [], method: "maybeSingle", table: "account_deletion_requests" },
    { args: ["account_deletion_requests"], method: "from" },
    {
      args: [
        {
          error_message: "Auth delete failed",
          failed_at: dueBefore,
          request_metadata: {
            processor_failed_at: dueBefore,
            source: "test",
          },
          status: "failed",
        },
      ],
      method: "update",
      table: "account_deletion_requests",
    },
    {
      args: ["id", requestId],
      method: "eq",
      table: "account_deletion_requests",
    },
    {
      args: ["status", "processing"],
      method: "eq",
      table: "account_deletion_requests",
    },
    { args: ["id"], method: "select", table: "account_deletion_requests" },
    { args: [], method: "maybeSingle", table: "account_deletion_requests" },
  ]);

  const missingAdapters = createProcessAccountDeletionsAdapters({
    getExpectedSecret: () => "processor-secret",
    supabaseAdmin: supabaseStub(),
  });
  await assertRejects(
    () =>
      missingAdapters.markCompletedDeletionRequest({
        completedAt: dueBefore,
        requestId,
      }),
    Error,
    "completion audit update did not match",
  );
  await assertRejects(
    () =>
      missingAdapters.markFailedDeletionRequest({
        failedAt: dueBefore,
        message: "Auth delete failed",
        request: dueRequest(),
      }),
    Error,
    "failure audit update did not match",
  );
});

Deno.test("process account deletion adapters record evidence and delete users through service clients", async () => {
  const operations: Operation[] = [];
  const evidence = processorEvidence();
  const adapters = createProcessAccountDeletionsAdapters({
    getExpectedSecret: () => "processor-secret",
    supabaseAdmin: supabaseStub({
      dataByMethod: { single: evidence },
      operations,
    }),
  });

  assertEquals(adapters.getExpectedSecret(), "processor-secret");
  await adapters.deleteUser(userId);
  assertEquals(await adapters.recordProcessorRunEvidence(evidence), evidence);
  assertEquals(operations, [
    { args: [userId], method: "deleteUser" },
    { args: ["account_deletion_processor_runs"], method: "from" },
    {
      args: [evidence],
      method: "insert",
      table: "account_deletion_processor_runs",
    },
    {
      args: [
        "run_id, trigger_source, dry_run, limit_count, due_request_count, would_process_count, claimed_count, skipped_count, completed_count, failed_count, storage_bucket_count, skipped_summary, started_at, completed_at, status",
      ],
      method: "select",
      table: "account_deletion_processor_runs",
    },
    {
      args: [],
      method: "single",
      table: "account_deletion_processor_runs",
    },
  ]);
});

Deno.test("process account deletion adapters remove nested storage objects and ignore missing buckets", async () => {
  const operations: Operation[] = [];
  const adapters = createProcessAccountDeletionsAdapters({
    getExpectedSecret: () => "processor-secret",
    supabaseAdmin: supabaseStub({
      defaultStorageListError: {
        message: "not found",
        statusCode: 404,
      },
      operations,
      storageLists: {
        [`avatars:${userId}`]: [
          { id: "file-1", name: "root.sav" },
          { id: null, name: "nested" },
        ],
        [`avatars:${userId}/nested`]: [
          { id: "file-2", name: "leaf.bin" },
        ],
      },
    }),
  });

  await adapters.deleteKnownUserStorage(userId);

  assertEquals(operations, [
    {
      args: [userId, { limit: 1000 }],
      method: "storage.list",
      table: "avatars",
    },
    {
      args: [`${userId}/nested`, { limit: 1000 }],
      method: "storage.list",
      table: "avatars",
    },
    {
      args: [[`${userId}/root.sav`, `${userId}/nested/leaf.bin`]],
      method: "storage.remove",
      table: "avatars",
    },
    ...ACCOUNT_DELETION_USER_STORAGE_BUCKETS.slice(1).map((bucket) => ({
      args: [userId, { limit: 1000 }],
      method: "storage.list",
      table: bucket,
    })),
  ]);
});

type Operation = {
  args: unknown[];
  method: string;
  table?: string;
};

type StorageEntry = {
  id?: string | null;
  name: string;
};

function supabaseStub(options: {
  authDeleteError?: unknown;
  dataByMethod?: Record<string, unknown>;
  defaultStorageListError?: unknown;
  errorByMethod?: Record<string, unknown>;
  operations?: Operation[];
  storageLists?: Record<string, StorageEntry[]>;
  storageRemoveError?: unknown;
} = {}) {
  const operations = options.operations ?? [];
  return {
    auth: {
      admin: {
        deleteUser: (deletedUserId: string) => {
          operations.push({ args: [deletedUserId], method: "deleteUser" });
          return Promise.resolve({
            error: options.authDeleteError ?? null,
          });
        },
      },
    },
    from: (table: string) => {
      operations.push({ args: [table], method: "from" });
      const result = (method: string) => ({
        data: options.dataByMethod?.[method] ?? null,
        error: options.errorByMethod?.[method] ?? null,
      });
      const query = {
        eq(column: string, value: unknown) {
          operations.push({ args: [column, value], method: "eq", table });
          return query;
        },
        insert(value: unknown) {
          operations.push({ args: [value], method: "insert", table });
          return query;
        },
        limit(count: number) {
          operations.push({ args: [count], method: "limit", table });
          return query;
        },
        lte(column: string, value: unknown) {
          operations.push({ args: [column, value], method: "lte", table });
          return query;
        },
        maybeSingle() {
          operations.push({ args: [], method: "maybeSingle", table });
          return Promise.resolve(result("maybeSingle"));
        },
        order(column: string, options: { ascending: boolean }) {
          operations.push({ args: [column, options], method: "order", table });
          return query;
        },
        returns() {
          operations.push({ args: [], method: "returns", table });
          return Promise.resolve(result("returns"));
        },
        select(columns: string) {
          operations.push({ args: [columns], method: "select", table });
          return query;
        },
        single() {
          operations.push({ args: [], method: "single", table });
          return Promise.resolve(result("single"));
        },
        update(value: unknown) {
          operations.push({ args: [value], method: "update", table });
          return query;
        },
      };
      return query;
    },
    storage: {
      from: (bucket: string) => ({
        list: (prefix: string, listOptions: { limit: number }) => {
          operations.push({
            args: [prefix, listOptions],
            method: "storage.list",
            table: bucket,
          });
          const key = `${bucket}:${prefix}`;
          if (Object.hasOwn(options.storageLists ?? {}, key)) {
            return Promise.resolve({
              data: options.storageLists?.[key] ?? [],
              error: null,
            });
          }
          return Promise.resolve({
            data: null,
            error: options.defaultStorageListError ?? null,
          });
        },
        remove: (paths: string[]) => {
          operations.push({
            args: [paths],
            method: "storage.remove",
            table: bucket,
          });
          return Promise.resolve({
            data: null,
            error: options.storageRemoveError ?? null,
          });
        },
      }),
    },
  };
}

function dueRequest(
  overrides: Partial<DeletionRequestRow> = {},
): DeletionRequestRow {
  return {
    id: requestId,
    request_metadata: { source: "test" },
    scheduled_at: "2026-07-13T10:30:00.000Z",
    user_id: userId,
    ...overrides,
  };
}

function processorEvidence(): AccountDeletionProcessorRunEvidenceRecord {
  return {
    claimed_count: 1,
    completed_at: dueBefore,
    completed_count: 1,
    dry_run: false,
    due_request_count: 1,
    failed_count: 0,
    limit_count: 20,
    run_id: "account-deletion-run-1",
    skipped_count: 0,
    skipped_summary: {},
    started_at: dueBefore,
    status: "completed",
    storage_bucket_count: ACCOUNT_DELETION_USER_STORAGE_BUCKETS.length,
    trigger_source: "scheduled",
    would_process_count: 0,
  };
}
