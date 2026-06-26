import { isTauri } from "@tauri-apps/api/core";
import type {
  Game,
  RemotePlayDescriptor,
  RemotePlayLaunchResult,
  RemotePlayRequest,
} from "./types";
import { getGameSource } from "../formatters";
import {
  REMOTE_PLAY_ALLOWED_URI_PREFIXES,
  cleanOptionalString,
  invokeCommand,
  normalizeSteamAppId,
  steamAppIdFromLaunchUri,
} from "./shared";

export function getRemotePlayDescriptor(game: Game | null | undefined): RemotePlayDescriptor {
  if (!game) {
    return unsupportedRemotePlay("No game selected.");
  }

  const request = remotePlayRequestForGame(game);
  const steamAppId = resolveRemoteSteamAppId(game);
  if (steamAppId) {
    return {
      supported: true,
      providerLabel: "Steam",
      actionLabel: "Remote Play",
      statusLabel: `Steam AppID ${steamAppId}`,
      detail: "Official Steam delegation",
      request,
    };
  }

  const delegate = resolveRemoteDelegate(game);
  if (delegate) {
    return {
      supported: true,
      providerLabel: delegate.providerLabel,
      actionLabel: delegate.actionLabel,
      statusLabel: delegate.statusLabel,
      detail: delegate.detail,
      request,
    };
  }

  return unsupportedRemotePlay("No supported Remote Play URI.");
}

export function startRemotePlay(game: Game): Promise<RemotePlayLaunchResult> {
  const descriptor = getRemotePlayDescriptor(game);
  if (!descriptor.supported || !descriptor.request) {
    return Promise.reject(new Error(descriptor.detail));
  }
  if (!isTauri()) {
    return Promise.reject(new Error("Remote Play delegation is available in the desktop app."));
  }

  return invokeCommand<RemotePlayLaunchResult>("start_remote_play", {
    input: descriptor.request,
  });
}

function unsupportedRemotePlay(detail: string): RemotePlayDescriptor {
  return {
    supported: false,
    providerLabel: "Remote Play",
    actionLabel: "Remote Play",
    statusLabel: "Unavailable",
    detail,
    request: null,
  };
}

function remotePlayRequestForGame(game: Game): RemotePlayRequest {
  return {
    gameId: cleanOptionalString(game.id),
    launcher: cleanOptionalString(getGameSource(game) || game.launcher || null),
    externalId: cleanOptionalString(game.externalId ?? null),
    launchUri: cleanOptionalString(game.launchUri ?? null),
    cloudGamingUrl: cleanOptionalString(game.cloudGamingUrl ?? null),
  };
}

function resolveRemoteSteamAppId(game: Game): string | null {
  const source = getGameSource(game);
  if (source === "steam") {
    const externalId = normalizeSteamAppId(game.externalId);
    if (externalId) return externalId;

    const gameId = normalizeSteamAppId(game.id);
    if (gameId) return gameId;
  }

  return steamAppIdFromLaunchUri(game.launchUri);
}

function resolveRemoteDelegate(game: Game): {
  providerLabel: string;
  actionLabel: string;
  statusLabel: string;
  detail: string;
} | null {
  const cloudUrl = cleanOptionalString(game.cloudGamingUrl ?? null);
  if (cloudUrl && isRemoteDelegateUriAllowed(cloudUrl)) {
    return {
      providerLabel: "Cloud",
      actionLabel: "Remote Play",
      statusLabel: "HTTPS cloud endpoint",
      detail: "Configured cloud stream",
    };
  }

  const launchUri = cleanOptionalString(game.launchUri ?? null);
  if (launchUri && isRemoteDelegateUriAllowed(launchUri)) {
    return {
      providerLabel: "Launcher",
      actionLabel: "Remote Play",
      statusLabel: remoteStatusForUri(launchUri),
      detail: "Official launcher URI",
    };
  }

  return null;
}

function isRemoteDelegateUriAllowed(uri: string): boolean {
  const trimmed = uri.trim();
  if (trimmed.startsWith("http://")) return false;
  return REMOTE_PLAY_ALLOWED_URI_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function remoteStatusForUri(uri: string): string {
  if (uri.startsWith("steam://")) return "Steam URI";
  if (uri.startsWith("com.epicgames.launcher://")) return "Epic URI";
  if (uri.startsWith("goggalaxy://")) return "GOG URI";
  if (uri.startsWith("ms-xbl-38966778-3f57-4f6e-a6e9-3b81c79fbb3f://")) return "Xbox URI";
  if (uri.startsWith("battlenet://")) return "Battle.net URI";
  if (uri.startsWith("origin2://")) return "EA URI";
  if (uri.startsWith("uplay://")) return "Ubisoft URI";
  if (uri.startsWith("https://")) return "HTTPS endpoint";
  return "Launcher URI";
}
