import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => tauriMocks);

import { completeDesktopStartup, reportDesktopStartupProgress } from "./startup-window";

describe("completeDesktopStartup", () => {
  beforeEach(() => {
    tauriMocks.invoke.mockReset();
    tauriMocks.isTauri.mockReset();
  });

  it("does nothing in the browser preview", async () => {
    tauriMocks.isTauri.mockReturnValue(false);

    await expect(completeDesktopStartup()).resolves.toBe(false);
    expect(tauriMocks.invoke).not.toHaveBeenCalled();
  });

  it("hands a rendered desktop app over to the native main window", async () => {
    tauriMocks.isTauri.mockReturnValue(true);
    tauriMocks.invoke.mockResolvedValue(undefined);

    await expect(completeDesktopStartup()).resolves.toBe(true);
    expect(tauriMocks.invoke).toHaveBeenCalledOnce();
    expect(tauriMocks.invoke).toHaveBeenCalledWith("complete_startup");
  });
});

describe("reportDesktopStartupProgress", () => {
  beforeEach(() => {
    tauriMocks.invoke.mockReset();
    tauriMocks.isTauri.mockReset();
  });

  it("does nothing in the browser preview", async () => {
    tauriMocks.isTauri.mockReturnValue(false);

    await expect(reportDesktopStartupProgress(0.5, "Test")).resolves.toBe(false);
    expect(tauriMocks.invoke).not.toHaveBeenCalled();
  });

  it("reports the milestone to the backend", async () => {
    tauriMocks.isTauri.mockReturnValue(true);
    tauriMocks.invoke.mockResolvedValue(undefined);

    await expect(reportDesktopStartupProgress(0.45, "Loading modules")).resolves.toBe(true);
    expect(tauriMocks.invoke).toHaveBeenCalledOnce();
    expect(tauriMocks.invoke).toHaveBeenCalledWith("report_startup_progress", {
      progress: 0.45,
      label: "Loading modules",
    });
  });
});
