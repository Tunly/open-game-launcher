import { invoke } from "@tauri-apps/api/core";

import type {
  HardwareInfo,
  LaunchGameResponse,
  Game,
  DownloadItem,
  SaveFile,
  StartDownloadResponse,
  SystemInfo,
  DiskInfo,
  VerifyGameFilesResult,
  RepairGameFilesResponse,
  CheckGameUpdatesResponse,
  InstallGameUpdateResponse,
  SyncGameSavesResponse,
  UploadGameSavesToCloudResponse,
  DownloadGameSavesFromCloudResponse,
  RestoreGameSavesFromCloudResponse,
  SyncGameAchievementsResponse,
  UninstallGameResponse,
  UnifiedAchievement,
} from "./types";

type CommandArgs = Record<string, unknown>;

export class LauncherCommandError extends Error {
  constructor(
    public readonly command: string,
    cause: unknown,
  ) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`${command} failed: ${message}`);
    this.name = "LauncherCommandError";
  }
}

async function invokeCommand<T>(
  command: string,
  args?: CommandArgs,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw new LauncherCommandError(command, error);
  }
}

export function getSystemInfo(): Promise<SystemInfo> {
  return invokeCommand<SystemInfo>("get_system_info");
}

export function getDiskInfo(): Promise<DiskInfo[]> {
  return invokeCommand<DiskInfo[]>("get_disk_info");
}

export function getDefaultInstallDir(): Promise<string> {
  return invokeCommand<string>("get_default_install_dir");
}

export function getHardwareInfo(): Promise<HardwareInfo> {
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

export function refreshInstalledGames(): Promise<Game[]> {
  return invokeCommand<Game[]>("refresh_installed_games");
}

export function addManualGame(input: {
  title: string;
  installPath: string;
}): Promise<Game> {
  return invokeCommand<Game>("add_manual_game", { input });
}

export function moveGame(input: {
  gameId: string;
  newPath: string;
}): Promise<void> {
  return invokeCommand<void>("move_game", { input });
}

export function updateGameMetadata(input: {
  gameId: string;
  coverUrl?: string;
  logoUrl?: string;
  iconUrl?: string;
  rating?: number;
  achievements?: UnifiedAchievement[];
  saveFiles?: SaveFile[];
  friendsPlaying?: string[];
}): Promise<Game> {
  return invokeCommand<Game>("update_game_metadata", { input });
}

export function importLibrarySnapshot(games: Game[]): Promise<Game[]> {
  return invokeCommand<Game[]>("import_library_snapshot", { games });
}

export function launchGame(gameId: string): Promise<LaunchGameResponse> {
  return invokeCommand<LaunchGameResponse>("launch_game", { gameId });
}


export function verifyGameFiles(
  gameId: string,
): Promise<VerifyGameFilesResult> {
  return invokeCommand<VerifyGameFilesResult>("verify_game_files", { gameId });
}

export function repairGameFiles(gameId: string): Promise<RepairGameFilesResponse> {
  return invokeCommand<RepairGameFilesResponse>("repair_game_files", { gameId });
}

export function checkGameUpdates(): Promise<CheckGameUpdatesResponse> {
  return invokeCommand<CheckGameUpdatesResponse>("check_game_updates");
}

export function installGameUpdate(gameId: string): Promise<InstallGameUpdateResponse> {
  return invokeCommand<InstallGameUpdateResponse>("install_game_update", { gameId });
}

export function syncGameSaves(gameId: string): Promise<SyncGameSavesResponse> {
  return invokeCommand<SyncGameSavesResponse>("sync_game_saves", { gameId });
}

export function uploadGameSavesToCloud(input: {
  gameId: string;
  supabaseUrl: string;
  apiKey: string;
  accessToken: string;
  userId: string;
}): Promise<UploadGameSavesToCloudResponse> {
  return invokeCommand<UploadGameSavesToCloudResponse>("upload_game_saves_to_cloud", { input });
}

export function downloadGameSavesFromCloud(input: {
  gameId: string;
  supabaseUrl: string;
  apiKey: string;
  accessToken: string;
  userId: string;
}): Promise<DownloadGameSavesFromCloudResponse> {
  return invokeCommand<DownloadGameSavesFromCloudResponse>("download_game_saves_from_cloud", { input });
}

export function restoreGameSavesFromCloud(input: {
  gameId: string;
  supabaseUrl: string;
  apiKey: string;
  accessToken: string;
  userId: string;
}): Promise<RestoreGameSavesFromCloudResponse> {
  return invokeCommand<RestoreGameSavesFromCloudResponse>("restore_game_saves_from_cloud", { input });
}

export function syncGameAchievements(
  game: Game,
  steamId?: string,
  apiKey?: string,
): Promise<SyncGameAchievementsResponse> {
  if (game.launcher === "xbox") {
    // Xbox uses its own sync command
    return invokeCommand<SyncGameAchievementsResponse>("sync_xbox_achievements", { 
      gameId: game.id,
      titleId: game.externalId || ""
    });
  }
  return invokeCommand<SyncGameAchievementsResponse>("sync_game_achievements", { gameId: game.id, steamId, apiKey });
}

export function uninstallGame(gameId: string): Promise<UninstallGameResponse> {
  return invokeCommand<UninstallGameResponse>("uninstall_game", { gameId });
}

export function startDownload(gameId: string): Promise<StartDownloadResponse> {
  return invokeCommand<StartDownloadResponse>("start_download", { gameId });
}

export function openSteamLoginWindow(): Promise<void> {
  return invokeCommand<void>("open_steam_login_window");
}

export async function openSteamScraperWindow(steamId: string) {
  return invokeCommand<void>("open_steam_scraper_window", { steamId });
}

export async function fetchSteamProfileName(steamId: string) {
  return invokeCommand<string>("fetch_steam_profile_name", { steamId });
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

export function gogFetchOwnedGames(): Promise<OwnedGame[]> {
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

export interface GogDownloadInfo {
  gameId: string;
  title: string;
  installerId: string;
  version: string;
  totalSize: number;
  files: Array<{
    id: string;
    name: string;
    size: number;
    checksum: string;
    chunks: Array<{
      id: string;
      byteOffset: number;
      byteSize: number;
      checksum: string;
    }>;
  }>;
  downloadUrl: string | null;
}

export function gogGetDownloadInfo(gogId: string, platform?: string): Promise<GogDownloadInfo> {
  return invokeCommand<GogDownloadInfo>("gog_get_download_info", { gogId, platform });
}

export function gogStartDownload(gogId: string, installPath?: string): Promise<StartDownloadResponse> {
  return invokeCommand<StartDownloadResponse>("gog_start_download", { gogId, installPath });
}

export interface GogCloudSaveInfo {
  gameId: string;
  files: Array<{
    path: string;
    timestamp: number;
    size: number;
  }>;
}

export function gogGetCloudSaves(gogId: string): Promise<GogCloudSaveInfo> {
  return invokeCommand<GogCloudSaveInfo>("gog_get_cloud_saves", { gogId });
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
    const hours = readNumber(record, [
      "hours_forever",
      "hours",
      "playtimeHours",
    ]);
    const playtimeMinutes =
      readNumber(record, ["playtimeMinutes", "playtime_minutes"]) ||
      Math.round(hours * 60);

    return [
      {
        id: existingId.startsWith("steam-owned-")
          ? existingId
          : `steam-owned-${appId}`,
        title,
        description:
          readString(record, ["description"]) ||
          `Steam game (Owned). AppID: ${appId}`,
        coverUrl:
          readString(record, ["heroUrl", "hero_url", "bannerUrl", "banner_url"]) ||
          steamImageUrl(appId, "library_hero.jpg"),
        logoUrl:
          readString(record, ["logoUrl", "logo_url"]) ||
          steamImageUrl(appId, "header.jpg"),
        iconUrl: readString(record, ["iconUrl", "icon_url"]) || undefined,
        playtimeMinutes,
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

export function pauseDownload(gameId: string): Promise<void> {
  return invokeCommand<void>("pause_download", { gameId });
}

export function cancelDownload(gameId: string): Promise<void> {
  return invokeCommand<void>("cancel_download", { gameId });
}

export function getDownloadQueue(): Promise<DownloadItem[]> {
  return invokeCommand<DownloadItem[]>("get_download_queue");
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
