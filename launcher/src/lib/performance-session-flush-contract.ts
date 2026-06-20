import type { RealtimeMetrics } from "./types/performance";

export type PerformanceSessionFlushDetail = {
  waitUntil: (promise: Promise<unknown>) => void;
};

export type PerformanceSessionFlushResult = {
  rejectedCount: number;
  requestedCount: number;
};

export type OverlaySessionFlushLocalProof = {
  bufferLimit: number;
  flushEventName: string;
  guarantees: string[];
  guards: string[];
  triggers: string[];
};

export const PERFORMANCE_SESSION_BUFFER_LIMIT = 300;
export const PERFORMANCE_SESSION_FLUSH_EVENT = "og-launcher:performance-session-flush";

export function appendPerformanceSessionSample(
  buffer: RealtimeMetrics[],
  sample: RealtimeMetrics,
  limit = PERFORMANCE_SESSION_BUFFER_LIMIT,
): RealtimeMetrics[] {
  const safeLimit = Math.max(1, Math.floor(limit));
  return [...buffer.slice(-(safeLimit - 1)), sample];
}

export function requestPerformanceSessionFlush(
  target: Pick<EventTarget, "addEventListener" | "dispatchEvent" | "removeEventListener"> = window,
): Promise<PerformanceSessionFlushResult> {
  const pendingFlushes: Promise<unknown>[] = [];
  target.dispatchEvent(
    new CustomEvent<PerformanceSessionFlushDetail>(PERFORMANCE_SESSION_FLUSH_EVENT, {
      detail: {
        waitUntil: (promise) => pendingFlushes.push(Promise.resolve(promise)),
      },
    }),
  );

  return Promise.allSettled(pendingFlushes).then((results) => ({
    rejectedCount: results.filter((result) => result.status === "rejected").length,
    requestedCount: pendingFlushes.length,
  }));
}

export function createOverlaySessionFlushLocalProof(): OverlaySessionFlushLocalProof {
  return {
    bufferLimit: PERFORMANCE_SESSION_BUFFER_LIMIT,
    flushEventName: PERFORMANCE_SESSION_FLUSH_EVENT,
    guarantees: [
      "300 sample cap",
      "close-overlay waits for flush promises",
      "flush requests settle before window toggle",
    ],
    guards: [
      "No live external overlay window",
      "No Supabase write/read proof",
      "No long-running native session",
    ],
    triggers: ["close-overlay", "global-toggle-close", "component-unmount"],
  };
}
