export interface PerformanceSnapshot {
  id: string; userId: string; gameId: string;
  cpuPercent: number; ramMb: number;
  gpuPercent: number | null; gpuVramMb: number | null; gpuTempC: number | null;
  fps: number | null; frameTimeMs: number | null;
  diskReadMbps: number; diskWriteMbps: number;
  networkUpKbps: number; networkDownKbps: number;
  durationSeconds: number | null; createdAt: string;
}

export interface RealtimeMetrics {
  cpuPercent: number; ramMb: number;
  gpuPercent: number | null; gpuVramMb: number | null; gpuTempC: number | null;
  fps: number; frameTimeMs: number; uptime: string;
}
