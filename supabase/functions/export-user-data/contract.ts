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
  "price_alerts",
  "account_deletion_requests",
  "developer_applications",
  "overlay_settings",
  "performance_snapshots",
  "platform_accounts",
  "friend_merge_suggestions",
  "activity_feed",
  "chat_room_members",
  "store_reviews",
  "store_order_refund_requests",
  "store_order_invoices",
  "store_customers",
  "store_wishlist",
  "store_price_alerts",
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
] as const;

const exportPrimaryKeyOverrides: Record<string, readonly string[]> = {
  chat_room_members: ["room_id", "user_id"],
  community_artwork_votes: ["artwork_id", "user_id"],
  profile_private: ["user_id"],
  store_customers: ["user_id"],
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
