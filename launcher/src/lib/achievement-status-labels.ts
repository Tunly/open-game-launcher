import type { AchievementProviderStatus } from "./achievement-status";

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
