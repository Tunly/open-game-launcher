export const STORAGE_KEYS = {
  CLOUD_SYNC_DEVICE_ID: "launcher.cloudSyncDeviceId",

  EA_TOKEN: "launcher.eaToken",
  EPIC_TOKEN: "launcher.epicToken",
  GOG_TOKEN: "launcher.gogToken",

  HARDWARE_FALLBACK: "og-launcher:profile-hardware:v1",

  LIBRARY_CUSTOM_CATEGORIES: "launcher_custom_categories",
  LIBRARY_DYNAMIC_COLLECTIONS: "launcher_dynamic_collections",
  LIBRARY_FAVORITES: "launcher_favorites",
  LIBRARY_FILTER_STATE: "launcher_library_filter_state",
  LIBRARY_HIDDEN: "launcher_hidden",
  LIBRARY_MANUAL_COLLECTIONS: "launcher_manual_collections",
  LIBRARY_SNAPSHOT: "launcher_library_snapshot",

  MODS_ACTIVE_PROFILE: "og-launcher:mod-profile:v1",
  MODS_ENABLED: "og-launcher:mods:v1",

  STARTUP_LIBRARY_RESCAN_DONE: "launcher_startup_library_rescan_done",

  STEAM_API_KEY: "launcher.steamApiKey",
  STEAM_ID: "launcher.steamId",
  STEAM_OWNED_GAMES_CACHE: "launcher.steamOwnedGamesCache",
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
