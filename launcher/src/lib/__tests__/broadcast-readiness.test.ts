import { describe, expect, it } from "vitest";

import { buildBroadcastReadinessPlan } from "../broadcast-readiness";

describe("buildBroadcastReadinessPlan", () => {
  const falseLiveProviderClaim =
    /\b(?:live\s*(?:now|ready|online|enabled|started)|go[-\s]?live\s*(?:ready|enabled|available)|ready\s+for\s+(?:local\s+)?broadcast(?:\s+staging)?|rtmp(?:\s+ingest)?\s*(?:ready|connected|enabled|started)|(?:twitch|youtube|provider)\s*(?:oauth|stream(?:ing)?|live|chat|vod)\s*(?:ready|verified|connected|enabled|synced|complete)|chat\s+moderation\s*(?:ready|verified|enabled)|vod(?:\s+provider)?\s*(?:sync|archive)\s*(?:ready|verified|synced|enabled)|broadcast\s*(?:started|online))\b/i;

  it("recommends a fully staged provider lane", () => {
    const plan = buildBroadcastReadinessPlan([
      {
        captureSource: "game",
        chatRelayReady: true,
        id: "twitch-main",
        label: "Twitch Main",
        linkedAccount: true,
        moderationReady: true,
        overlaySafety: "safe",
        provider: "twitch",
        streamKeyVaultReady: true,
        targetBitrateKbps: 6000,
        uploadMbps: 18,
        vodPolicyReady: true,
      },
    ]);

    expect(plan.recommended?.label).toBe("Twitch Main");
    expect(plan.recommended?.status).toBe("ready");
    expect(plan.readyCount).toBe(1);
    expect(plan.summary).toBe(
      "Twitch Main has complete local preflight evidence; hosted live rollout remains disabled.",
    );
    expect(plan.checklist).toContain("Twitch Main is the current broadcast pick");
    expect(plan.summary).not.toMatch(falseLiveProviderClaim);
  });

  it("keeps local preview lanes in warning state without hosted provider claims", () => {
    const plan = buildBroadcastReadinessPlan([
      {
        captureSource: "window",
        chatRelayReady: false,
        id: "local-preview",
        label: "Local Preview",
        linkedAccount: true,
        moderationReady: false,
        overlaySafety: "review",
        provider: "local",
        streamKeyVaultReady: true,
        targetBitrateKbps: 4500,
        uploadMbps: 12,
        vodPolicyReady: false,
      },
    ]);

    expect(plan.recommended?.label).toBe("Local Preview");
    expect(plan.recommended?.status).toBe("warning");
    expect(plan.warningCount).toBe(1);
    expect(plan.recommended?.warnings).toContain(
      "Local preview only; provider OAuth is not staged",
    );
    expect(plan.recommended?.warnings).toContain(
      "Overlay capture needs a safety review before live use",
    );
  });

  it("blocks lanes with no account, stream key, capture source, or upload headroom", () => {
    const plan = buildBroadcastReadinessPlan([
      {
        captureSource: "none",
        chatRelayReady: false,
        id: "blocked-youtube",
        label: "YouTube Slot",
        linkedAccount: false,
        moderationReady: false,
        overlaySafety: "unsafe",
        provider: "youtube",
        streamKeyVaultReady: false,
        targetBitrateKbps: 8000,
        uploadMbps: 3,
        vodPolicyReady: false,
      },
    ]);

    expect(plan.recommended).toBeNull();
    expect(plan.blockedCount).toBe(1);
    expect(plan.summary).toBe("Broadcast Readiness found lanes, but every live route is blocked.");
    expect(plan.channels[0].blockers).toContain("Provider account is not linked");
    expect(plan.channels[0].blockers).toContain("Stream key is not in the desktop vault");
    expect(plan.channels[0].blockers).toContain("No capture source selected");
    expect(plan.channels[0].blockers).toContain("Upload headroom is below target bitrate");
  });
});
