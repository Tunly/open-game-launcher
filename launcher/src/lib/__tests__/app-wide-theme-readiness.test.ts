import { describe, expect, it } from "vitest";

import {
  buildAppWideThemeReadiness,
  createVerifyAppWideThemeReadiness,
} from "../app-wide-theme-readiness";

describe("buildAppWideThemeReadiness", () => {
  it("keeps app-wide skins local while exposing browser-only custom theme exchange", () => {
    const readiness = createVerifyAppWideThemeReadiness();

    expect(readiness.statusLabel).toBe("Needs staging");
    expect(readiness.readyCount).toBe(3);
    expect(readiness.warningCount).toBe(4);
    expect(readiness.blockedCount).toBe(0);
    expect(readiness.guards).toContain("Browser-only shell skin selected");
    expect(readiness.guards).toContain("Local custom theme JSON only");
    expect(readiness.guards).toContain("Shell-skin query-shape evidence only");
    expect(readiness.guards).toContain("Custom-theme draft query-shape evidence only");
    expect(readiness.guards).toContain("profile_theme_id query-shape evidence only");
    expect(readiness.guards).toContain("No live profile-theme persistence");
    expect(readiness.guards).toContain("Browser-only default-skin reset only");
    expect(readiness.guards).toContain("No marketplace rollback claim");
    expect(readiness.guardCopy).toContain("Browser-only shell skins switch");
    expect(readiness.guardCopy).toContain("staged query-shape checks");
    expect(readiness.gates.find((gate) => gate.id === "app-shell-skin")?.status).toBe("warning");
    expect(readiness.gates.find((gate) => gate.id === "rollback")?.status).toBe("warning");
    expect(readiness.gates.find((gate) => gate.id === "custom-theme-exchange")?.status).toBe(
      "warning",
    );
  });

  it("blocks rollout when profile themes and design guard are absent", () => {
    const readiness = buildAppWideThemeReadiness({
      appShellSkinEvidence: null,
      customThemeImportExportReady: false,
      designSystemGuardReady: false,
      hostedCustomThemeDraftSyncReady: false,
      hostedShellSkinSyncReady: false,
      localProfileThemesReady: false,
      rollbackEvidence: null,
    });

    expect(readiness.blockedCount).toBe(7);
    expect(readiness.nextAction).toBe(
      "Restore local profile theme presets before app-wide skin work.",
    );
  });

  it("keeps shell rollout capabilities in review even when evidence exists", () => {
    const readiness = buildAppWideThemeReadiness({
      appShellSkinEvidence: {
        activeSkinId: "teal-print",
        activeSkinName: "Teal Print",
        availableSkinCount: 3,
        scope: "browser-local",
        storageKey: "og-launcher:app-shell-skin:v1",
        surfaces: ["header", "navigation", "main shell"],
      },
      customThemeImportExportReady: true,
      designSystemGuardReady: true,
      hostedCustomThemeDraftSyncReady: true,
      hostedShellSkinSyncReady: true,
      localProfileThemesReady: true,
      rollbackEvidence: {
        defaultSkinId: "retro-paper",
        defaultSkinName: "Retro Paper",
        invalidSkinFallback: true,
        resetTarget: "browser-local-default",
        storageKey: "og-launcher:app-shell-skin:v1",
      },
    });

    expect(readiness.blockedCount).toBe(0);
    expect(readiness.readyCount).toBe(3);
    expect(readiness.warningCount).toBe(4);
    expect(readiness.statusLabel).toBe("Needs staging");
    expect(readiness.gates.find((gate) => gate.id === "app-shell-skin")?.status).toBe("warning");
  });
});
