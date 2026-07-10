// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const featurePlan = readFileSync(resolve("../FEATURE_PLAN.md"), "utf8");
const readme = readFileSync(resolve("../README.md"), "utf8");
const changelog = readFileSync(resolve("../CHANGELOG.md"), "utf8");
const prBody = readFileSync(resolve("../PR_BODY.md"), "utf8");

describe("product boundary documentation", () => {
  it("keeps the overlay external and excludes injection from the product target", () => {
    const overlayRow = featurePlan
      .split("\n")
      .find((line) => line.startsWith("| 3") && line.includes("In-Game Overlay"));

    expect(overlayRow).toContain("Separates transparentes Always-on-top-Tauri-Fenster");
    expect(overlayRow).toContain("Injection bleibt außerhalb des Scopes");
    expect(featurePlan).toContain(
      "Es gibt keine Game-Process-Injection und sie ist kein Produktziel.",
    );
    expect(featurePlan).not.toContain("echter injected Fullscreen-Overlay");
    expect(featurePlan).not.toContain("Fullscreen-Injection-/Anti-Cheat-/Protected-Title-Evidence");
    expect(readme).toContain("Separate transparent always-on-top Tauri window");
  });

  it("documents first-party Cloud Saves as removed instead of nearly complete", () => {
    const cloudSaveRow = featurePlan
      .split("\n")
      .find((line) => line.startsWith("| 5") && line.includes("First-party Cloud Saves"));

    expect(cloudSaveRow).toContain("Entfernt (kein Completion-Ziel)");
    expect(cloudSaveRow).not.toContain("~99%");
    expect(featurePlan).not.toContain("prove_cross_store_save_supabase_keychain_staging");
    expect(readme).toContain("First-party cloud-save sync commands were removed");
    expect(readme).not.toContain("Cloud Saves panel as local suggestions");
  });

  it("does not advertise retired screenshot or controller products", () => {
    const activeDocs = [readme, featurePlan, changelog, prBody].join("\n");

    expect(activeDocs).not.toMatch(
      /capture_screenshot|BitBlt|public screenshot feed|screenshot upload|screenshot likes?|Gyro|Haptik|Haptics|Steam Input/i,
    );
  });
});
