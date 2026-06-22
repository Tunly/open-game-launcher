import { describe, expect, it } from "vitest";

import {
  APP_SHELL_SKINS,
  APP_SHELL_SKIN_STORAGE_KEY,
  buildAppShellSkinReadinessEvidence,
  buildAppShellSkinRollbackEvidence,
  readAppShellSkinId,
  resetAppShellSkin,
  resolveAppShellSkinId,
  writeAppShellSkinId,
} from "../app-shell-skins";

describe("app shell skins", () => {
  it("falls back to the Retro Manga paper shell for unknown values", () => {
    expect(resolveAppShellSkinId("unknown")).toBe("retro-paper");
    expect(readAppShellSkinId()).toBe("retro-paper");
  });

  it("stores only built-in browser-local shell skin ids", () => {
    expect(writeAppShellSkinId("teal-print")).toBe("teal-print");
    expect(window.localStorage.getItem(APP_SHELL_SKIN_STORAGE_KEY)).toBe("teal-print");
    expect(readAppShellSkinId()).toBe("teal-print");

    expect(writeAppShellSkinId("url(javascript:bad)")).toBe("retro-paper");
    expect(window.localStorage.getItem(APP_SHELL_SKIN_STORAGE_KEY)).toBe("retro-paper");
  });

  it("builds readiness evidence without hosted or marketplace claims", () => {
    const evidence = buildAppShellSkinReadinessEvidence("redline-print");

    expect(evidence).toMatchObject({
      activeSkinId: "redline-print",
      activeSkinName: "Redline Print",
      availableSkinCount: APP_SHELL_SKINS.length,
      scope: "browser-local",
      storageKey: APP_SHELL_SKIN_STORAGE_KEY,
    });
    expect(evidence.surfaces).toEqual(["header", "navigation", "main shell"]);
  });

  it("resets to the browser-local default skin and exposes rollback evidence", () => {
    writeAppShellSkinId("teal-print");

    expect(resetAppShellSkin()).toBe("retro-paper");
    expect(window.localStorage.getItem(APP_SHELL_SKIN_STORAGE_KEY)).toBe("retro-paper");
    expect(buildAppShellSkinRollbackEvidence()).toMatchObject({
      defaultSkinId: "retro-paper",
      defaultSkinName: "Retro Paper",
      invalidSkinFallback: true,
      resetTarget: "browser-local-default",
      storageKey: APP_SHELL_SKIN_STORAGE_KEY,
    });
  });
});
