import {
  exportAdditionalUserScopedReads,
  exportOrderColumns,
  exportOwnUserIdTables,
} from "./contract.ts";

Deno.test(
  "user export own-user table coverage includes newer hosted data",
  () => {
    assertIncludesAll(exportOwnUserIdTables, [
      "store_customers",
      "store_wishlist",
      "store_price_alerts",
      "performance_sessions",
      "launcher_local_entities",
      "community_artwork_votes",
    ]);
    assertExcludesAll(exportOwnUserIdTables, [
      "screenshots",
      "screenshot_likes",
    ]);
  },
);

Deno.test("user export pagination order includes filter and primary-key columns", () => {
  assertJsonEquals(exportOrderColumns("user_activity", ["user_id"]), [
    "user_id",
    "id",
  ]);
  assertJsonEquals(exportOrderColumns("store_order_items", ["order_id"]), [
    "order_id",
    "id",
  ]);
  assertJsonEquals(exportOrderColumns("friendships"), ["id"]);
  assertJsonEquals(exportOrderColumns("chat_room_members", ["user_id"]), [
    "user_id",
    "room_id",
  ]);
  assertJsonEquals(
    exportOrderColumns("community_artwork_votes", ["user_id"]),
    ["user_id", "artwork_id"],
  );
});

Deno.test(
  "user export additional scoped reads cover non-user-id owner columns",
  () => {
    const reads = exportAdditionalUserScopedReads.map(
      (read) => `${read.table}.${read.column}`,
    );

    assertIncludesAll(reads, [
      "community_artwork_items.submitter_id",
      "community_artwork_reports.reporter_user_id",
      "community_artwork_moderation_audit.reviewer_user_id",
      "share_tokens.created_by",
      "store_products.developer_id",
    ]);
  },
);

function assertIncludesAll(actual: readonly string[], expected: string[]) {
  for (const value of expected) {
    if (!actual.includes(value)) {
      throw new Error(`Expected ${JSON.stringify(actual)} to include ${value}`);
    }
  }
}

function assertExcludesAll(actual: readonly string[], forbidden: string[]) {
  for (const value of forbidden) {
    if (actual.includes(value)) {
      throw new Error(
        `Expected ${JSON.stringify(actual)} not to include ${value}`,
      );
    }
  }
}

function assertJsonEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`,
    );
  }
}
