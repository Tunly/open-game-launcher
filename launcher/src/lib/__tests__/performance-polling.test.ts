import { describe, expect, it } from "vitest";

import {
  ACTIVE_GAME_PERFORMANCE_POLL_INTERVAL_MS,
  shouldPollPerformanceMetrics,
} from "../performance-polling";
import type { PerformanceAttribution } from "../performance-context";

const activeAttribution: PerformanceAttribution = {
  detail: "Library launch context",
  gameId: "game-1",
  isFallback: false,
  kind: "active-game",
  label: "Game 1",
};

const idleAttribution: PerformanceAttribution = {
  detail: "Standalone overlay session without active library launch context",
  gameId: "overlay-runtime",
  isFallback: true,
  kind: "standalone-overlay",
  label: "Standalone Overlay",
};

describe("performance polling contract", () => {
  it("uses 1Hz polling only for active game attribution", () => {
    expect(ACTIVE_GAME_PERFORMANCE_POLL_INTERVAL_MS).toBe(1_000);
    expect(shouldPollPerformanceMetrics(activeAttribution)).toBe(true);
    expect(shouldPollPerformanceMetrics(idleAttribution)).toBe(false);
  });
});
