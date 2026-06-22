import { describe, expect, it } from "vitest";

import { buildMobileAppReadiness, createVerifyMobileAppReadiness } from "../mobile-app-readiness";

describe("buildMobileAppReadiness", () => {
  it("keeps mobile verification local without native app or push claims", () => {
    const readiness = createVerifyMobileAppReadiness();

    expect(readiness.statusLabel).toBe("Local only");
    expect(readiness.readyCount).toBe(3);
    expect(readiness.blockedCount).toBe(2);
    expect(readiness.warningCount).toBe(2);
    expect(readiness.guards).toContain("No native iOS/Android app");
    expect(readiness.guards).toContain("No push notification send");
    expect(readiness.guards).toContain("No app-store distribution");
    expect(readiness.guards).toContain("No background mobile download");
    expect(readiness.guards).toContain("No live hosted deployment");
    expect(readiness.guardCopy).toContain("does not ship an iOS/Android app");
    expect(readiness.guardCopy).toContain("prove a live hosted deployment");
    expect(readiness.gates.find((gate) => gate.id === "push-provider")).toEqual(
      expect.objectContaining({
        detail: expect.stringContaining("token-hash registration contract"),
        status: "warning",
      }),
    );
  });

  it("blocks mobile readiness when pairing and remote downloads are missing", () => {
    const readiness = buildMobileAppReadiness({
      appStoreDistributionReady: false,
      chatRelayReady: false,
      devicePairingReady: false,
      hostedRelayReady: false,
      librarySyncReady: false,
      pushProviderReady: false,
      remoteDownloadsReady: false,
    });

    expect(readiness.blockedCount).toBe(6);
    expect(readiness.nextAction).toBe("Finish mobile/desktop device pairing before app handoff.");
    expect(readiness.gates.find((gate) => gate.id === "remote-downloads")?.status).toBe("blocked");
  });

  it("keeps push and distribution as warning gates even with evidence", () => {
    const readiness = buildMobileAppReadiness({
      appStoreDistributionReady: true,
      chatRelayReady: true,
      devicePairingReady: true,
      hostedRelayReady: true,
      librarySyncReady: true,
      pushProviderReady: true,
      remoteDownloadsReady: true,
    });

    expect(readiness.blockedCount).toBe(0);
    expect(readiness.warningCount).toBe(4);
    expect(readiness.statusLabel).toBe("Needs staging");
    expect(readiness.gates.find((gate) => gate.id === "push-provider")?.status).toBe("warning");
  });
});
