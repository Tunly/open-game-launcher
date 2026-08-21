import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriMocks = vi.hoisted(() => ({
  isTauri: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => tauriMocks);

import { tauriLauncherUpdateAdapter } from "./launcher-update";

describe("tauriLauncherUpdateAdapter runtime support", () => {
  beforeEach(() => {
    tauriMocks.isTauri.mockReset();
  });

  it("rejects a browser preview before any updater API is loaded", () => {
    tauriMocks.isTauri.mockReturnValue(false);
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("Win32");

    expect(tauriLauncherUpdateAdapter.getRuntimeSupport()).toEqual({
      supported: false,
      reason: "Launcher-Updates sind nur in der installierten Desktop-App verfügbar.",
    });
  });

  it("allows any Tauri desktop runtime regardless of OS", () => {
    tauriMocks.isTauri.mockReturnValue(true);
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("Linux x86_64");
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Tauri/Linux");

    expect(tauriLauncherUpdateAdapter.getRuntimeSupport()).toEqual({
      supported: true,
      reason: null,
    });
  });

  it("allows the installed Windows Tauri runtime", () => {
    tauriMocks.isTauri.mockReturnValue(true);
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("Win32");

    expect(tauriLauncherUpdateAdapter.getRuntimeSupport()).toEqual({
      supported: true,
      reason: null,
    });
  });
});
