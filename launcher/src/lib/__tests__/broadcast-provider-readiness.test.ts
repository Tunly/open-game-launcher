import { describe, expect, it } from "vitest";

import {
  buildBroadcastProviderReadiness,
  createVerifyBroadcastProviderReadiness,
} from "../broadcast-provider-readiness";

describe("buildBroadcastProviderReadiness", () => {
  it("keeps provider broadcasting local without OAuth, RTMP, chat, VOD, or callback claims", () => {
    const readiness = createVerifyBroadcastProviderReadiness();

    expect(readiness.statusLabel).toBe("Local only");
    expect(readiness.readyCount).toBe(3);
    expect(readiness.warningCount).toBe(1);
    expect(readiness.blockedCount).toBe(6);
    expect(readiness.guards).toContain("Local fixtures only");
    expect(readiness.guards).toContain("No Twitch/YouTube OAuth");
    expect(readiness.guards).toContain("No RTMP/live output");
    expect(readiness.guards).toContain("No stream-key live use");
    expect(readiness.guards).toContain("No hosted chat moderation");
    expect(readiness.guards).toContain("No VOD provider sync");
    expect(readiness.guards).toContain("No audience/live-status claim");
    expect(readiness.guardCopy).toContain("does not run Twitch/YouTube OAuth");
    expect(readiness.summary).toContain("provider policy review");
    expect(readiness.gates.find((gate) => gate.id === "provider-policy")?.status).toBe("warning");
    expect(readiness.providerPolicyEvidence?.label).toBe("Provider Scope + Terms Policy");
    expect(readiness.providerPolicyEvidence?.guards).toContain("OAuth scope review only");
    expect(readiness.providerPolicyEvidence?.guards).toContain("No authorization redirect launch");
    expect(readiness.providerPolicyEvidence?.guards).toContain(
      "Provider terms approval required before rollout",
    );
    expect(readiness.providerPolicyEvidence?.providerRules.map((rule) => rule.provider)).toEqual([
      "Twitch",
      "YouTube",
      "Custom RTMP",
    ]);
    expect(readiness.providerPolicyEvidence?.summary).not.toMatch(
      /oauth ready|token exchange complete|rtmp connected|live output ready|provider chat ready/i,
    );
  });

  it("blocks rollout when local broadcast evidence and stream-key vault are absent", () => {
    const readiness = buildBroadcastProviderReadiness({
      capturePreflightReady: false,
      hostedChatModerationReady: false,
      providerOAuthReady: false,
      providerPolicyReady: false,
      rtmpIngestReady: false,
      streamKeyVaultReady: false,
      vodProviderSyncReady: false,
      webhookCallbackReady: false,
    });

    expect(readiness.blockedCount).toBe(10);
    expect(readiness.providerPolicyEvidence).toBeNull();
    expect(readiness.nextAction).toBe("Restore local broadcast preflight before provider staging.");
  });

  it("keeps hosted provider capabilities in review even when evidence exists", () => {
    const readiness = buildBroadcastProviderReadiness({
      capturePreflightReady: true,
      hostedChatModerationReady: true,
      providerOAuthReady: true,
      providerPolicyReady: true,
      rtmpIngestReady: true,
      streamKeyVaultReady: true,
      vodProviderSyncReady: true,
      webhookCallbackReady: true,
    });

    expect(readiness.blockedCount).toBe(0);
    expect(readiness.readyCount).toBe(3);
    expect(readiness.warningCount).toBe(7);
    expect(readiness.statusLabel).toBe("Needs staging");
    expect(readiness.gates.find((gate) => gate.id === "rtmp-ingest")?.status).toBe("warning");
  });
});
