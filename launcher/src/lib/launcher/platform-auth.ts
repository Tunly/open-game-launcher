import { isTauri } from "@tauri-apps/api/core";
import type { EaToken, GogToken, OwnedGame, XboxFetchResult } from "./types";
import { invokeCommand } from "./shared";

export function openSteamLoginWindow(): Promise<void> {
  if (!isTauri()) {
    return Promise.reject(new Error("Steam login is available in the desktop app."));
  }

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
  if (!isTauri()) {
    return Promise.reject(new Error("GOG login is available in the desktop app."));
  }

  return invokeCommand<void>("open_gog_login_window");
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

export function openEaLoginWindow(): Promise<void> {
  if (!isTauri()) {
    return Promise.reject(new Error("EA App login is available in the desktop app."));
  }

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
  if (!isTauri()) {
    return Promise.reject(new Error("Epic Games login is available in the desktop app."));
  }

  return invokeCommand<void>("open_epic_login_window");
}

export async function authenticateEpicLegendary(code: string): Promise<string> {
  return invokeCommand<string>("authenticate_epic_legendary", { code });
}

export function openXboxLoginWindow(): Promise<void> {
  if (!isTauri()) {
    return Promise.reject(new Error("Xbox login is available in the desktop app."));
  }

  return invokeCommand<void>("open_xbox_login_window");
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
  if (!isTauri()) {
    return Promise.reject(new Error("Battle.net login is available in the desktop app."));
  }

  return invokeCommand<void>("open_battlenet_login_window");
}

export async function processBattleNetGamesPayload(payloadB64: string): Promise<OwnedGame[]> {
  return invokeCommand<OwnedGame[]>("process_battlenet_games_payload", { payloadB64 });
}
