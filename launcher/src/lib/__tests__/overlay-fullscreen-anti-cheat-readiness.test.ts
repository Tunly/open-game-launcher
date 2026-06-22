import { describe, expect, it } from "vitest";

import {
  buildOverlayFullscreenAntiCheatReadiness,
  createVerifyOverlayFullscreenAntiCheatReadiness,
} from "../overlay-fullscreen-anti-cheat-readiness";

const falseOverlayFullscreenClaim =
  /\b(?:fullscreen\s*injection\s*(?:ready|verified|enabled|executed|complete|passed|active)|anti-cheat\s*bypass\s*(?:ready|verified|enabled|passed|complete|active)|kernel\/?driver\s*install\s*(?:ready|verified|executed|complete|passed)|kernel\s*driver\s*(?:installed|loaded|ready|verified)|protected-?process\s*(?:attach|attached|access|read|write|hook|inject)\s*(?:ready|verified|executed|complete|passed|active|enabled)|game\s*capture\s*proof\s*(?:ready|verified|captured|passed|complete)|compatibility\s*certification\s*(?:ready|verified|passed|complete|certified)|live\s*title\s*validation\s*(?:ready|verified|passed|complete)|external\s*overlay\s*window\s*(?:opened|attached|verified|passed|complete|proof\s*ready)|overlay\s*e2e\s*(?:passed|ready|verified|complete|success)|real\s*game\s*process\s*(?:accessed|attached|validated|captured|ready|verified))\b/i;

describe("buildOverlayFullscreenAntiCheatReadiness", () => {
  it("creates a local-only fullscreen anti-cheat research packet", () => {
    const readiness = createVerifyOverlayFullscreenAntiCheatReadiness();

    expect(readiness.statusLabel).toBe("Research only");
    expect(readiness.reviewCount).toBe(3);
    expect(readiness.blockedCount).toBe(7);
    expect(readiness.guards).toContain("Local research packet only");
    expect(readiness.guards).toContain("No fullscreen injection");
    expect(readiness.guards).toContain("No anti-cheat bypass");
    expect(readiness.guards).toContain("No kernel/driver install");
    expect(readiness.guards).toContain("No protected-process attach");
    expect(readiness.guards).toContain("No game capture proof");
    expect(readiness.guards).toContain("No compatibility certification");
    expect(readiness.guards).toContain("No live title validation");
    expect(readiness.guards).toContain("No external overlay window proof");
    expect(readiness.guards).toContain("No E2E success claim");
    expect(readiness.guards).toContain("No real game process access");
    expect(readiness.guardCopy).toContain("local research packet only");
    expect(JSON.stringify(readiness)).not.toMatch(falseOverlayFullscreenClaim);
  });

  it("flags positive fullscreen and anti-cheat claims", () => {
    const falseClaims = [
      "fullscreen injection ready",
      "anti-cheat bypass verified",
      "kernel driver installed",
      "protected-process attached complete",
      "game capture proof verified",
      "compatibility certification passed",
      "live title validation complete",
      "external overlay window opened",
      "overlay E2E success",
      "real game process accessed",
    ];

    for (const claim of falseClaims) {
      expect(claim).toMatch(falseOverlayFullscreenClaim);
    }
  });

  it("blocks every lane when local research evidence is absent", () => {
    const readiness = buildOverlayFullscreenAntiCheatReadiness({
      antiCheatFallbackDeckReady: false,
      compatibilityCertificationReady: false,
      desktopOverlaySettingsReady: false,
      externalOverlayWindowProofReady: false,
      fullscreenInjectionStaged: false,
      fullscreenModeInventoryReady: false,
      gameCaptureProofReady: false,
      kernelDriverInstallStaged: false,
      liveTitleValidationReady: false,
      protectedProcessAttachStaged: false,
    });

    expect(readiness.reviewCount).toBe(0);
    expect(readiness.blockedCount).toBe(10);
    expect(readiness.lanes.every((lane) => lane.status === "blocked")).toBe(true);
    expect(JSON.stringify(readiness)).not.toMatch(falseOverlayFullscreenClaim);
  });
});
