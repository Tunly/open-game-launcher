import type { Game } from "./types";

const SOURCE_LABELS: Record<string, string> = {
  battlenet: "Battle.net",
  ea: "EA",
  epic: "Epic",
  gog: "GOG",
  linux: "Linux",
  macos: "macOS",
  manual: "Manual",
  steam: "Steam",
  ubisoft: "Ubisoft",
  uplay: "Ubisoft",
  windows: "Windows",
  xbox: "Xbox",
};

/**
 * Coerce any thrown value into a human-readable string.
 *
 * - `Error` instances use `.message` (preserves subclass messages such as
 *   `CloudNotConfiguredError`).
 * - Strings, numbers, booleans are stringified.
 * - `null` and `undefined` are reported explicitly as `"null"` / `"undefined"`
 *   so the call site always gets a non-empty string.
 */
export function getErrorMessage(error: unknown): string {
  if (error === null) return "null";
  if (error === undefined) return "undefined";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  try {
    return String(error);
  } catch {
    return "Unknown error";
  }
}

export function executableTitleFromPath(path: string): string {
  const fileName = path.split(/[\\/]/).pop() ?? path;
  return (
    fileName
      .replace(/\.exe$/i, "")
      .replace(/[_-]+/g, " ")
      .trim() || fileName
  );
}

export function getGameLogoCandidates(game: Game): string[] {
  return [game.logoUrl, ...(game.logoUrls ?? [])].filter(
    (logoUrl, index, logoUrls): logoUrl is string =>
      Boolean(logoUrl) && logoUrls.indexOf(logoUrl) === index,
  );
}

export function getGameIconCandidates(game: Game): string[] {
  return [
    game.iconUrl,
    ...(game.iconUrls ?? []),
    game.logoUrl,
    ...(game.logoUrls ?? []),
    game.coverUrl,
  ].filter(
    (iconUrl, index, iconUrls): iconUrl is string =>
      Boolean(iconUrl) && iconUrls.indexOf(iconUrl) === index,
  );
}

export function getLogoPositionClass(game: Game): string {
  switch (game.logoPosition) {
    case "upperCenter":
      return "left-1/2 top-[9%] max-h-[42%] w-[min(44%,420px)] -translate-x-1/2";
    case "centerCenter":
      return "left-1/2 top-1/2 max-h-[46%] w-[min(46%,440px)] -translate-x-1/2 -translate-y-1/2";
    case "bottomCenter":
      return "bottom-[13%] left-1/2 max-h-[42%] w-[min(44%,420px)] -translate-x-1/2";
    case "bottomLeft":
    default:
      return "bottom-[12%] left-[5%] max-h-[42%] w-[min(38%,360px)]";
  }
}

export function getLogoPlacementStyle(game: Game) {
  return {
    width: game.logoWidthPercent
      ? `${Math.min(Math.max(game.logoWidthPercent, 18), 52)}%`
      : undefined,
    maxHeight: game.logoHeightPercent
      ? `${Math.min(Math.max(game.logoHeightPercent, 24), 46)}%`
      : undefined,
  };
}

export function formatLastPlayed(lastPlayed?: string | null): string {
  if (!lastPlayed) {
    return "Not played";
  }

  const date = new Date(lastPlayed);
  if (Number.isNaN(date.getTime())) {
    return lastPlayed;
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatPlayTime(playtimeMinutes?: number): string {
  if (!playtimeMinutes || playtimeMinutes <= 0) {
    return "0 hours";
  }

  const hours = playtimeMinutes / 60;
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} hours`;
}

export function formatAchievementProgress(game: Game): string {
  const total = game.achievements?.length ?? 0;
  const unlocked = game.achievements?.filter((achievement) => achievement.unlockedAt).length ?? 0;
  return `${unlocked}/${total}`;
}

function launcherHintFromId(id: string): Game["launcher"] | null {
  if (id.startsWith("steam-") || id.startsWith("steam-owned-")) return "steam";
  if (id.startsWith("epic-")) return "epic";
  if (id.startsWith("gog-")) return "gog";
  if (id.startsWith("ubisoft-")) return "ubisoft";
  if (id.startsWith("xbox-")) return "xbox";
  if (id.startsWith("battlenet-")) return "battlenet";
  if (id.startsWith("ea-")) return "ea";
  if (id.startsWith("manual-")) return "manual";
  return null;
}

function launcherHintFromLabel(launcher: string): Game["launcher"] | null {
  const value = launcher.toLowerCase();
  if (value.includes("steam")) return "steam";
  if (value.includes("epic")) return "epic";
  if (value.includes("gog")) return "gog";
  if (value.includes("ubisoft") || value.includes("uplay")) return "ubisoft";
  if (value.includes("xbox")) return "xbox";
  if (value.includes("battle.net") || value.includes("battlenet")) return "battlenet";
  if (
    value.includes("origin") ||
    value.includes("ea app") ||
    value === "ea" ||
    value.startsWith("ea ")
  ) {
    return "ea";
  }
  if (value.includes("manual")) return "manual";
  return null;
}

/** Normalize backend launcher strings (`EA App`, `Steam`, …) to LauncherType keys. */
export function normalizeLauncherKey(launcher?: string, gameId?: string): Game["launcher"] {
  const id = (gameId || "").toLowerCase();
  return (
    launcherHintFromId(id) ??
    launcherHintFromLabel(launcher || "") ??
    (launcher as Game["launcher"]) ??
    "unknown"
  );
}

export function getGameSource(game: Game): string {
  const id = game.id.toLowerCase();
  const launcher = normalizeLauncherKey(game.launcher, game.id);

  const fromId = launcherHintFromId(id);
  if (fromId) return fromId;

  if (launcher && launcher !== "unknown") return launcher;

  const description = game.description.toLowerCase();
  if (description.includes("ea app") || description.includes("origin")) return "ea";
  if (description.includes("epic")) return "epic";
  if (description.includes("gog")) return "gog";
  if (description.includes("ubisoft") || description.includes("uplay")) return "ubisoft";
  if (description.includes("xbox")) return "xbox";
  if (description.includes("battle.net")) return "battlenet";
  if (description.includes("steam")) return "steam";

  return game.platform;
}

export function getSourceDisplayLabel(source: string | null | undefined): string {
  const normalized = (source ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!normalized) return "Unknown";
  return SOURCE_LABELS[normalized] ?? source?.trim() ?? normalized;
}

/** Match advanced library launcher filter (e.g. "ea" matches "EA App" installs). */
export function matchesLauncherFilter(game: Game, filterLauncher: string): boolean {
  const filterToken = filterLauncher.toLowerCase().replace(/[^a-z0-9]/g, "");
  const sourceToken = getGameSource(game).replace(/[^a-z0-9]/g, "");
  return sourceToken === filterToken;
}

export function getFallbackBannerClass(game: Game): string {
  if (game.coverUrl) {
    return "";
  }
  return `library-source-art library-source-art-${getGameSource(game)}`;
}

const KNOWN_BANNER_SOURCES: Record<string, string> = {
  steam: "steam-game-banner-hero",
  xbox: "xbox-game-banner-hero",
  epic: "epic-game-banner-hero",
  gog: "gog-game-banner-hero",
  ubisoft: "ubisoft-game-banner-hero",
  battlenet: "battlenet-game-banner-hero",
  ea: "ea-game-banner-hero",
  manual: "manual-game-banner-hero",
  unknown: "unknown-game-banner-hero",
  windows: "windows-game-banner-hero",
  macos: "macos-game-banner-hero",
  linux: "linux-game-banner-hero",
};

export function getPlatformBannerClass(game: Game): string {
  return KNOWN_BANNER_SOURCES[getGameSource(game)] ?? "steam-game-banner-hero";
}
