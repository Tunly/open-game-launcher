import { isTauri } from "@tauri-apps/api/core";
import type { EaToken, GogToken, OwnedGame, XboxFetchResult } from "./types";
import { invokeCommand } from "./shared";

export interface SteamScrapedGamesEvent {
  games: unknown[];
  steamId: string;
}

export interface SteamScrapeErrorEvent {
  message: string;
  steamId: string;
}

export interface SteamLoginSuccessEvent {
  openidResponseUrl: string | null;
  steamId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeSteamLoginSuccessEvent(payload: unknown): SteamLoginSuccessEvent | null {
  if (typeof payload === "string") {
    const steamId = payload.trim();
    return /^\d{17}$/.test(steamId) ? { openidResponseUrl: null, steamId } : null;
  }
  if (!isRecord(payload)) return null;
  const steamId = typeof payload.steamId === "string" ? payload.steamId.trim() : "";
  const openidResponseUrl =
    typeof payload.openidResponseUrl === "string" ? payload.openidResponseUrl.trim() : "";
  if (!/^\d{17}$/.test(steamId) || !openidResponseUrl || openidResponseUrl.length > 16_384) {
    return null;
  }
  return { openidResponseUrl, steamId };
}

function isScrapedSteamGame(value: unknown) {
  if (!isRecord(value)) return false;
  const appId = value.appid ?? value.appId ?? value.app_id ?? value.id;
  const title = value.title ?? value.name;
  const hasAppId =
    (typeof appId === "number" && Number.isFinite(appId)) ||
    (typeof appId === "string" && /^(?:steam-owned-)?\d+$/.test(appId));
  return hasAppId && typeof title === "string" && title.trim().length > 0;
}

export function isSteamScrapedGamesEventForAccount(
  payload: unknown,
  currentSteamId: string,
): payload is SteamScrapedGamesEvent {
  return (
    isRecord(payload) &&
    Array.isArray(payload.games) &&
    payload.games.every(isScrapedSteamGame) &&
    typeof payload.steamId === "string" &&
    payload.steamId === currentSteamId.trim()
  );
}

export function isSteamScrapeErrorEventForAccount(
  payload: unknown,
  currentSteamId: string,
): payload is SteamScrapeErrorEvent {
  return (
    isRecord(payload) &&
    typeof payload.message === "string" &&
    payload.message.length > 0 &&
    typeof payload.steamId === "string" &&
    payload.steamId === currentSteamId.trim()
  );
}

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
  return invokeCommand("open_external_url", { url });
}

export interface SteamVerifiedIdentity {
  steamId: string;
  claimedId: string;
  verifiedAt: string;
}

export async function verifySteamOpenIdLocally(
  openidResponseUrl: string,
): Promise<SteamVerifiedIdentity> {
  return invokeCommand<SteamVerifiedIdentity>("verify_steam_openid", {
    openidResponseUrl,
  });
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
  if (!isTauri()) {
    return Promise.resolve(null);
  }

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
  if (!isTauri()) {
    return Promise.resolve(null);
  }

  return invokeCommand<EaToken | null>("ea_get_token");
}

export function eaLogout(): Promise<void> {
  return invokeCommand<void>("ea_logout");
}

export function eaFetchOwnedGames(): Promise<OwnedGame[]> {
  if (!isTauri()) {
    return Promise.resolve([]);
  }

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
  if (!isTauri()) {
    return Promise.reject(
      new Error("Launching Xbox games is available only in the OG-Launcher desktop app."),
    );
  }

  return invokeCommand<void>("launch_xbox_game", { pfn });
}

export function installXboxGame(pfn: string): Promise<void> {
  return invokeCommand<void>("install_xbox_game", { pfn });
}

export function fetchGamePassCatalog(): Promise<OwnedGame[]> {
  if (!isTauri()) {
    return Promise.resolve([]);
  }

  const language =
    typeof navigator === "undefined" || !navigator.language ? "en-US" : navigator.language;
  let market = "US";
  try {
    market = new Intl.Locale(language).maximize().region ?? market;
  } catch {
    // The native command validates and falls back when the browser locale is malformed.
  }

  return invokeCommand<OwnedGame[]>("fetch_game_pass_catalog", { language, market });
}

export function fetchSteamOwnedGames(steamId: string): Promise<OwnedGame[]> {
  if (!isTauri()) {
    return Promise.resolve([]);
  }

  return invokeCommand<OwnedGame[]>("fetch_steam_owned_games", { steamId });
}

export function fetchGogOwnedGames(): Promise<OwnedGame[]> {
  // Use the backend's token-aware command instead of passing token from frontend
  return gogFetchOwnedGames();
}

export async function fetchEpicOwnedGames(): Promise<OwnedGame[]> {
  if (!isTauri()) {
    return [];
  }

  return invokeCommand<OwnedGame[]>("fetch_epic_owned_games");
}

export async function fetchUbisoftOwnedGames(): Promise<OwnedGame[]> {
  if (!isTauri()) {
    return [];
  }

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
