// @vitest-environment node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function workspacePath(path: string) {
  return resolve(`../${path}`);
}

function read(path: string) {
  return readFileSync(workspacePath(path), "utf8");
}

describe("achievement popup removal boundary", () => {
  it("keeps active frontend and native code free of achievement popups", () => {
    expect(
      existsSync(workspacePath("launcher/src/components/achievements/AchievementPopupLayer.tsx")),
    ).toBe(false);
    expect(
      existsSync(
        workspacePath("launcher/src/components/achievements/AchievementPopupLayer.test.tsx"),
      ),
    ).toBe(false);

    const activeSources = [
      "launcher/src/app/App.tsx",
      "launcher/src/pages/OverlayPage.tsx",
      "launcher/src/hooks/library/useAchievementAutoSync.ts",
      "launcher/src/lib/overlay.ts",
      "launcher/src/lib/types/overlay.ts",
      "launcher/src-tauri/src/commands/overlay.rs",
      "launcher/src-tauri/src/lib.rs",
    ]
      .map(read)
      .join("\n");

    expect(activeSources).not.toMatch(
      /AchievementPopup|emitAchievementPopup|useAchievementPopup|emit_achievement_popup|achievement-unlocked/i,
    );
  });
});
