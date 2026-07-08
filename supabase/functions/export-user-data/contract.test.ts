import {
  exportAdditionalUserScopedReads,
  exportOwnUserIdTables,
} from "./contract.ts";

Deno.test(
  "user export own-user table coverage includes newer hosted data",
  () => {
    assertIncludesAll(exportOwnUserIdTables, [
      "store_customers",
      "store_wishlist",
      "store_price_alerts",
      "remote_companion_devices",
      "remote_install_jobs",
      "performance_sessions",
      "launcher_local_entities",
      "community_artwork_votes",
    ]);
  },
);

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
      "mobile_push_registrations.owner_id",
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
