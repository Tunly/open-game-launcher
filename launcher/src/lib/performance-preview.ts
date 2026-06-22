import type { RealtimeMetrics } from "./types/performance";

function formatPreviewUptime(totalSeconds: number) {
  const secondsValue = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(secondsValue / 60);
  const seconds = secondsValue % 60;

  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function createBrowserPreviewMetrics(elapsedSeconds: number): RealtimeMetrics {
  const seconds = Math.max(0, Math.floor(elapsedSeconds));
  const pulse = Math.sin(seconds / 5);

  return {
    cpuPercent: 42 + pulse * 8,
    ramMb: 4096 + Math.max(0, pulse) * 512,
    gpuPercent: 48 + Math.cos(seconds / 7) * 10,
    gpuVramMb: 6144,
    gpuTempC: 64 + Math.max(0, pulse) * 4,
    fps: 60 + Math.cos(seconds / 4) * 6,
    frameTimeMs: 16.7 + Math.max(0, -pulse) * 2,
    uptime: formatPreviewUptime(seconds),
  };
}
