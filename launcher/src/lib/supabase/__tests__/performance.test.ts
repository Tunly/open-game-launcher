import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const from = vi.fn();
  const authGetUser = vi.fn();
  return { authGetUser, from };
});

vi.mock("../client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: mocks.authGetUser,
    },
    from: mocks.from,
  }),
  getCurrentSessionUserId: async () => {
    const result = await mocks.authGetUser();
    return result.data.user?.id ?? null;
  },
  isSupabaseConfigured: true,
}));

describe("performance supabase helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.from.mockReset();
    mocks.authGetUser.mockReset();
    mocks.authGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("saves a performance snapshot scoped to the current user", async () => {
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    mocks.from.mockReturnValue({ insert });

    const { savePerformanceSnapshot } = await import("../performance");
    const saved = await savePerformanceSnapshot({
      cpuPercent: 42,
      fps: 60,
      frameTimeMs: 16.7,
      gameId: "overlay-runtime",
      gpuPercent: 55,
      ramMb: 8192,
    });

    expect(saved).toBe(true);
    expect(mocks.from).toHaveBeenCalledWith("performance_snapshots");
    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      game_id: "overlay-runtime",
      cpu_percent: 42,
      ram_mb: 8192,
      gpu_percent: 55,
      gpu_temp_c: null,
      fps: 60,
      frame_time_ms: 16.7,
      disk_read_mbps: 0,
      disk_write_mbps: 0,
      network_up_kbps: 0,
      network_down_kbps: 0,
      duration_seconds: null,
    });
  });

  it("saves a metrics snapshot with standalone overlay fallback attribution", async () => {
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    mocks.from.mockReturnValue({ insert });

    const { savePerformanceSnapshotFromMetrics } = await import("../performance");
    const saved = await savePerformanceSnapshotFromMetrics({
      cpuPercent: 42,
      fps: 60,
      frameTimeMs: 16.7,
      fpsSource: "hud_webview",
      gpuPercent: 55,
      gpuTempC: null,
      gpuVramMb: null,
      ramMb: 8192,
      uptime: "00:00:02",
    });

    expect(saved).toBe(true);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        fps: null,
        frame_time_ms: null,
        game_id: "overlay-runtime",
      }),
    );
  });

  it("lists snapshots with range filtering and maps db rows", async () => {
    const rows = [
      {
        id: "snapshot-1",
        user_id: "user-1",
        game_id: "overlay-runtime",
        cpu_percent: 31,
        ram_mb: 4096,
        gpu_percent: null,
        gpu_temp_c: 62,
        fps: 72,
        frame_time_ms: 13.9,
        disk_read_mbps: 0,
        disk_write_mbps: 0,
        network_up_kbps: 0,
        network_down_kbps: 0,
        duration_seconds: 30,
        created_at: "2026-06-09T10:00:00.000Z",
      },
    ];
    const chain = makeListChain(rows);
    mocks.from.mockReturnValue(chain);

    const { listPerformanceSnapshots } = await import("../performance");
    const snapshots = await listPerformanceSnapshots({ range: "7d", limit: 25 });

    expect(chain.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(chain.gte).toHaveBeenCalledWith("created_at", expect.any(String));
    expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(25);
    expect(snapshots).toEqual([
      expect.objectContaining({
        id: "snapshot-1",
        userId: "user-1",
        gameId: "overlay-runtime",
        fps: 72,
        gpuVramMb: null,
        gpuTempC: 62,
      }),
    ]);
  });

  it("saves a performance session aggregate from the metrics buffer", async () => {
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    mocks.from.mockReturnValue({ insert });

    const { savePerformanceSession } = await import("../performance");
    const saved = await savePerformanceSession({
      gameId: "game-1",
      startedAt: "2026-06-09T10:00:00.000Z",
      endedAt: "2026-06-09T10:00:06.000Z",
      samples: [
        {
          cpuPercent: 40,
          fps: 50,
          frameTimeMs: 20,
          gpuPercent: 40,
          gpuTempC: 64,
          gpuVramMb: 2048,
          ramMb: 4096,
          uptime: "00:00:02",
        },
        {
          cpuPercent: 60,
          fps: 60,
          frameTimeMs: 16.7,
          gpuPercent: 50,
          gpuTempC: 65,
          gpuVramMb: 3072,
          ramMb: 6144,
          uptime: "00:00:04",
        },
      ],
    });

    expect(saved).toBe(true);
    expect(mocks.from).toHaveBeenCalledWith("performance_sessions");
    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      game_id: "game-1",
      sample_count: 2,
      started_at: "2026-06-09T10:00:00.000Z",
      ended_at: "2026-06-09T10:00:06.000Z",
      duration_seconds: 6,
      avg_cpu_percent: 50,
      max_cpu_percent: 60,
      avg_ram_mb: 5120,
      max_ram_mb: 6144,
      avg_fps: null,
      max_fps: null,
      avg_gpu_percent: 45,
      max_gpu_percent: 50,
    });
  });

  it("saves a performance session with standalone overlay fallback attribution", async () => {
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    mocks.from.mockReturnValue({ insert });

    const { savePerformanceSession } = await import("../performance");
    const saved = await savePerformanceSession({
      samples: [
        {
          cpuPercent: 40,
          fps: 50,
          frameTimeMs: 20,
          gpuPercent: null,
          gpuTempC: null,
          gpuVramMb: null,
          ramMb: 4096,
          uptime: "00:00:02",
        },
      ],
    });

    expect(saved).toBe(true);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ game_id: "overlay-runtime" }));
  });

  it("does not save a performance session when the buffer has no valid samples", async () => {
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    mocks.from.mockReturnValue({ insert });

    const { savePerformanceSession } = await import("../performance");
    const saved = await savePerformanceSession({
      samples: [],
      startedAt: "2026-06-09T10:00:00.000Z",
      endedAt: "2026-06-09T10:00:06.000Z",
    });

    expect(saved).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it("tolerates missing performance session schema", async () => {
    const insert = vi.fn(() =>
      Promise.resolve({ error: { code: "42P01", message: "relation does not exist" } }),
    );
    mocks.from.mockReturnValue({ insert });

    const { savePerformanceSession } = await import("../performance");
    const saved = await savePerformanceSession({
      samples: [
        {
          cpuPercent: 40,
          fps: 50,
          frameTimeMs: 20,
          gpuPercent: null,
          gpuTempC: null,
          gpuVramMb: null,
          ramMb: 4096,
          uptime: "00:00:02",
        },
      ],
    });

    expect(saved).toBe(false);
  });

  it("lists session aggregates with range filtering and maps db rows", async () => {
    const rows = [
      {
        id: "session-1",
        user_id: "user-1",
        game_id: "game-1",
        sample_count: 120,
        started_at: "2026-06-09T10:00:00.000Z",
        ended_at: "2026-06-09T10:04:00.000Z",
        duration_seconds: 240,
        avg_cpu_percent: 44,
        max_cpu_percent: 88,
        avg_ram_mb: 5000,
        max_ram_mb: 7000,
        avg_fps: 58,
        max_fps: 144,
        avg_gpu_percent: 61,
        max_gpu_percent: 92,
        created_at: "2026-06-09T10:04:01.000Z",
      },
    ];
    const chain = makeListChain(rows);
    mocks.from.mockReturnValue(chain);

    const { listPerformanceSessions } = await import("../performance");
    const sessions = await listPerformanceSessions({ range: "30d", limit: 10 });

    expect(mocks.from).toHaveBeenCalledWith("performance_sessions");
    expect(chain.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(chain.gte).toHaveBeenCalledWith("ended_at", expect.any(String));
    expect(chain.order).toHaveBeenCalledWith("ended_at", { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(10);
    expect(sessions).toEqual([
      expect.objectContaining({
        avgCpuPercent: 44,
        avgFps: 58,
        gameId: "game-1",
        maxGpuPercent: 92,
        sampleCount: 120,
      }),
    ]);
  });

  it("does not write when the current user is missing", async () => {
    mocks.authGetUser.mockResolvedValue({ data: { user: null } });
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    mocks.from.mockReturnValue({ insert });

    const { savePerformanceSnapshot } = await import("../performance");
    const saved = await savePerformanceSnapshot({
      cpuPercent: 42,
      gameId: "overlay-runtime",
      ramMb: 8192,
    });

    expect(saved).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
});

function makeListChain(rows: unknown[]) {
  const chain = {
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve({ data: rows, error: null })),
    order: vi.fn(() => chain),
    select: vi.fn(() => chain),
  };
  return chain;
}
