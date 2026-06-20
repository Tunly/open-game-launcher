import { describe, expect, it, vi } from "vitest";

import {
  PERFORMANCE_SESSION_BUFFER_LIMIT,
  PERFORMANCE_SESSION_FLUSH_EVENT,
  appendPerformanceSessionSample,
  createOverlaySessionFlushLocalProof,
  requestPerformanceSessionFlush,
} from "../performance-session-flush-contract";
import type { RealtimeMetrics } from "../types/performance";

function metric(sample: number): RealtimeMetrics {
  return {
    cpuPercent: sample,
    fps: 60,
    frameTimeMs: 16.7,
    gpuPercent: 50,
    gpuTempC: null,
    gpuVramMb: null,
    ramMb: 4096 + sample,
    uptime: `00:00:${String(sample).padStart(2, "0")}`,
  };
}

describe("performance session flush contract", () => {
  it("caps the persisted session buffer at 300 samples", () => {
    let buffer: RealtimeMetrics[] = [];

    for (let index = 0; index < PERFORMANCE_SESSION_BUFFER_LIMIT + 5; index += 1) {
      buffer = appendPerformanceSessionSample(buffer, metric(index));
    }

    expect(buffer).toHaveLength(PERFORMANCE_SESSION_BUFFER_LIMIT);
    expect(buffer[0]?.cpuPercent).toBe(5);
    expect(buffer.at(-1)?.cpuPercent).toBe(304);
  });

  it("dispatches a flush event and waits for registered persistence promises", async () => {
    const target = new EventTarget();
    const persist = vi.fn(async () => true);

    target.addEventListener(PERFORMANCE_SESSION_FLUSH_EVENT, (event) => {
      (event as CustomEvent).detail.waitUntil(persist());
    });

    const result = await requestPerformanceSessionFlush(target);

    expect(persist).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ rejectedCount: 0, requestedCount: 1 });
  });

  it("keeps local proof scoped away from live overlay and Supabase claims", () => {
    const proof = createOverlaySessionFlushLocalProof();

    expect(proof.bufferLimit).toBe(300);
    expect(proof.flushEventName).toBe(PERFORMANCE_SESSION_FLUSH_EVENT);
    expect(proof.triggers).toContain("close-overlay");
    expect(proof.triggers).toContain("global-toggle-close");
    expect(proof.guards).toContain("No live external overlay window");
    expect(proof.guards).toContain("No Supabase write/read proof");
    expect(proof.guards).toContain("No long-running native session");
  });
});
