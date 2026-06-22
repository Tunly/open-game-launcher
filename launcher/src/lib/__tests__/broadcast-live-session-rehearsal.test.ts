import { describe, expect, it } from "vitest";

import {
  buildBroadcastLiveSessionRehearsal,
  createVerifyBroadcastLiveSessionRehearsal,
} from "../broadcast-live-session-rehearsal";

describe("broadcast live session rehearsal", () => {
  it("keeps the go-live sequence local while exposing every blocked hosted/provider lane", () => {
    const rehearsal = createVerifyBroadcastLiveSessionRehearsal();

    expect(rehearsal.statusLabel).toBe("Local rehearsal only");
    expect(rehearsal.reviewCount).toBe(3);
    expect(rehearsal.blockedCount).toBe(7);
    expect(rehearsal.steps.map((step) => step.label)).toEqual([
      "Local preflight",
      "Desktop vault handoff",
      "Provider OAuth launch",
      "RTMP ingest negotiation",
      "Provider chat attach",
      "Hosted moderation handoff",
      "VOD archive handoff",
      "Provider callback replay",
      "Audience status update",
      "Rollback drill",
    ]);
    expect(rehearsal.summary).toContain("dry-run");
    expect(rehearsal.guards).toContain("No provider OAuth launch");
    expect(rehearsal.guards).toContain("No RTMP socket");
    expect(rehearsal.guards).toContain("No live audience status");
    expect(rehearsal.guardCopy).toContain("does not open provider OAuth");
  });

  it("moves staged evidence into review without claiming live execution", () => {
    const rehearsal = buildBroadcastLiveSessionRehearsal({
      audienceStatusStaged: false,
      callbackReplayStaged: true,
      desktopVaultHandoffReviewed: true,
      hostedModerationStaged: true,
      localPreflightReviewed: true,
      providerChatAttachStaged: true,
      providerOAuthLaunchStaged: true,
      rollbackDrillReviewed: true,
      rtmpNegotiationStaged: true,
      vodArchiveHandoffStaged: true,
    });

    expect(rehearsal.reviewCount).toBe(9);
    expect(rehearsal.blockedCount).toBe(1);
    expect(rehearsal.statusLabel).toBe("Needs live staging");
    expect(rehearsal.steps.find((step) => step.id === "audience-status")?.status).toBe("blocked");
    expect(rehearsal.guards).toContain("Review-only provider sequence");
    expect(rehearsal.guards).toContain("No live audience status");
    expect(rehearsal.summary).toContain("audience status");
  });
});
