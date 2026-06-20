import type { PerformanceAttribution } from "./performance-context";

export const ACTIVE_GAME_PERFORMANCE_POLL_INTERVAL_MS = 1_000;

export function shouldPollPerformanceMetrics(attribution: PerformanceAttribution) {
  return attribution.kind === "active-game";
}
