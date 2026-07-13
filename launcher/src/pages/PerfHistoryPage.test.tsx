import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listPerformanceSessions, listPerformanceSnapshots } from "../lib/supabase/performance";
import { PerfHistoryPage } from "./PerfHistoryPage";

const useCurrentUserMock = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: useCurrentUserMock,
}));

vi.mock("../lib/supabase/performance", () => ({
  listPerformanceSessions: vi.fn(),
  listPerformanceSnapshots: vi.fn(),
}));

const snapshot = {
  cpuPercent: 42,
  createdAt: "2026-06-09T10:00:00.000Z",
  diskReadMbps: 0,
  diskWriteMbps: 0,
  durationSeconds: 120,
  fps: 60,
  frameTimeMs: 16.7,
  gameId: "game-1",
  gpuPercent: 55,
  gpuTempC: null,
  gpuVramMb: null,
  id: "snapshot-1",
  networkDownKbps: 0,
  networkUpKbps: 0,
  ramMb: 8192,
  userId: "user-1",
};

const session = {
  avgCpuPercent: 40,
  avgFps: 58,
  avgGpuPercent: 52,
  avgRamMb: 8000,
  createdAt: "2026-06-09T11:00:00.000Z",
  durationSeconds: 1800,
  endedAt: "2026-06-09T11:00:00.000Z",
  gameId: "game-1",
  id: "session-1",
  maxCpuPercent: 65,
  maxFps: 72,
  maxGpuPercent: 70,
  maxRamMb: 9000,
  sampleCount: 12,
  startedAt: "2026-06-09T10:30:00.000Z",
  userId: "user-1",
};

function renderPerfHistoryRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<PerfHistoryPage />} path="/settings/performance" />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PerfHistoryPage activity cross-filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCurrentUserMock.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      session: { user: { id: "user-1" } },
      user: { id: "user-1" },
    });
    vi.mocked(listPerformanceSnapshots).mockResolvedValue([snapshot]);
    vi.mocked(listPerformanceSessions).mockResolvedValue([session]);
  });

  it("initializes range, bucket, and selected game from activity query params", async () => {
    const { container } = renderPerfHistoryRoute(
      "/settings/performance?range=30d&gameId=game-1&bucket=week&source=activity#playtime-detail",
    );

    await waitFor(() => {
      expect(listPerformanceSnapshots).toHaveBeenCalledWith({ limit: 720, range: "30d" });
      expect(listPerformanceSessions).toHaveBeenCalledWith({ limit: 320, range: "30d" });
    });

    await waitFor(() => {
      expect(container).toHaveTextContent("Activity Filter");
      expect(container).toHaveTextContent("game-1");
      expect(container).toHaveTextContent("Modus");
      expect(container).toHaveTextContent("Woche");
    });

    const [gameFilter] = Array.from(container.querySelectorAll("select"));
    expect(gameFilter).toHaveValue("game-1");

    const gameRow = Array.from(container.querySelectorAll("tr")).find((row) =>
      row.textContent?.includes("game-1"),
    );
    expect(gameRow).toHaveTextContent("60");
    expect(container).toHaveTextContent("Legacy HUD FPS");
    expect(container).toHaveTextContent("Capture Context");
    expect(container).toHaveTextContent("not game-process FPS");
  });

  it("renders local preview data without Supabase calls when Supabase is not configured", async () => {
    useCurrentUserMock.mockReturnValue({
      isConfigured: false,
      isLoading: false,
      session: null,
      user: null,
    });

    const { container } = renderPerfHistoryRoute("/settings/performance");

    await waitFor(() => {
      expect(container).toHaveTextContent("Browser Performance Relay");
      expect(container).toHaveTextContent("Local Performance Preview");
      expect(container).toHaveTextContent("Neon Runner");
    });

    expect(listPerformanceSnapshots).not.toHaveBeenCalled();
    expect(listPerformanceSessions).not.toHaveBeenCalled();
  });

  it("forces the local system-telemetry preview on its development verify route", async () => {
    const { container } = renderPerfHistoryRoute(
      "/settings/performance?verify=performance-system-telemetry",
    );

    await waitFor(() => {
      expect(container).toHaveTextContent("Local Performance Preview");
      expect(container).toHaveTextContent("Legacy HUD FPS");
      expect(container).toHaveTextContent("Capture Context");
      expect(container).toHaveTextContent("Development-only verification data");
      expect(container).toHaveTextContent("without Supabase reads, writes");
    });

    expect(listPerformanceSnapshots).not.toHaveBeenCalled();
    expect(listPerformanceSessions).not.toHaveBeenCalled();
  });

  it("renders overlay E2E readiness on the verify route without Supabase calls", async () => {
    useCurrentUserMock.mockReturnValue({
      isConfigured: false,
      isLoading: false,
      session: null,
      user: null,
    });

    const { container } = renderPerfHistoryRoute(
      "/settings/performance?verify=overlay-e2e-readiness",
    );

    await waitFor(() => {
      expect(container).toHaveTextContent("Overlay E2E Readiness");
      expect(container).toHaveTextContent("Overlay Runtime Attribution");
      expect(container).toHaveTextContent("No live overlay E2E");
      expect(container).toHaveTextContent("No Supabase write/read proof");
    });

    expect(listPerformanceSnapshots).not.toHaveBeenCalled();
    expect(listPerformanceSessions).not.toHaveBeenCalled();
  });

  it("renders overlay fullscreen anti-cheat readiness only on the verify route", async () => {
    useCurrentUserMock.mockReturnValue({
      isConfigured: false,
      isLoading: false,
      session: null,
      user: null,
    });

    const { container } = renderPerfHistoryRoute(
      "/settings/performance?verify=overlay-fullscreen-anti-cheat-readiness",
    );

    await waitFor(() => {
      expect(container).toHaveTextContent("Overlay Fullscreen / Anti-Cheat");
      expect(container).toHaveTextContent("Fullscreen mode inventory");
      expect(container).toHaveTextContent("No fullscreen injection");
      expect(container).toHaveTextContent("No anti-cheat bypass");
      expect(container).toHaveTextContent("No external overlay window proof");
      expect(container).not.toHaveTextContent("Overlay E2E Readiness");
    });

    expect(container).not.toHaveTextContent(
      /\b(?:fullscreen\s*injection\s*(?:ready|verified|enabled|executed|complete|passed|active)|anti-cheat\s*bypass\s*(?:ready|verified|enabled|passed|complete|active)|external\s*overlay\s*window\s*(?:opened|attached|verified|passed|complete|proof\s*ready)|overlay\s*e2e\s*(?:passed|ready|verified|complete|success)|real\s*game\s*process\s*(?:accessed|attached|validated|captured|ready|verified))\b/i,
    );
    expect(listPerformanceSnapshots).not.toHaveBeenCalled();
    expect(listPerformanceSessions).not.toHaveBeenCalled();
  });

  it("keeps an unmatched activity game filter visible instead of resetting to all games", async () => {
    const { container } = renderPerfHistoryRoute(
      "/settings/performance?range=7d&gameId=missing-game&bucket=auto&source=activity#playtime-detail",
    );

    await waitFor(() => {
      expect(container).toHaveTextContent("Activity Filter");
      expect(container).toHaveTextContent("missing-game");
      expect(container).toHaveTextContent("No Performance Rows For missing-game");
    });

    const [gameFilter] = Array.from(container.querySelectorAll("select"));
    expect(gameFilter).toHaveValue("missing-game");
  });
});
