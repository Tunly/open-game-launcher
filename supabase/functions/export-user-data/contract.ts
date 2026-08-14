export const exportOwnUserIdTables = [
  "profile_private",
  "user_settings",
  "user_presence",
  "user_library",
  "user_game_stats",
  "game_sessions",
  "user_achievements",
  "achievement_progress",
  "user_wishlist",
  "user_reviews",
  "user_devices",
  "user_notifications",
  "user_activity",
  "user_badges",
  "user_social_links",
  "user_hardware",
  "user_game_collections",
  "user_game_collection_items",
  "user_profile_cosmetics",
  "profile_showcases",
  "account_deletion_requests",
  "developer_applications",
  "overlay_settings",
  "performance_snapshots",
  "platform_accounts",
  "friend_merge_suggestions",
  "activity_feed",
  "chat_room_members",
  "store_reviews",
  "store_wishlist",
  "performance_sessions",
  "launcher_local_entities",
  "community_artwork_votes",
] as const;

export const exportAdditionalUserScopedReads = [
  {
    column: "submitter_id",
    key: "community_artwork_items",
    table: "community_artwork_items",
  },
  {
    column: "reporter_user_id",
    key: "community_artwork_reports",
    table: "community_artwork_reports",
  },
  {
    column: "reviewer_user_id",
    key: "community_artwork_moderation_audit",
    table: "community_artwork_moderation_audit",
  },
  {
    column: "created_by",
    key: "share_tokens",
    table: "share_tokens",
  },
  {
    column: "developer_id",
    key: "store_products",
    table: "store_products",
  },
  {
    column: "owner_id",
    key: "family_groups",
    table: "family_groups",
  },
  {
    column: "user_id",
    key: "family_members",
    table: "family_members",
  },
] as const;

export type ExportChildTableRead = {
  /** Payload key the child rows are exported under. */
  key: string;
  /** Table the child rows are read from. */
  table: string;
  /** Column in the child table holding the parent key value. */
  column: string;
  /** Parent table whose exported rows provide the key values. */
  childOf: {
    table: string;
    column: string;
  };
};

/**
 * Two-level relation reads: child rows are fetched with the parent key values
 * exported under the parent table's payload key. Each entry is one parent
 * source; entries sharing a `key` are unioned into a single `in()` read.
 * Removing a parent or child table from the manifest removes it from the
 * export entirely - no runtime schema-drift guards needed.
 */
export const exportChildTableReads = [
  {
    childOf: { column: "id", table: "family_groups" },
    column: "family_id",
    key: "family_shared_games",
    table: "family_shared_games",
  },
  {
    childOf: { column: "family_id", table: "family_members" },
    column: "family_id",
    key: "family_shared_games",
    table: "family_shared_games",
  },
] as const satisfies readonly ExportChildTableRead[];

const exportPrimaryKeyOverrides: Record<string, readonly string[]> = {
  chat_room_members: ["room_id", "user_id"],
  community_artwork_votes: ["artwork_id", "user_id"],
  profile_private: ["user_id"],
  user_hardware: ["user_id"],
  user_presence: ["user_id"],
  user_settings: ["user_id"],
};

export function exportOrderColumns(
  table: string,
  filterColumns: readonly string[] = [],
): string[] {
  const primaryKeyColumns = exportPrimaryKeyOverrides[table] ?? ["id"];
  return Array.from(new Set([...filterColumns, ...primaryKeyColumns]));
}
