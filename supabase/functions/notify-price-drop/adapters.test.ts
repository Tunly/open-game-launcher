import {
  assertEquals,
  assertObjectMatch,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { createNotifyPriceDropAdapters } from "./adapters.ts";
import type { PriceDropNotificationRunEvidenceRecord } from "./contract.ts";
import type { PriceDropCandidate, StorePriceAlertRow } from "./price-alerts.ts";

const alertId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const notifiedAt = "2026-06-15T12:00:01.000Z";

Deno.test("notify price-drop adapters verify secrets lazily", () => {
  let secretReads = 0;
  const adapters = createNotifyPriceDropAdapters({
    getNotifySecret: () => {
      secretReads += 1;
      return "test-secret";
    },
    supabaseAdmin: supabaseStub(),
  });

  assertEquals(secretReads, 0);
  assertEquals(
    adapters.verifySecret(
      new Request("https://example.test", {
        headers: { Authorization: "Bearer test-secret" },
      }),
    ),
    { mode: "authorization_bearer", status: "ok" },
  );
  assertEquals(secretReads, 1);
});

Deno.test("notify price-drop adapters load active alert query shape with filters", async () => {
  const operations: Operation[] = [];
  const adapters = createNotifyPriceDropAdapters({
    getNotifySecret: () => "test-secret",
    supabaseAdmin: supabaseStub({
      dataByTable: { store_price_alerts: [alertRow()] },
      operations,
    }),
  });

  assertEquals(
    await adapters.loadActiveAlerts({
      alertIds: [alertId],
      dryRun: false,
      limit: 25,
      productIds: [productId],
      triggerSource: "scheduled",
      userIds: [userId],
    }),
    [alertRow()],
  );
  assertEquals(operations, [
    { args: ["store_price_alerts"], method: "from" },
    {
      args: [
        `
  id,
  user_id,
  product_id,
  target_price_cents,
  is_active,
  last_notified_at,
  updated_at,
  product:store_products!store_price_alerts_product_id_fkey(
    id,
    title,
    slug,
    price_cents,
    discount_percent,
    status,
    updated_at
  )
`,
      ],
      method: "select",
      table: "store_price_alerts",
    },
    { args: ["is_active", true], method: "eq", table: "store_price_alerts" },
    {
      args: ["updated_at", { ascending: true }],
      method: "order",
      table: "store_price_alerts",
    },
    { args: [25], method: "limit", table: "store_price_alerts" },
    { args: ["id", [alertId]], method: "in", table: "store_price_alerts" },
    {
      args: ["product_id", [productId]],
      method: "in",
      table: "store_price_alerts",
    },
    { args: ["user_id", [userId]], method: "in", table: "store_price_alerts" },
    { args: [], method: "returns", table: "store_price_alerts" },
  ]);
});

Deno.test("notify price-drop adapters omit optional alert filters when absent", async () => {
  const operations: Operation[] = [];
  const adapters = createNotifyPriceDropAdapters({
    getNotifySecret: () => "test-secret",
    supabaseAdmin: supabaseStub({ operations }),
  });

  assertEquals(
    await adapters.loadActiveAlerts({
      alertIds: [],
      dryRun: true,
      limit: 500,
      productIds: [],
      triggerSource: "manual",
      userIds: [],
    }),
    [],
  );
  assertEquals(
    operations.some((operation) => operation.method === "in"),
    false,
  );
});

Deno.test("notify price-drop adapters skip writes for empty notification candidates", async () => {
  const operations: Operation[] = [];
  const adapters = createNotifyPriceDropAdapters({
    getNotifySecret: () => "test-secret",
    supabaseAdmin: supabaseStub({ operations }),
  });

  assertEquals(await adapters.recordNotifications([], notifiedAt), {
    alertsMarked: 0,
    notificationsRecorded: 0,
  });
  assertEquals(operations, []);
});

Deno.test("notify price-drop adapters insert notifications and mark alerts", async () => {
  const operations: Operation[] = [];
  const adapters = createNotifyPriceDropAdapters({
    getNotifySecret: () => "test-secret",
    supabaseAdmin: supabaseStub({
      countByTable: { store_price_alerts: 1 },
      operations,
    }),
  });

  assertEquals(
    await adapters.recordNotifications([candidate()], notifiedAt),
    { alertsMarked: 1, notificationsRecorded: 1 },
  );

  const insert = operations.find((operation) =>
    operation.method === "insert" && operation.table === "user_notifications"
  );
  const rows = insert?.args[0] as Record<string, unknown>[];
  assertEquals(rows.length, 1);
  assertObjectMatch(rows[0], {
    body: "Mock Game is now EUR 15.00 (target EUR 15.00).",
    title: "Price drop: Mock Game",
    type: "store_price_drop",
    user_id: userId,
  });
  assertObjectMatch(rows[0].data as Record<string, unknown>, {
    current_price_cents: 1500,
    delivery: "in_app",
    notified_at: notifiedAt,
    product_id: productId,
    source: "notify-price-drop",
    store_price_alert_id: alertId,
    target_price_cents: 1500,
  });
  assertEquals(operations.slice(-3), [
    {
      args: [{ last_notified_at: notifiedAt }, { count: "exact" }],
      method: "update",
      table: "store_price_alerts",
    },
    { args: ["id", [alertId]], method: "in", table: "store_price_alerts" },
    { args: [], method: "then", table: "store_price_alerts" },
  ]);
});

Deno.test("notify price-drop adapters record sanitized aggregate run evidence", async () => {
  const operations: Operation[] = [];
  const evidence = evidenceRecord();
  const adapters = createNotifyPriceDropAdapters({
    getNotifySecret: () => "test-secret",
    supabaseAdmin: supabaseStub({ operations }),
  });

  await adapters.recordPriceDropNotificationRun(evidence);

  assertEquals(operations, [
    { args: ["store_price_drop_notification_runs"], method: "from" },
    {
      args: [evidence],
      method: "insert",
      table: "store_price_drop_notification_runs",
    },
    {
      args: [],
      method: "then",
      table: "store_price_drop_notification_runs",
    },
  ]);
  assertEquals(JSON.stringify(evidence).includes("Mock Game"), false);
  assertEquals(JSON.stringify(evidence).includes(productId), false);
});

Deno.test("notify price-drop adapters map Supabase errors", async () => {
  const readAdapters = createNotifyPriceDropAdapters({
    getNotifySecret: () => "test-secret",
    supabaseAdmin: supabaseStub({
      errorByTable: { store_price_alerts: { message: "read failed" } },
    }),
  });
  await assertRejects(
    () =>
      readAdapters.loadActiveAlerts({
        alertIds: [],
        dryRun: true,
        limit: 10,
        productIds: [],
        triggerSource: "manual",
        userIds: [],
      }),
    Error,
    "Failed to read store price alerts: read failed",
  );

  const notificationAdapters = createNotifyPriceDropAdapters({
    getNotifySecret: () => "test-secret",
    supabaseAdmin: supabaseStub({
      errorByTable: { user_notifications: { message: "insert failed" } },
    }),
  });
  await assertRejects(
    () => notificationAdapters.recordNotifications([candidate()], notifiedAt),
    Error,
    "Failed to record price-drop notifications: insert failed",
  );

  const evidenceAdapters = createNotifyPriceDropAdapters({
    getNotifySecret: () => "test-secret",
    supabaseAdmin: supabaseStub({
      errorByTable: {
        store_price_drop_notification_runs: { message: "evidence failed" },
      },
    }),
  });
  await assertRejects(
    () => evidenceAdapters.recordPriceDropNotificationRun(evidenceRecord()),
    Error,
    "Price-drop run evidence write failed: evidence failed",
  );
});

type Operation = {
  args: unknown[];
  method: string;
  table?: string;
};

function supabaseStub(options: {
  countByTable?: Record<string, number | null>;
  dataByTable?: Record<string, unknown[] | null>;
  errorByTable?: Record<string, { message?: string } | null>;
  operations?: Operation[];
} = {}) {
  const operations = options.operations ?? [];
  return {
    from: (table: string) => {
      operations.push({ args: [table], method: "from" });
      const result = () => ({
        count: options.countByTable?.[table] ?? null,
        data: options.dataByTable?.[table] ?? null,
        error: options.errorByTable?.[table] ?? null,
      });
      const query = {
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
        limit(count: number) {
          operations.push({ args: [count], method: "limit", table });
          return query;
        },
        order(column: string, orderOptions: { ascending: boolean }) {
          operations.push({
            args: [column, orderOptions],
            method: "order",
            table,
          });
          return query;
        },
        returns() {
          operations.push({ args: [], method: "returns", table });
          return Promise.resolve(result());
        },
        select(columns: string) {
          operations.push({ args: [columns], method: "select", table });
          return query;
        },
        then(
          onfulfilled?: ((value: unknown) => unknown) | null,
          onrejected?: ((reason: unknown) => unknown) | null,
        ) {
          operations.push({ args: [], method: "then", table });
          return Promise.resolve(result()).then(onfulfilled, onrejected);
        },
        update(value: unknown, updateOptions?: unknown) {
          operations.push({
            args: [value, updateOptions],
            method: "update",
            table,
          });
          return query;
        },
      };
      return query;
    },
  };
}

function alertRow(
  overrides: Partial<StorePriceAlertRow> = {},
): StorePriceAlertRow {
  return {
    id: alertId,
    is_active: true,
    last_notified_at: null,
    product: {
      discount_percent: 25,
      id: productId,
      price_cents: 2000,
      slug: "mock-game",
      status: "published",
      title: "Mock Game",
      updated_at: "2026-06-10T10:00:00.000Z",
    },
    product_id: productId,
    target_price_cents: 1500,
    updated_at: "2026-06-10T09:00:00.000Z",
    user_id: userId,
    ...overrides,
  };
}

function candidate(overrides: Partial<PriceDropCandidate> = {}) {
  return {
    alertId,
    alertUpdatedAt: "2026-06-10T09:00:00.000Z",
    currentPriceCents: 1500,
    discountPercent: 25,
    lastNotifiedAt: null,
    originalPriceCents: 2000,
    productId,
    productSlug: "mock-game",
    productTitle: "Mock Game",
    productUpdatedAt: "2026-06-10T10:00:00.000Z",
    targetPriceCents: 1500,
    userId,
    ...overrides,
  };
}

function evidenceRecord(): PriceDropNotificationRunEvidenceRecord {
  return {
    alerts_marked_count: 1,
    candidate_count: 1,
    completed_at: "2026-06-15T12:00:02.000Z",
    dry_run: false,
    limit_count: 500,
    notifications_recorded_count: 1,
    requested_alert_count: 0,
    requested_product_count: 0,
    requested_user_count: 0,
    run_id: "price-drop-run-1",
    scanned_count: 1,
    skipped_summary: {
      already_notified: 0,
      inactive: 0,
      invalid_product: 0,
      invalid_target: 0,
      not_met: 0,
      unpublished_product: 0,
    },
    started_at: "2026-06-15T12:00:00.000Z",
    status: "completed",
    trigger_source: "scheduled",
  };
}
