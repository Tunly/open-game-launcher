import { describe, expect, it } from "vitest";

import {
  buildMobileAppPushDryRunPacket,
  createVerifyMobileAppPushDryRunPacket,
  parseMobilePushPlatform,
} from "../mobile-app-push-dry-run";

describe("buildMobileAppPushDryRunPacket", () => {
  it("creates a redacted mobile push dry-run packet without writes or send claims", () => {
    const packet = createVerifyMobileAppPushDryRunPacket();

    expect(packet.statusLabel).toBe("Dry run");
    expect(packet.platformLabel).toBe("iOS / APNs staging");
    expect(packet.targetLabel).toBe("Steam Deck Companion");
    expect(packet.writeMode).toBe("Writes: none");
    expect(packet.tokenHint).toBe("apns...c999");
    expect(packet.consentLabel).toBe("Consent staged");
    expect(packet.payloadPreview).toEqual({
      action: "oglauncher://downloads/remote/claim",
      body: "Neon Circuit is queued for desktop claim.",
      buildId: "build_neon_1_0_3",
      jobId: "job_mobile_push_demo",
      title: "Remote install ready",
    });
    expect(packet.guards).toContain("No push notification send");
    expect(packet.guards).toContain("No APNs/FCM network call");
    expect(packet.guards).toContain("No device-token write");
    expect(packet.guards).toContain("No Supabase write");
    expect(packet.guards).toContain("Writes: none");
    expect(packet.checks.map((check) => check.label)).toEqual([
      "Target / Platform",
      "Consent",
      "Token Safety",
      "Payload Preview",
      "Write Guard",
      "Provider Skip",
    ]);
    expect(JSON.stringify(packet)).not.toContain("apns-live-device-token-9999999999c999");
    expect(JSON.stringify(packet)).not.toMatch(
      /\b(push sent|notification delivered|device token stored|supabase write complete|supabase write succeeded|apns request sent|fcm request sent)\b/i,
    );
  });

  it("blocks readiness when consent is missing or the token is unsafe", () => {
    const packet = buildMobileAppPushDryRunPacket({
      consentGranted: false,
      deviceToken: "short",
      notificationPermission: "denied",
      payload: {
        action: "oglauncher://downloads/remote/claim",
        body: "Install waiting.",
        buildId: "build_demo",
        jobId: "job_demo",
        title: "Install ready",
      },
      platform: "android",
      targetLabel: "Android Lab Phone",
    });

    expect(packet.statusLabel).toBe("Blocked");
    expect(packet.blockedCount).toBe(2);
    expect(packet.tokenHint).toBe("token redacted");
    expect(packet.consentLabel).toBe("Consent missing");
    expect(packet.checks.find((check) => check.id === "consent")?.status).toBe("blocked");
    expect(packet.checks.find((check) => check.id === "token-safety")?.status).toBe("blocked");
    expect(packet.guards).toContain("No push notification send");
    expect(JSON.stringify(packet)).not.toContain("short");
  });
});

describe("parseMobilePushPlatform", () => {
  it("normalizes mobile push platform aliases and falls back to ios", () => {
    expect(parseMobilePushPlatform("ios")).toBe("ios");
    expect(parseMobilePushPlatform("apns")).toBe("ios");
    expect(parseMobilePushPlatform("android")).toBe("android");
    expect(parseMobilePushPlatform("fcm")).toBe("android");
    expect(parseMobilePushPlatform("desktop")).toBe("ios");
    expect(parseMobilePushPlatform(null)).toBe("ios");
  });
});
