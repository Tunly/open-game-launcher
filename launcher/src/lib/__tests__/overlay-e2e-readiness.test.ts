import { describe, expect, it } from "vitest";

import {
  buildOverlayE2EReadiness,
  createVerifyOverlayE2EReadiness,
} from "../overlay-e2e-readiness";

describe("buildOverlayE2EReadiness", () => {
  it("keeps live overlay and hosted session E2E blocked for the verification fixture", () => {
    const readiness = createVerifyOverlayE2EReadiness();

    expect(readiness.statusLabel).toBe("Local only");
    expect(readiness.readyCount).toBe(3);
    expect(readiness.warningCount).toBe(2);
    expect(readiness.blockedCount).toBe(3);
    expect(readiness.progress).toBe(38);
    expect(readiness.sessionFlushProof?.bufferLimit).toBe(300);
    expect(readiness.sessionFlushProof?.triggers).toContain("close-overlay");
    expect(readiness.guards).toContain("No live overlay E2E");
    expect(readiness.guards).toContain("No external window proof");
    expect(readiness.guards).toContain("No long-running native session");
    expect(readiness.guards).toContain("No Supabase write/read proof");
    expect(readiness.guards).toContain("No anti-cheat compatibility claim");
    expect(readiness.gates.map((gate) => gate.label)).toEqual([
      "Overlay Runtime Attribution",
      "Local Perf History",
      "Activity Cross-Filter",
      "Session Flush Contract",
      "External Overlay Window E2E",
      "Long Native Session",
      "Supabase Session E2E",
      "Anti-Cheat Fallback E2E",
    ]);
    expect(readiness.gates.find((gate) => gate.id === "anti-cheat-fallback")?.status).toBe(
      "warning",
    );
    expect(readiness.summary).toContain("anti-cheat fallback evidence");
    expect(readiness.summary).not.toContain("anti-cheat fallback E2E remain open");
  });

  it("does not report controlled staging until live and hosted proof exists", () => {
    const readiness = buildOverlayE2EReadiness({
      activityCrossFilterReady: true,
      antiCheatFallbackReady: false,
      externalOverlayWindowReady: false,
      localPerformanceHistoryReady: true,
      longRunningNativeSessionReady: false,
      overlayRuntimeAttributionReady: true,
      sessionFlushReady: true,
      supabaseSessionE2EReady: false,
    });

    expect(readiness.summary).toContain("live external overlay");
    expect(readiness.summary).toContain("Supabase write/read");
    expect(readiness.nextAction).toContain("external-overlay window E2E");
    expect(readiness.guardCopy).toContain("does not open a live external overlay window");
  });
});
