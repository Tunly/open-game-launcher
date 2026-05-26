import { invoke } from "@tauri-apps/api/core";

import type {
  HardwareInfo,
  LaunchGameResponse,
  Game,
  DownloadItem,
  StartDownloadResponse,
  SystemInfo,
  DiskInfo,
  VerifyGameFilesResult,
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

export function launchGame(gameId: string): Promise<LaunchGameResponse> {
  return invokeCommand<LaunchGameResponse>("launch_game", { gameId });
}

export function verifyGameFiles(
  gameId: string,
): Promise<VerifyGameFilesResult> {
  return invokeCommand<VerifyGameFilesResult>("verify_game_files", { gameId });
}

export function startDownload(gameId: string): Promise<StartDownloadResponse> {
  return invokeCommand<StartDownloadResponse>("start_download", { gameId });
}

export function openSteamLoginWindow(): Promise<void> {
  return invokeCommand<void>("open_steam_login_window");
}

export function openSteamScraperWindow(steamId: string): Promise<void> {
  return invokeCommand<void>("open_steam_scraper_window", { steamId });
}

export function openGogLoginWindow(): Promise<void> {
  return invokeCommand<void>("open_gog_login_window");
}

export function openEpicLoginWindow(): Promise<void> {
  return invokeCommand<void>("open_epic_login_window");
}

export interface OwnedGame {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  logoUrl: string | null;
  iconUrl: string | null;
  playtimeMinutes: number;
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
          readString(record, ["coverUrl", "cover_url"]) ||
          steamImageUrl(appId, "library_600x900.jpg"),
        logoUrl:
          readString(record, ["logoUrl", "logo_url"]) ||
          steamImageUrl(appId, "header.jpg"),
        iconUrl: readString(record, ["iconUrl", "icon_url"]) || null,
        playtimeMinutes,
      },
    ];
  });
}

export function fetchSteamOwnedGames(steamId: string): Promise<OwnedGame[]> {
  return invokeCommand<OwnedGame[]>("fetch_steam_owned_games", { steamId });
}

export function fetchGogOwnedGames(accessToken: string): Promise<OwnedGame[]> {
  return invokeCommand<OwnedGame[]>("fetch_gog_owned_games", { accessToken });
}

export function fetchEpicOwnedGames(accessToken: string, accountId: string): Promise<OwnedGame[]> {
  return invokeCommand<OwnedGame[]>("fetch_epic_owned_games", { accessToken, accountId });
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
