import type { PlatformFriend } from "./types";
import { invokeCommand } from "./shared";

export function fetchSteamFriends(steamId: string): Promise<PlatformFriend[]> {
  return invokeCommand<PlatformFriend[]>("fetch_steam_friends", { steamId });
}

export function fetchGogFriends(): Promise<PlatformFriend[]> {
  return invokeCommand<PlatformFriend[]>("fetch_gog_friends");
}

export function fetchEpicFriends(): Promise<PlatformFriend[]> {
  return invokeCommand<PlatformFriend[]>("fetch_epic_friends");
}

export function fetchXboxFriends(xboxToken: string): Promise<PlatformFriend[]> {
  return invokeCommand<PlatformFriend[]>("fetch_xbox_friends", { xboxToken });
}
