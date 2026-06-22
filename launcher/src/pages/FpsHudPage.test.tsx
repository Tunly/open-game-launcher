import { render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke, isTauri } from "@tauri-apps/api/core";

import { FpsHudPage } from "./FpsHudPage";
import { writeActivePerformanceGameContext } from "../lib/performance-context";
import { ACTIVE_GAME_PERFORMANCE_POLL_INTERVAL_MS } from "../lib/performance-polling";
import type { RealtimeMetrics } from "../lib/types/performance";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}));

const metrics: RealtimeMetrics = {
  cpuPercent: 28,
  fps: 61,
  frameTimeMs: 16.4,
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

describe("FpsHudPage performance polling", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue(metrics);
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
});
