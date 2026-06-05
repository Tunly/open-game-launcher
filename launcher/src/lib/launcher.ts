import { invoke } from "@tauri-apps/api/core";

import type {
  HardwareInfo,
  LaunchGameResponse,
  Game,
  DownloadItem,
  LocalEntityKey,
  LocalEntityPayload,
  LocalSyncStatus,
  PlaySession,
  ProviderHealthStatus,
  ReconciliationResult,
  StartDownloadResponse,
  SystemInfo,
  SyncGameAchievementsResponse,
  UninstallGameResponse,
  SyncGameSavesResponse,
  UploadGameSavesToCloudResponse,
  DownloadGameSavesFromCloudResponse,
  RestoreGameSavesFromCloudResponse,
} from "./types";
import type {
  ControllerDevice,
  ControllerLayout,
  ControllerRuntimeStatus,
} from "./types/controllers";

export type { Game };

import type { PlatformFriend } from "./types/friends";
import type {
  InstalledModInfo,
  ModInstallQueueItem,
  ModInstallRequest,
  ModInstallResult,
  ModProvider,
} from "./types/mods";

type CommandArgs = Record<string, unknown>;

class LauncherCommandError extends Error {
  constructor(
    public readonly command: string,
    cause: unknown,
  ) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`${command} failed: ${message}`);
    this.name = "LauncherCommandError";
  }
}

async function invokeCommand<T>(command: string, args?: CommandArgs): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw new LauncherCommandError(command, error);
  }
}

export function getSystemInfo(): Promise<SystemInfo> {
  return invokeCommand<SystemInfo>("get_system_info");
}

export function getDefaultInstallDir(): Promise<string> {
  return invokeCommand<string>("get_default_install_dir");
}

function getHardwareInfo(): Promise<HardwareInfo> {
  return invokeCommand<HardwareInfo>("get_hardware_info");
}

export async function detectHardwareInfo(): Promise<HardwareInfo> {
  try {
    return await getHardwareInfo();
  } catch {
    return getBrowserHardwareInfo();
  }
}

export function listInstalledGames(): Promise<Game[]> {
  return invokeCommand<Game[]>("list_installed_games");
}

export function listControllers(): Promise<ControllerDevice[]> {
  return invokeCommand<ControllerDevice[]>("list_controllers");
}

export function refreshInstalledGames(): Promise<Game[]> {
  return invokeCommand<Game[]>("refresh_installed_games");
}

export function updateAchievementProviderStatus(input: {
  gameId: string;
  status: NonNullable<Game["achievementProviderStatuses"]>[number];
}): Promise<Game> {
  return invokeCommand<Game>("update_achievement_provider_status", { input });
}

export function addManualGame(input: { title: string; installPath: string }): Promise<Game> {
  return invokeCommand<Game>("add_manual_game", { input });
}

export function moveGame(input: { gameId: string; newPath: string }): Promise<void> {
  return invokeCommand<void>("move_game", { input });
}

export async function launchGame(gameId: string): Promise<LaunchGameResponse> {
  await activateBestControllerLayoutForGame(gameId);
  return invokeCommand<LaunchGameResponse>("launch_game", { gameId });
}

export function applyControllerLayout(input: {
  gameId: string;
  layout: ControllerLayout;
}): Promise<ControllerRuntimeStatus> {
  return invokeCommand<ControllerRuntimeStatus>("apply_controller_layout", { input });
}

export function clearControllerLayout(): Promise<ControllerRuntimeStatus> {
  return invokeCommand<ControllerRuntimeStatus>("clear_controller_layout");
}

export function getControllerRuntimeStatus(): Promise<ControllerRuntimeStatus> {
  return invokeCommand<ControllerRuntimeStatus>("get_controller_runtime_status");
}

async function activateBestControllerLayoutForGame(gameId: string): Promise<void> {
  try {
    const { listControllerLayouts } = await import("./supabase/controllers");
    const layouts = await listControllerLayouts({
      gameId,
      controllerType: "all",
      includeGlobal: true,
    });
    const layout =
      layouts.find((candidate) => candidate.gameId === gameId && candidate.isDefault) ??
      layouts.find((candidate) => candidate.gameId === gameId) ??
      layouts.find((candidate) => candidate.gameId === null && candidate.isDefault) ??
      layouts.find((candidate) => candidate.gameId === null);

    if (layout) {
      await applyControllerLayout({ gameId, layout });
    } else {
      await clearControllerLayout();
    }
  } catch (error) {
    console.warn("Controller layout activation skipped", error);
  }
}

export function syncGameAchievements(
  game: Game,
  steamId?: string,
): Promise<SyncGameAchievementsResponse> {
  if (game.launcher === "xbox") {
    const titleId = game.externalId?.trim() || game.id || game.title;
    // Xbox uses its own sync command
    return invokeCommand<SyncGameAchievementsResponse>("sync_xbox_achievements", {
      gameId: game.id,
      titleId,
    });
  }
  return invokeCommand<SyncGameAchievementsResponse>("sync_game_achievements", {
    gameId: game.id,
    steamId,
  });
}

export function uninstallGame(gameId: string): Promise<UninstallGameResponse> {
  return invokeCommand<UninstallGameResponse>("uninstall_game", { gameId });
}

export function syncGameSaves(gameId: string): Promise<SyncGameSavesResponse> {
  return invokeCommand<SyncGameSavesResponse>("sync_game_saves", { gameId });
}

export async function readCachedSupabaseAccessToken(): Promise<string | null> {
  return invokeCommand<string | null>("read_cached_supabase_access_token");
}

export function isCloudKeyPresent(userId: string): Promise<boolean> {
  return invokeCommand<boolean>("is_cloud_key_present", { userId });
}

export function generateCloudKey(userId: string): Promise<string> {
  return invokeCommand<string>("generate_cloud_key", { userId });
}

export function rotateCloudKey(userId: string): Promise<string> {
  return invokeCommand<string>("rotate_cloud_key", { userId });
}

export class CloudNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudNotConfiguredError";
  }
}

async function buildCloudArgs(
  gameId: string,
  accessToken: string | null,
  userId: string,
): Promise<CommandArgs> {
  if (!accessToken) {
    throw new CloudNotConfiguredError(
      "Sign in required for cloud sync. No cached access token found.",
    );
  }
  const { supabaseUrl, supabaseAnonKey, supabaseConfigError } = await import("./supabase/config");
  if (supabaseConfigError || !supabaseUrl || !supabaseAnonKey) {
    throw new CloudNotConfiguredError(
      supabaseConfigError ?? "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY for cloud sync.",
    );
  }
  return {
    input: {
      gameId,
      supabaseUrl,
      apiKey: supabaseAnonKey,
      accessToken,
      userId,
    },
  };
}

export async function uploadGameSavesToCloud(
  gameId: string,
  options: { accessToken: string | null; userId: string },
): Promise<UploadGameSavesToCloudResponse> {
  const args = await buildCloudArgs(gameId, options.accessToken, options.userId);
  return invokeCommand<UploadGameSavesToCloudResponse>("upload_game_saves_to_cloud", args);
}

export async function downloadGameSavesFromCloud(
  gameId: string,
  options: { accessToken: string | null; userId: string },
): Promise<DownloadGameSavesFromCloudResponse> {
  const args = await buildCloudArgs(gameId, options.accessToken, options.userId);
  return invokeCommand<DownloadGameSavesFromCloudResponse>("download_game_saves_from_cloud", args);
}

export async function restoreGameSavesFromCloud(
  gameId: string,
  options: { accessToken: string | null; userId: string },
): Promise<RestoreGameSavesFromCloudResponse> {
  const args = await buildCloudArgs(gameId, options.accessToken, options.userId);
  return invokeCommand<RestoreGameSavesFromCloudResponse>("restore_game_saves_from_cloud", args);
}

export function startDownload(
  gameId: string,
  title?: string,
  downloadUrl?: string,
  downloadSha256?: string,
): Promise<StartDownloadResponse> {
  return invokeCommand<StartDownloadResponse>("start_download", {
    gameId,
    gameTitle: title,
    downloadUrl,
    downloadSha256,
  });
}

export function openSteamLoginWindow(): Promise<void> {
  return invokeCommand<void>("open_steam_login_window");
}

export async function openSteamScraperWindow(steamId: string) {
  return invokeCommand<void>("open_steam_scraper_window", { steamId });
}

export async function fetchSteamProfileName(steamId: string) {
  return invokeCommand<string | null>("fetch_steam_profile_name", { steamId });
}

export async function fetchSteamNewsForApp(appId: string): Promise<unknown> {
  return invokeCommand<unknown>("fetch_steam_news", { appId });
}

export function openExternalUrl(url: string): Promise<void> {
  return invokeCommand<void>("open_external_url", { url });
}

export function openGogLoginWindow(): Promise<void> {
  return invokeCommand<void>("open_gog_login_window");
}

export interface GogToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
}

export function gogExchangeCode(code: string): Promise<GogToken> {
  return invokeCommand<GogToken>("gog_exchange_code", { code });
}

export function gogRefreshToken(): Promise<GogToken> {
  return invokeCommand<GogToken>("gog_refresh_token_command");
}

export function gogGetToken(): Promise<GogToken | null> {
  return invokeCommand<GogToken | null>("gog_get_token");
}

export function gogLogout(): Promise<void> {
  return invokeCommand<void>("gog_logout");
}

function gogFetchOwnedGames(): Promise<OwnedGame[]> {
  return invokeCommand<OwnedGame[]>("gog_fetch_owned_games");
}

export interface EaToken {
  accessToken: string;
  capturedAt: number;
}

export function openEaLoginWindow(): Promise<void> {
  return invokeCommand<void>("open_ea_login_window");
}

export function eaGetToken(): Promise<EaToken | null> {
  return invokeCommand<EaToken | null>("ea_get_token");
}

export function eaLogout(): Promise<void> {
  return invokeCommand<void>("ea_logout");
}

export function eaFetchOwnedGames(): Promise<OwnedGame[]> {
  return invokeCommand<OwnedGame[]>("ea_fetch_owned_games");
}

export async function openEpicLoginWindow(): Promise<void> {
  return invokeCommand<void>("open_epic_login_window");
}

export async function authenticateEpicLegendary(code: string): Promise<string> {
  return invokeCommand<string>("authenticate_epic_legendary", { code });
}

export function openXboxLoginWindow(): Promise<void> {
  return invokeCommand<void>("open_xbox_login_window");
}

export interface XboxFetchResult {
  games: OwnedGame[];
  gamertag?: string | null;
}

export function fetchXboxOwnedGames(code: string): Promise<XboxFetchResult> {
  return invokeCommand<XboxFetchResult>("fetch_xbox_owned_games", { code });
}

export function launchXboxGame(pfn: string): Promise<void> {
  return invokeCommand<void>("launch_xbox_game", { pfn });
}

export function installXboxGame(pfn: string): Promise<void> {
  return invokeCommand<void>("install_xbox_game", { pfn });
}

export function fetchGamePassCatalog(): Promise<OwnedGame[]> {
  return invokeCommand<OwnedGame[]>("fetch_game_pass_catalog");
}

export interface OwnedGame {
  id: string;
  externalId?: string | null;
  title: string;
  description: string;
  coverUrl: string | null;
  logoUrl: string | null;
  iconUrl?: string;
  playtimeMinutes: number;
  lastPlayedAt?: string | null;
  cloudGamingUrl?: string | null;
}

type SteamRawGame = Record<string, unknown>;

function readString(record: SteamRawGame, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
}

function readNumber(record: SteamRawGame, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number.parseFloat(value.replace(/,/g, ""));
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

function steamImageUrl(appId: string, asset: string) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/${asset}`;
}

export function normalizeSteamOwnedGames(games: unknown): OwnedGame[] {
  if (!Array.isArray(games)) {
    return [];
  }

  return games.flatMap((game): OwnedGame[] => {
    if (!game || typeof game !== "object") {
      return [];
    }

    const record = game as SteamRawGame;
    const appId =
      readString(record, ["appid", "appId", "app_id"]) ||
      readString(record, ["id"]).replace(/^steam-owned-/, "");
    const title = readString(record, ["title", "name"]);

    if (!appId || !title) {
      return [];
    }

    const existingId = readString(record, ["id"]);
    const hours = readNumber(record, ["hours_forever", "hours", "playtimeHours"]);
    const playtimeMinutes =
      readNumber(record, ["playtimeMinutes", "playtime_minutes"]) || Math.round(hours * 60);

    return [
      {
        id: existingId.startsWith("steam-owned-") ? existingId : `steam-owned-${appId}`,
        title,
        description: readString(record, ["description"]) || `Steam game (Owned). AppID: ${appId}`,
        coverUrl:
          readString(record, ["heroUrl", "hero_url", "bannerUrl", "banner_url"]) ||
          steamImageUrl(appId, "library_hero.jpg"),
        logoUrl: readString(record, ["logoUrl", "logo_url"]) || steamImageUrl(appId, "header.jpg"),
        iconUrl: readString(record, ["iconUrl", "icon_url"]) || undefined,
        externalId: readString(record, ["externalId", "external_id"]) || appId,
        playtimeMinutes,
        lastPlayedAt: readString(record, ["lastPlayedAt", "last_played_at"]) || null,
      },
    ];
  });
}

export function fetchSteamOwnedGames(steamId: string): Promise<OwnedGame[]> {
  return invokeCommand<OwnedGame[]>("fetch_steam_owned_games", { steamId });
}

export function fetchGogOwnedGames(): Promise<OwnedGame[]> {
  // Use the backend's token-aware command instead of passing token from frontend
  return gogFetchOwnedGames();
}

export async function fetchEpicOwnedGames(): Promise<OwnedGame[]> {
  return invokeCommand<OwnedGame[]>("fetch_epic_owned_games");
}

export async function fetchUbisoftOwnedGames(): Promise<OwnedGame[]> {
  return invokeCommand<OwnedGame[]>("fetch_ubisoft_owned_games");
}

export async function openBattleNetLoginWindow(): Promise<void> {
  return invokeCommand<void>("open_battlenet_login_window");
}

export async function processBattleNetGamesPayload(payloadB64: string): Promise<OwnedGame[]> {
  return invokeCommand<OwnedGame[]>("process_battlenet_games_payload", { payloadB64 });
}

export function pauseDownload(gameId: string): Promise<void> {
  return invokeCommand<void>("pause_download", { gameId });
}

export function cancelDownload(gameId: string): Promise<void> {
  return invokeCommand<void>("cancel_download", { gameId });
}

export function archiveDownload(gameId: string): Promise<void> {
  return invokeCommand<void>("archive_download", { gameId });
}

export function getDownloadQueue(): Promise<DownloadItem[]> {
  return invokeCommand<DownloadItem[]>("get_download_queue");
}

export function checkProviderHealth(): Promise<ProviderHealthStatus[]> {
  return invokeCommand<ProviderHealthStatus[]>("check_provider_health");
}

export function reconcileDownloads(): Promise<ReconciliationResult> {
  return invokeCommand<ReconciliationResult>("reconcile_downloads");
}

export function startModInstall(input: ModInstallRequest): Promise<ModInstallResult> {
  return invokeCommand<ModInstallResult>("start_mod_install", { input });
}

export function getModQueue(): Promise<ModInstallQueueItem[]> {
  return invokeCommand<ModInstallQueueItem[]>("get_mod_queue");
}

export function pauseModInstall(installId: string): Promise<void> {
  return invokeCommand<void>("pause_mod_install", { installId });
}

export function cancelModInstall(installId: string): Promise<void> {
  return invokeCommand<void>("cancel_mod_install", { installId });
}

export function scanGameMods(gameId: string): Promise<InstalledModInfo[]> {
  return invokeCommand<InstalledModInfo[]>("scan_game_mods", { gameId });
}

export function enableMod(installId: string): Promise<InstalledModInfo> {
  return invokeCommand<InstalledModInfo>("enable_mod", { installId });
}

export function disableMod(installId: string): Promise<InstalledModInfo> {
  return invokeCommand<InstalledModInfo>("disable_mod", { installId });
}

export function uninstallMod(installId: string): Promise<void> {
  return invokeCommand<void>("uninstall_mod", { installId });
}

export function setModProviderSecret(provider: ModProvider, secret: string): Promise<void> {
  return invokeCommand<void>("set_mod_provider_secret", { provider, secret });
}

export function getLocalDatabasePath(): Promise<string> {
  return invokeCommand<string>("get_local_database_path");
}

export function getLocalSyncStatus(): Promise<LocalSyncStatus> {
  return invokeCommand<LocalSyncStatus>("get_local_sync_status");
}

export function getPendingLocalEntities(): Promise<LocalEntityPayload[]> {
  return invokeCommand<LocalEntityPayload[]>("get_pending_local_entities");
}

export function getAllLocalEntities(): Promise<LocalEntityPayload[]> {
  return invokeCommand<LocalEntityPayload[]>("get_all_local_entities");
}

export function markLocalEntitiesSynced(entities: LocalEntityKey[]): Promise<void> {
  return invokeCommand<void>("mark_local_entities_synced", { entities });
}

export function applyRemoteLocalEntities(entities: LocalEntityPayload[]): Promise<void> {
  return invokeCommand<void>("apply_remote_local_entities", { entities });
}

export function getUnsyncedPlaySessions(): Promise<PlaySession[]> {
  return invokeCommand<PlaySession[]>("get_unsynced_play_sessions");
}

export function markPlaySessionsSynced(ids: string[]): Promise<number> {
  return invokeCommand<number>("mark_play_sessions_synced", { ids });
}

export function upsertPlaySession(session: PlaySession): Promise<void> {
  return invokeCommand<void>("upsert_play_session", { session });
}

export function updatePlaySession(
  id: string,
  startedAt?: number | null,
  endedAt?: number | null,
  durationMinutes?: number | null,
): Promise<void> {
  return invokeCommand<void>("update_play_session", {
    id,
    startedAt,
    endedAt,
    durationMinutes,
  });
}

export function deletePlaySession(id: string): Promise<number> {
  return invokeCommand<number>("delete_play_session", { id });
}

export function getPlaySession(id: string): Promise<PlaySession | null> {
  return invokeCommand<PlaySession | null>("get_play_session", { id });
}

export function setCachedGamePlaytime(gameId: string, playtimeMinutes: number): Promise<void> {
  return invokeCommand<void>("set_cached_game_playtime", {
    gameId,
    playtimeMinutes,
  });
}

function getBrowserHardwareInfo(): HardwareInfo {
  const navigatorWithMemory = navigator as Navigator & {
    deviceMemory?: number;
  };
  const cores = navigator.hardwareConcurrency;
  const memory = navigatorWithMemory.deviceMemory;
  const monitor =
    typeof window !== "undefined" && window.screen
      ? `${window.screen.width}x${window.screen.height}`
      : null;

  return {
    controller: null,
    cpu: cores ? `${cores} logical cores` : null,
    gpu: getBrowserGpuName(),
    headset: null,
    keyboard: null,
    monitor,
    mouse: null,
    ram: memory ? `${memory} GB` : null,
    source: "browser",
  };
}

function getBrowserGpuName() {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  const gl =
    canvas.getContext("webgl") ??
    (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);

  if (!gl) return null;

  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  if (!debugInfo) return null;

  const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
  return typeof renderer === "string" && renderer.trim()
    ? normalizeBrowserGpuName(renderer.trim())
    : null;
}

function normalizeBrowserGpuName(renderer: string) {
  const angleMatch = renderer.match(/^ANGLE \([^,]+,\s*([^,(]+)/);
  if (angleMatch?.[1]) {
    return angleMatch[1].trim();
  }

  return renderer.length > 120 ? `${renderer.slice(0, 117)}...` : renderer;
}

// ============================================================================
// Platform Friends Commands
// ============================================================================

export function fetchSteamFriends(steamId: string): Promise<PlatformFriend[]> {
  return invokeCommand<PlatformFriend[]>("fetch_steam_friends", { steamId });
}

export function fetchGogFriends(accessToken: string): Promise<PlatformFriend[]> {
  return invokeCommand<PlatformFriend[]>("fetch_gog_friends", { accessToken });
}

export function fetchEpicFriends(): Promise<PlatformFriend[]> {
  return invokeCommand<PlatformFriend[]>("fetch_epic_friends");
}

export function fetchXboxFriends(xboxToken: string): Promise<PlatformFriend[]> {
  return invokeCommand<PlatformFriend[]>("fetch_xbox_friends", { xboxToken });
}

export function captureScreenshot(): Promise<string> {
  return invokeCommand<string>("capture_screenshot");
}

export function launchCrossPlayJoin(platform: string, gameSlug: string): Promise<string> {
  return invokeCommand<string>("launch_cross_play_join", { platform, gameSlug });
}

export function resolveGameExternalId(gameId: string, platform: string): Promise<string> {
  return invokeCommand<string>("resolve_game_external_id", { gameId, platform });
}
