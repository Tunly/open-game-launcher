import { describe, expect, it } from "vitest";

import { buildThemeSkinReadinessPlan } from "../theme-skin-readiness";
import type { ProfileTheme } from "../types/profile";

describe("buildThemeSkinReadinessPlan", () => {
  it("builds a warning plan for local profile themes without app-wide skin claims", () => {
    const plan = buildThemeSkinReadinessPlan({
      isLocalFallback: true,
      selectedThemeId: "paper",
      themes: [makeTheme({ id: "paper", name: "Retro Paper Room" })],
    });

    expect(plan.status).toBe("warning");
    expect(plan.selectedThemeName).toBe("Retro Paper Room");
    expect(plan.checklist).toContain("OG-Launcher Retro Manga shell preserved");
    expect(plan.checklist).toContain("Custom theme JSON exchange staged");
    expect(plan.checklist).toContain("profile_theme_id query-shape evidence only");
    expect(plan.warnings).toContain("Profile themes remain separate from browser-only shell skin");
    expect(plan.warnings).toContain(
      "Custom theme import/export is schema-validated; hosted draft sync is profile-only",
    );
    expect(plan.warnings).toContain(
      "Local draft only; profile_theme_id query-shape evidence does not verify live persistence",
    );
  });

  it("blocks when no active profile theme is available", () => {
    const plan = buildThemeSkinReadinessPlan({
      isLocalFallback: false,
      selectedThemeId: "disabled",
      themes: [makeTheme({ id: "disabled", isActive: false, name: "Disabled" })],
    });

    expect(plan.status).toBe("blocked");
    expect(plan.blockers).toContain("No active profile themes are available");
  });
});

function makeTheme(patch: Partial<ProfileTheme> = {}): ProfileTheme {
  return {
    accentColor: "#b7102a",
    backgroundType: "solid",
    backgroundValue: "#f6edd8",
    cardStyle: "pixel",
    createdAt: "2026-06-11T12:00:00.000Z",
    description: "Theme",
    id: "theme",
    isActive: true,
    isPremium: false,
    key: "theme",
    name: "Theme",
    textColor: "#171411",
    ...patch,
  };
}
