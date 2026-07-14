// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const featurePlan = readFileSync(resolve("../FEATURE_PLAN.md"), "utf8");
const readme = readFileSync(resolve("../README.md"), "utf8");
const changelog = readFileSync(resolve("../CHANGELOG.md"), "utf8");
const prBody = readFileSync(resolve("../PR_BODY.md"), "utf8");

describe("product boundary documentation", () => {
  it("uses qualitative audited status instead of legacy completion percentages", () => {
    expect(featurePlan).toContain("## Auditierter Produktstand");
    expect(featurePlan).toContain("## Aktive Arbeitspakete");
    expect(featurePlan).toContain("## Bewusst außerhalb des Produkts");
    expect(featurePlan).not.toMatch(/~\d+%/);
    expect(featurePlan).not.toContain("In-Game Overlay vollständig");
  });

  it("keeps the overlay external and documents telemetry limits", () => {
    expect(featurePlan).toContain("Game-Process-Injection");
    expect(featurePlan).toContain("HUD-FPS bleibt als Webview-Proxy");
    expect(featurePlan).toContain("CPU-Prozentwerte");
    expect(featurePlan).not.toContain("echter injected Fullscreen-Overlay");
    expect(featurePlan).not.toContain("Fullscreen-Injection-/Anti-Cheat-/Protected-Title-Evidence");
    expect(readme).toContain("The overlay is a separate Tauri window.");
    expect(readme).toContain("It does not inject into games");
  });

  it("documents first-party Cloud Saves as removed instead of a completion target", () => {
    expect(featurePlan).toContain("First-party Cloud Saves");
    expect(featurePlan).toContain("First-party Cloud Saves und launcher-eigene Save-Archive");
    expect(featurePlan).toContain("keinen eigenen Cloud-Save-Dienst mehr an");
    expect(featurePlan).not.toContain("prove_cross_store_save_supabase_keychain_staging");
    expect(readme).toContain("Provider clients own first-party cloud saves.");
    expect(readme).toContain("not hosted cloud storage");
    expect(readme).not.toContain("Cloud Saves panel as local suggestions");
  });

  it("does not advertise retired screenshot or controller products", () => {
    const activeDocs = [readme, featurePlan, changelog, prBody].join("\n");

    expect(activeDocs).not.toMatch(
      /capture_screenshot|BitBlt|public screenshot feed|screenshot upload|screenshot likes?|Steam Input/i,
    );
    expect(featurePlan).toContain("Controller-Support");
    expect(featurePlan).toContain("Screenshot-Capture und Screenshot-Galerie");
    expect(featurePlan).toContain("Removal-Migrationen");
  });
});
