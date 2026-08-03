import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveWindowView, syncWindowRuntimeClass } from "./window-bootstrap";

const getCurrentWebviewWindowMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: getCurrentWebviewWindowMock,
}));

afterEach(() => {
  getCurrentWebviewWindowMock.mockReset();
  window.history.replaceState({}, "", "/");
  document.documentElement.classList.remove("floating-overlay-runtime");
  document.body.classList.remove("floating-overlay-runtime");
});

describe("window bootstrap", () => {
  it("uses the native Tauri label before the browser location", async () => {
    getCurrentWebviewWindowMock.mockReturnValue({ label: "fps_hud" });
    window.history.replaceState({}, "", "/library?view=overlay");

    expect(await resolveWindowView()).toBe("fps-hud");
  });

  it("falls back to location routing in browser previews", async () => {
    getCurrentWebviewWindowMock.mockImplementation(() => {
      throw new Error("not running in Tauri");
    });
    window.history.replaceState({}, "", "/overlay");

    expect(await resolveWindowView()).toBe("overlay");
  });

  it("marks only floating windows with the runtime class", () => {
    syncWindowRuntimeClass("overlay");
    expect(document.body).toHaveClass("floating-overlay-runtime");

    syncWindowRuntimeClass("main");
    expect(document.body).not.toHaveClass("floating-overlay-runtime");
  });
});
