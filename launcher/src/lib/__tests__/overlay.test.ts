import { act, createElement } from "react";
import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mocks.listen,
}));

describe("overlay desktop commands", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.invoke.mockReset();
    mocks.isTauri.mockReset().mockReturnValue(true);
    mocks.listen.mockReset().mockResolvedValue(vi.fn());
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

  it("controls click-through only on the external overlay window command", async () => {
    mocks.invoke.mockResolvedValue(undefined);

    const { setInGameOverlayClickThrough } = await import("../overlay");
    await setInGameOverlayClickThrough(true);

    expect(mocks.invoke).toHaveBeenCalledWith("set_in_game_overlay_click_through", {
      enabled: true,
    });
  });

  it("cleans up a delayed overlay listener after the hook has already unmounted", async () => {
    let resolveListen: ((cleanup: () => void) => void) | undefined;
    const cleanup = vi.fn();
    mocks.listen.mockImplementation(
      () =>
        new Promise<() => void>((resolve) => {
          resolveListen = resolve;
        }),
    );
    const { useOverlayHotkey } = await import("../overlay");
    function Harness() {
      useOverlayHotkey();
      return null;
    }

    const view = render(createElement(Harness));
    view.unmount();
    await act(async () => {
      resolveListen?.(cleanup);
      await Promise.resolve();
    });

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("does not invoke the native FPS HUD command from a browser preview", async () => {
    mocks.isTauri.mockReturnValue(false);
    const { useFpsHudHotkey } = await import("../overlay");
    function Harness() {
      useFpsHudHotkey();
      return null;
    }

    const view = render(createElement(Harness));
    fireEvent.keyDown(window, { altKey: true, key: "F12" });

    expect(mocks.invoke).not.toHaveBeenCalled();
    view.unmount();
  });
});
