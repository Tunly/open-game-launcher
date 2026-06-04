import type { Game } from "./types";
import type { OwnedGame } from "./launcher";

export function ownedGameToGame(og: OwnedGame): Game {
  let launcher: Game["launcher"] = "manual";
  if (og.id.startsWith("steam-")) launcher = "steam";
  else if (og.id.startsWith("epic-")) launcher = "epic";
  else if (og.id.startsWith("gog-")) launcher = "gog";
  else if (og.id.startsWith("xbox-") || og.id.startsWith("gamepass-")) launcher = "xbox";
  else if (og.id.startsWith("ubisoft-")) launcher = "ubisoft";
  else if (og.id.startsWith("ea-")) launcher = "ea";
  else if (og.id.startsWith("battlenet-")) launcher = "battlenet";

  const ubisoftLaunchId = og.externalId ?? og.id.replace(/^ubisoft-owned-/, "");
  const gogLaunchId = og.externalId ?? og.id.replace(/^gog-owned-/, "");
  const eaLaunchId = og.externalId ?? og.id.replace(/^ea-owned-/, "");
  const steamLaunchId = og.externalId ?? og.id.replace(/^steam-owned-/, "");

  return {
    id: og.id,
    externalId: og.externalId ?? undefined,
    title: og.title,
    launchUri:
      og.id.startsWith("steam-owned-") && /^\d+$/.test(steamLaunchId)
        ? `steam://install/${steamLaunchId}`
        : og.id.startsWith("ubisoft-owned-") && ubisoftLaunchId
          ? `uplay://launch/${ubisoftLaunchId}`
          : og.id.startsWith("gog-owned-") && gogLaunchId
            ? `gogalaxy://openGameView/${gogLaunchId}`
            : og.id.startsWith("ea-owned-") && eaLaunchId
              ? `origin://launchgame/${eaLaunchId}`
              : undefined,
    description: og.description,
    version: "1.0",
    coverUrl: og.coverUrl ?? undefined,
    logoUrl: og.logoUrl ?? undefined,
    iconUrl: og.iconUrl ?? undefined,
    iconUrls: og.iconUrl ? [og.iconUrl] : [],
    logoUrls: og.logoUrl ? [og.logoUrl] : [],
    logoPosition: "centerCenter",
    status: "not_installed",
    platform: "windows",
    launcher,
    playtimeMinutes: og.playtimeMinutes,
    lastPlayedAt: og.lastPlayedAt,
    lastPlayed: og.lastPlayedAt ?? undefined,
    cloudGamingUrl: og.cloudGamingUrl ?? undefined,
  } as Game;
}

export function installedSteamAppIds(games: Game[]): Set<string> {
  const ids = new Set<string>();
  for (const g of games) {
    if (g.id.startsWith("steam-")) {
      ids.add(g.id.replace("steam-", ""));
      ids.add(g.title.toLowerCase());
    }
  }
  return ids;
}

export function installedGogKeys(games: Game[]): Set<string> {
  const keys = new Set<string>();
  for (const g of games) {
    if (!g.id.startsWith("gog-")) {
      continue;
    }
    keys.add(g.id);
    keys.add(g.id.replace(/^gog-/, ""));
    keys.add(g.title.toLowerCase());
    if (g.externalId) {
      keys.add(g.externalId);
      keys.add(`gog-owned-${g.externalId}`);
    }
  }
  return keys;
}

export function installedEaKeys(games: Game[]): Set<string> {
  const keys = new Set<string>();
  for (const g of games) {
    const launcher = (g.launcher || "").toLowerCase();
    if (!g.id.startsWith("ea-") && !launcher.includes("ea")) {
      continue;
    }
    keys.add(g.id);
    keys.add(g.title.toLowerCase());
    if (g.externalId) {
      keys.add(g.externalId);
      keys.add(`ea-owned-${g.externalId}`);
    }
  }
  return keys;
}

export function installedEpicIds(games: Game[]): Set<string> {
  const ids = new Set<string>();
  for (const g of games) {
    if (g.id.startsWith("epic-")) {
      ids.add(g.id.replace("epic-", ""));
      ids.add(g.title.toLowerCase());
    }
  }
  return ids;
}

export function installedUbiKeys(games: Game[]): Set<string> {
  const keys = new Set<string>();
  for (const g of games) {
    if (!g.id.startsWith("ubisoft-")) {
      continue;
    }
    keys.add(g.id);
    keys.add(g.id.replace(/^ubisoft-/, ""));
    keys.add(g.title.toLowerCase());
    if (g.externalId) {
      keys.add(g.externalId);
      keys.add(`ubisoft-owned-${g.externalId}`);
    }
  }
  return keys;
}

export function installedXboxIds(games: Game[]): Set<string> {
  const ids = new Set<string>();
  for (const g of games) {
    if (g.id.startsWith("xbox-")) {
      ids.add(g.id.replace("xbox-", ""));
      ids.add(g.title.toLowerCase());
    }
  }
  return ids;
}

export function installedBattlenetIds(games: Game[]): Set<string> {
  const ids = new Set<string>();
  for (const g of games) {
    if (g.id.startsWith("battlenet-")) {
      ids.add(g.id.replace("battlenet-", ""));
      ids.add(g.title.toLowerCase());
      if (g.externalId) ids.add(g.externalId);
    }
  }
  return ids;
}

export function readLocalStorageString(key: string): string {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return "";
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : "";
  } catch {
    const trimmed = raw.trim();
    if (trimmed.length >= 2) {
      const first = trimmed[0];
      const last = trimmed[trimmed.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        return trimmed.slice(1, -1);
      }
    }
    return trimmed;
  }
}

export function getProviderErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
