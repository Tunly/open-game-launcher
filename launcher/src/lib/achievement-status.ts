import type { Game } from "./types";

export type AchievementProviderStatus = NonNullable<Game["achievementProviderStatuses"]>[number];

const PROVIDER_LABELS: Record<string, string> = {
  battlenet: "Battle.net",
  ea: "EA",
  epic: "Epic",
  gog: "GOG",
  ogl: "OG Launcher",
  steam: "Steam",
  ubisoft: "Ubisoft",
  xbox: "Xbox",
};

const PROVIDER_CLIENT_LABELS: Record<string, string> = {
  battlenet: "Battle.net",
  ea: "the EA app",
  epic: "Epic Games",
  gog: "GOG Galaxy",
  ogl: "OG Launcher",
  steam: "Steam",
  ubisoft: "Ubisoft Connect",
  xbox: "the Xbox app",
};

const COMMAND_FAILURE_PREFIX = /^[a-z0-9][a-z0-9_.:/ -]{0,79}\s+failed:\s*/i;
const LOCAL_CACHE_DIAGNOSTIC =
  /\b(?:no local\s+\S+\s+achievement cache found|local\s+\S+\s+achievement cache did not contain readable achievements|could not (?:read|parse) local achievement cache)\b/i;
const CHECKED_PATH_LIST = /\bchecked(?:\s+(?:paths?|locations?|files?))?\s*:/i;
const WINDOWS_ABSOLUTE_PATH = /(?:\b[a-z]:[\\/]|\\\\(?:[?.][\\/]|[^\\/\s]+[\\/]))/i;
const FORWARD_SLASH_UNC_PATH = /(?:^|[\s("'=;,])\/\/[^/\s]+\/[^/\s]+/;
const POSIX_ABSOLUTE_PATH = /(?:^|[^a-z0-9_/:.-])\/(?!\/)[a-z0-9_.~-]/i;
const LOCAL_FILE_URL = /\bfile:\/{2,3}/i;

export function getAchievementProviderDisplayName(source: string): string {
  const normalized = source.trim().toLowerCase();
  return PROVIDER_LABELS[normalized] ?? (source.trim() || "Provider");
}

/**
 * Returns the short provider badge label. When a sync failed or data is private
 * but achievements are still visible (e.g. keyless Steam fallback data), only
 * the provider name is shown instead of a red "Steam: failed" badge.
 */
export function getAchievementProviderStatusLabel(
  provider: AchievementProviderStatus,
  hasAchievements: boolean,
): string {
  const providerLabel = getAchievementProviderDisplayName(provider.source);
  if (hasAchievements && (provider.status === "failed" || provider.status === "private")) {
    return providerLabel;
  }
  return `${providerLabel}: ${provider.status}`;
}

function getAchievementProviderFallbackMessage(provider: AchievementProviderStatus): string {
  const providerLabel = getAchievementProviderDisplayName(provider.source);
  switch (provider.status) {
    case "available":
      return `${providerLabel} achievement sync is available.`;
    case "not_connected":
      return `${providerLabel} achievement sync needs a connected account or readable local data.`;
    case "no_api":
      return `${providerLabel} achievement sync has no stable provider API.`;
    case "private":
      return `${providerLabel} achievement data is private or unavailable.`;
    case "unsupported":
      return `${providerLabel} achievement sync is not supported for this game.`;
    case "failed":
    default:
      return `${providerLabel} achievement sync failed. Open the game in Library to try again.`;
  }
}

export function getAchievementProviderStatusMessage(provider: AchievementProviderStatus): string {
  const source = provider.source.trim().toLowerCase();
  const providerLabel = getAchievementProviderDisplayName(source);
  const fallback = getAchievementProviderFallbackMessage(provider);
  const rawMessage = provider.message.trim();

  if (!rawMessage) return fallback;

  const message = rawMessage.replace(COMMAND_FAILURE_PREFIX, "").trim();
  if (LOCAL_CACHE_DIAGNOSTIC.test(message)) {
    const clientLabel = PROVIDER_CLIENT_LABELS[source] ?? providerLabel;
    return `No readable ${providerLabel} achievement data was found on this PC. Launch the game through ${clientLabel}, then try again.`;
  }

  if (
    CHECKED_PATH_LIST.test(message) ||
    WINDOWS_ABSOLUTE_PATH.test(message) ||
    FORWARD_SLASH_UNC_PATH.test(message) ||
    POSIX_ABSOLUTE_PATH.test(message) ||
    LOCAL_FILE_URL.test(message) ||
    message.length > 240
  ) {
    return fallback;
  }

  return message || fallback;
}
