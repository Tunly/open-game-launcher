import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  isTauri: vi.fn(() => true),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

describe("overlay desktop commands", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.invoke.mockReset();
  });

  it("loads native overlay settings through Tauri", async () => {
    mocks.invoke.mockResolvedValue({
      hotkey: "Control+Shift+F9",
      opacity: 0.72,
      position: "top_left",
    });

    const { getOverlaySettings } = await import("../overlay");
    const result = await getOverlaySettings();

    expect(mocks.invoke).toHaveBeenCalledWith("get_overlay_settings");
    expect(result).toEqual({
      hotkey: "Control+Shift+F9",
      opacity: 0.72,
      position: "top_left",
    });
  });

  it("saves native overlay settings with the expected payload", async () => {
    const settings = {
      hotkey: "Alt+F10",
      opacity: 0.8,
      position: "bottom_left" as const,
    };
    mocks.invoke.mockResolvedValue(settings);

    const { saveOverlaySettings } = await import("../overlay");
    const result = await saveOverlaySettings(settings);

    expect(mocks.invoke).toHaveBeenCalledWith("save_overlay_settings", { settings });
    expect(result).toEqual(settings);
  });
});
