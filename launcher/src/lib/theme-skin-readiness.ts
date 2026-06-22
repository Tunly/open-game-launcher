import type { ProfileTheme } from "./types/profile";
import { isLocalCustomProfileTheme } from "./profile-theme-exchange";

export type ThemeSkinReadinessStatus = "blocked" | "ready" | "warning";

export interface ThemeSkinReadinessPlan {
  blockers: string[];
  checklist: string[];
  selectedThemeName: string;
  status: ThemeSkinReadinessStatus;
  summary: string;
  themeCount: number;
  warnings: string[];
}

export function buildThemeSkinReadinessPlan({
  isLocalFallback,
  selectedThemeId,
  themes,
}: {
  isLocalFallback: boolean;
  selectedThemeId: string;
  themes: ProfileTheme[];
}): ThemeSkinReadinessPlan {
  const activeThemes = themes.filter((theme) => theme.isActive);
  const selectedTheme =
    themes.find((theme) => theme.id === selectedThemeId) ?? activeThemes[0] ?? null;
  const hasLocalCustomTheme = activeThemes.some(isLocalCustomProfileTheme);
  const blockers: string[] = [];
  const warnings: string[] = [
    "Profile themes remain separate from browser-only shell skin",
    "Custom theme import/export is schema-validated; hosted draft sync is profile-only",
  ];

  if (activeThemes.length === 0) blockers.push("No active profile themes are available");
  if (!selectedTheme) blockers.push("No profile theme is selected or staged");
  if (isLocalFallback)
    warnings.push(
      "Local draft only; profile_theme_id query-shape evidence does not verify live persistence",
    );

  const status = blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready";
  const selectedThemeName = selectedTheme?.name ?? "Default Theme";

  return {
    blockers,
    checklist: [
      `${activeThemes.length} active profile theme${activeThemes.length === 1 ? "" : "s"} visible`,
      `${selectedThemeName} selected for profile preview`,
      hasLocalCustomTheme
        ? "Custom theme JSON draft imported"
        : "Custom theme JSON exchange staged",
      "OG-Launcher Retro Manga shell preserved",
      "profile_theme_id query-shape evidence only",
    ],
    selectedThemeName,
    status,
    summary:
      status === "blocked"
        ? "Theme Skin readiness is blocked until an active profile theme is available."
        : `${selectedThemeName} can be staged as a profile theme while app-wide skins stay open.`,
    themeCount: activeThemes.length,
    warnings,
  };
}
