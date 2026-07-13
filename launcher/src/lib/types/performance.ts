export interface PerformanceSnapshot {
  id: string;
  userId: string;
  gameId: string;
  cpuPercent: number;
  ramMb: number;
  gpuPercent: number | null;
  gpuVramMb: number | null;
  gpuTempC: number | null;
  fps: number | null;
  frameTimeMs: number | null;
  diskReadMbps: number;
  diskWriteMbps: number;
  networkUpKbps: number;
  networkDownKbps: number;
  durationSeconds: number | null;
  createdAt: string;
}

export interface PerformanceSession {
  id: string;
  userId: string;
  gameId: string;
  sampleCount: number;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  avgCpuPercent: number;
  maxCpuPercent: number;
  avgRamMb: number;
  maxRamMb: number;
  avgFps: number | null;
  maxFps: number | null;
  avgGpuPercent: number | null;
  maxGpuPercent: number | null;
  createdAt: string;
}

export type PerformanceHistoryRange = "1d" | "7d" | "30d" | "365d" | "all";

export interface PerformanceSnapshotInput {
  gameId: string;
  cpuPercent: number;
  ramMb: number;
  gpuPercent?: number | null;
  gpuTempC?: number | null;
  fps?: number | null;
  frameTimeMs?: number | null;
  diskReadMbps?: number;
  diskWriteMbps?: number;
  networkUpKbps?: number;
  networkDownKbps?: number;
  durationSeconds?: number | null;
  createdAt?: string;
}

export interface ListPerformanceSnapshotsOptions {
  range?: PerformanceHistoryRange;
  gameId?: string;
  limit?: number;
}

export interface PerformanceSessionInput {
  gameId?: string;
  samples: RealtimeMetrics[];
  startedAt?: Date | number | string;
  endedAt?: Date | number | string;
}

export interface ListPerformanceSessionsOptions {
  range?: PerformanceHistoryRange;
  gameId?: string;
  limit?: number;
}

export interface RealtimeMetrics {
  cpuPercent: number;
  ramMb: number;
  gpuPercent: number | null;
  gpuVramMb: number | null;
  gpuTempC: number | null;
  fps: number;
  frameTimeMs: number;
  /** Rendering rate of the launcher HUD webview, not FPS from the active game process. */
  fpsSource?: "hud_webview";
  uptime: string;
}
