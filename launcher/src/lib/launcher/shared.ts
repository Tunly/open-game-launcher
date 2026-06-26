import { invoke } from "@tauri-apps/api/core";
import type { ClientPlatformId, HardwareInfo } from "./types";

export type CommandArgs = Record<string, unknown>;

export const CLIENT_PLATFORM_IDS = [
  "steam",
  "epic",
  "gog",
  "xbox",
  "ubisoft",
  "battlenet",
  "ea",
] as const;

export const CLIENT_HEALTH_CACHE_MAX_AGE_MS = 5_000;

export const REMOTE_PLAY_ALLOWED_URI_PREFIXES = [
  "steam://",
  "com.epicgames.launcher://",
  "goggalaxy://",
  "ms-xbl-38966778-3f57-4f6e-a6e9-3b81c79fbb3f://",
  "battlenet://",
  "origin2://",
  "uplay://",
  "psjoin://",
  "switchgame://",
  "https://",
] as const;

export const CLIENT_DISPLAY_NAMES: Record<ClientPlatformId, string> = {
  battlenet: "Battle.net",
  ea: "EA app",
  epic: "Epic Games",
  gog: "GOG Galaxy",
  steam: "Steam",
  ubisoft: "Ubisoft Connect",
  xbox: "Xbox",
};

export const CLIENT_OFFICIAL_DOWNLOAD_URIS: Record<ClientPlatformId, string> = {
  battlenet: "https://download.battle.net/en-us/desktop",
  ea: "https://www.ea.com/ea-app",
  epic: "https://store.epicgames.com/download",
  gog: "https://www.gog.com/galaxy",
  steam: "https://store.steampowered.com/about/",
  ubisoft: "https://www.ubisoft.com/en-us/ubisoft-connect/download",
  xbox: "https://www.xbox.com/apps/xbox-app-for-pc",
};

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

export async function invokeCommand<T>(command: string, args?: CommandArgs): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw new LauncherCommandError(command, error);
  }
}

export function isClientPlatformId(value: string | null | undefined): value is ClientPlatformId {
  return CLIENT_PLATFORM_IDS.includes(value as ClientPlatformId);
}

export function toClientPlatformId(value: string | null | undefined): ClientPlatformId | null {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized === "battle" || normalized === "battlenet" || normalized === "battlenetapp") {
    return "battlenet";
  }
  if (normalized === "ea" || normalized === "eaapp" || normalized === "origin") {
    return "ea";
  }
  if (normalized === "epicgames") {
    return "epic";
  }
  if (normalized === "ubisoftconnect" || normalized === "uplay") {
    return "ubisoft";
  }
  return isClientPlatformId(normalized) ? normalized : null;
}

export function cleanOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeSteamAppId(value: string | null | undefined): string | null {
  const trimmed = cleanOptionalString(value);
  if (!trimmed) return null;
  const candidate = trimmed.toLowerCase().startsWith("steam-") ? trimmed.slice(6) : trimmed;
  if (!/^[1-9]\d{0,9}$/.test(candidate)) return null;
  return candidate;
}

export function steamAppIdFromLaunchUri(uri: string | null | undefined): string | null {
  const trimmed = cleanOptionalString(uri);
  if (!trimmed) return null;
  const match = /^steam:\/\/(?:run|rungameid)\/([^/?#&]+)/.exec(trimmed);
  return normalizeSteamAppId(match?.[1]);
}

export function getBrowserHardwareInfo(): HardwareInfo {
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
