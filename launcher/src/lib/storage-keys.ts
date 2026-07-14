export const STORAGE_KEYS = {
  BACKUP_REMINDER_SETTINGS: "og-launcher:backup-reminder:v1",

  APP_SHELL_SKIN: "og-launcher:app-shell-skin:v1",

  CLOUD_SYNC_DEVICE_ID: "launcher.cloudSyncDeviceId",

  EA_TOKEN: "launcher.eaToken",
  EPIC_TOKEN: "launcher.epicToken",
  EPIC_OWNED_GAMES_CACHE: "launcher.epicOwnedGamesCache",
  EPIC_SESSION_MARKER: "og-launcher:epic-session:v1",
  GOG_TOKEN: "launcher.gogToken",
  GOG_OWNED_GAMES_CACHE: "launcher.gogOwnedGamesCache",

  HARDWARE_FALLBACK: "og-launcher:profile-hardware:v1",

  LIBRARY_CUSTOM_CATEGORIES: "launcher_custom_categories",
  LIBRARY_CUSTOM_ARTWORK: "launcher_custom_artwork",
  LIBRARY_DYNAMIC_COLLECTIONS: "launcher_dynamic_collections",
  LIBRARY_FAVORITES: "launcher_favorites",
  LIBRARY_FILTER_STATE: "launcher_library_filter_state",
  LIBRARY_HIDDEN: "launcher_hidden",
  LIBRARY_MANUAL_COLLECTIONS: "launcher_manual_collections",
  LIBRARY_SNAPSHOT: "launcher_library_snapshot",

  CLIENT_USAGE_STATS: "og-launcher:client-usage-stats:v1",

  PERFORMANCE_ACTIVE_GAME: "og-launcher:performance:active-game:v1",

  PLUGIN_MANIFEST_DISCOVERY: "og-launcher:plugin-manifest-discovery:v1",
  PLUGIN_SIGNED_PACKAGE_STAGING: "og-launcher:plugin-signed-package-staging:v1",

  STARTUP_LIBRARY_RESCAN_DONE: "launcher_startup_library_rescan_done",

  STEAM_ID: "launcher.steamId",
  STEAM_OWNED_GAMES_CACHE: "launcher.steamOwnedGamesCache",
  STEAM_OWNED_GAMES_CACHE_ACCOUNT: "launcher.steamOwnedGamesCacheAccount",
  STEAM_OWNED_GAMES_CACHE_VERSION: "launcher.steamOwnedGamesCacheVersion",
  BATTLENET_GAMES_CACHE: "launcher.battlenetGamesCache",
  XBOX_GAMES_CACHE: "launcher.xboxGamesCache",
  XBOX_USERNAME: "launcher.xboxUsername",
  GAME_PASS_CATALOG_CACHE: "launcher.gamePassCatalogCache",

  STORE_CART: "og-launcher:store:cart",
  STORE_OWNED: "og-launcher:store:owned",
  STORE_ORDERS: "og-launcher:store:orders",
  STORE_PRICE_ALERTS: "og-launcher:store:priceAlerts",
  STORE_WISHLIST: "og-launcher:store:wishlist",
} as const;

export const STEAM_OWNED_GAMES_CACHE_VERSION = "5";
