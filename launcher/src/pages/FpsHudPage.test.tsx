import { render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke, isTauri } from "@tauri-apps/api/core";

import { FpsHudPage, FRAME_REPORT_INTERVAL_MS } from "./FpsHudPage";
import { writeActivePerformanceGameContext } from "../lib/performance-context";
import { ACTIVE_GAME_PERFORMANCE_POLL_INTERVAL_MS } from "../lib/performance-polling";
import type { NativeOverlaySettings } from "../lib/types/overlay";
import type { RealtimeMetrics } from "../lib/types/performance";

const eventMocks = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
}));

const windowMocks = vi.hoisted(() => ({
  close: vi.fn(),
  currentLabel: "fps_hud",
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, handler: (event: { payload: unknown }) => void) => {
    eventMocks.listeners.set(event, handler);
    return Promise.resolve(vi.fn());
  }),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    label: windowMocks.currentLabel,
    close: windowMocks.close,
  })),
}));

const metrics: RealtimeMetrics = {
  cpuPercent: 28,
  fps: 61,
  frameTimeMs: 16.4,
  fpsSource: "hud_webview",
  gpuPercent: 42,
  gpuTempC: 64,
  gpuVramMb: 4096,
  ramMb: 2048,
  uptime: "00:10:00",
};

function pollCallCount() {
  return vi.mocked(invoke).mock.calls.filter(([command]) => command === "poll_performance_metrics")
    .length;
}

function frameReportCalls() {
  return vi.mocked(invoke).mock.calls.filter(([command]) => command === "report_frame_rendered");
}

describe("FpsHudPage performance polling", () => {
  beforeEach(() => {
    window.localStorage.clear();
    eventMocks.listeners.clear();
    windowMocks.currentLabel = "fps_hud";
    windowMocks.close.mockReset().mockResolvedValue(undefined);
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation((command) =>
      Promise.resolve(
        command === "get_overlay_settings"
          ? { fpsHudEnabled: true, opacity: 0.72, showGpu: false }
          : metrics,
      ),
    );
    vi.mocked(isTauri).mockReturnValue(true);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("polls active game metrics at 1Hz", async () => {
    vi.useFakeTimers();
    writeActivePerformanceGameContext({
      gameId: "game-1",
      gameTitle: "Game 1",
      launcher: "steam",
    });

    render(<FpsHudPage />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("61 FPS")).toBeInTheDocument();
    expect(screen.getByText("HUD Webview")).toBeInTheDocument();
    expect(screen.queryByText("42% System GPU")).not.toBeInTheDocument();
    expect(screen.getByText("61 FPS").parentElement).toHaveStyle({ opacity: "0.72" });
    expect(pollCallCount()).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(ACTIVE_GAME_PERFORMANCE_POLL_INTERVAL_MS - 1);
      await Promise.resolve();
    });
    expect(pollCallCount()).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(pollCallCount()).toBe(2);
  });

  it("batches rendered frames into one native IPC report per second", async () => {
    let frameCallback: FrameRequestCallback | undefined;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frameCallback = callback;
        return 1;
      }),
    );
    writeActivePerformanceGameContext({
      gameId: "game-1",
      gameTitle: "Game 1",
      launcher: "steam",
    });

    render(<FpsHudPage />);
    await act(async () => Promise.resolve());

    act(() => frameCallback?.(0));
    for (let frame = 1; frame < 60; frame += 1) {
      act(() => frameCallback?.((FRAME_REPORT_INTERVAL_MS * frame) / 60));
    }
    expect(frameReportCalls()).toHaveLength(0);

    act(() => frameCallback?.(FRAME_REPORT_INTERVAL_MS));
    expect(frameReportCalls()).toEqual([
      ["report_frame_rendered", { elapsedMs: FRAME_REPORT_INTERVAL_MS, frameCount: 60 }],
    ]);
  });

  it("does not poll native metrics without active game context", async () => {
    vi.useFakeTimers();

    render(<FpsHudPage />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Browser Preview")).toBeInTheDocument();
    expect(pollCallCount()).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    expect(pollCallCount()).toBe(0);
  });

  it("closes and clears the external HUD when settings disable it", async () => {
    vi.useFakeTimers();
    writeActivePerformanceGameContext({
      gameId: "game-1",
      gameTitle: "Game 1",
      launcher: "steam",
    });

    render(<FpsHudPage />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("61 FPS")).toBeInTheDocument();
    const pollCountBeforeDisable = pollCallCount();

    const settingsListener = eventMocks.listeners.get("overlay-settings-updated") as
      ((event: { payload: NativeOverlaySettings }) => void) | undefined;
    expect(settingsListener).toBeDefined();
    act(() => {
      settingsListener?.({ payload: { fpsHudEnabled: false } });
    });

    expect(windowMocks.close).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("61 FPS")).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(ACTIVE_GAME_PERFORMANCE_POLL_INTERVAL_MS * 2);
      await Promise.resolve();
    });
    expect(pollCallCount()).toBe(pollCountBeforeDisable);
  });

  it("stays blank without closing the launcher when the route is not the external HUD", async () => {
    windowMocks.currentLabel = "main";
    vi.mocked(invoke).mockImplementation((command) =>
      Promise.resolve(command === "get_overlay_settings" ? { fpsHudEnabled: false } : metrics),
    );

    const { container } = render(<FpsHudPage />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(windowMocks.close).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
    expect(pollCallCount()).toBe(0);
  });
});
