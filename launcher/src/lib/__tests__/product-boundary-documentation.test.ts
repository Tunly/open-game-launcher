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
    expect(featurePlan).toContain("## Detaillierte Feature-Tracks");
    expect(featurePlan).not.toMatch(/~\d+%/);
    expect(featurePlan).not.toContain("In-Game Overlay vollständig");
  });

  it("keeps the overlay external and documents telemetry limits", () => {
    expect(featurePlan).toContain(
      "Es gibt keine Game-Process-Injection und sie ist kein Produktziel.",
    );
    expect(featurePlan).toContain("HUD-Webview-Proxy");
    expect(featurePlan).toContain("CPU-Prozentwerte");
    expect(featurePlan).not.toContain("echter injected Fullscreen-Overlay");
    expect(featurePlan).not.toContain("Fullscreen-Injection-/Anti-Cheat-/Protected-Title-Evidence");
    expect(readme).toContain("Separate transparent always-on-top Tauri window");
  });

  it("documents first-party Cloud Saves as removed instead of a completion target", () => {
    expect(featurePlan).toContain("## 5. First-party Cloud Saves (entfernt)");
    expect(featurePlan).toContain("keinen eigenen Cloud-Save-Dienst mehr an");
    expect(featurePlan).not.toContain("prove_cross_store_save_supabase_keychain_staging");
    expect(readme).toContain("First-party cloud-save sync commands were removed");
    expect(readme).not.toContain("Cloud Saves panel as local suggestions");
  });

  it("does not advertise retired screenshot or controller products", () => {
    const activeDocs = [readme, featurePlan, changelog, prBody].join("\n");

    expect(activeDocs).not.toMatch(
      /capture_screenshot|BitBlt|public screenshot feed|screenshot upload|screenshot likes?|Steam Input/i,
    );
    expect(featurePlan).toContain("20260709140000_remove_controller_support.sql");
    expect(featurePlan).toContain("20260710140000_remove_screenshot_support.sql");
  });
});
