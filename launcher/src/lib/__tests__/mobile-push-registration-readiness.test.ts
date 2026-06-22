import { describe, expect, it } from "vitest";

import {
  buildMobilePushRegistrationContract,
  createVerifyMobilePushRegistrationContract,
} from "../mobile-push-registration-readiness";

describe("buildMobilePushRegistrationContract", () => {
  it("stages a redacted registration contract without push-send or raw-token claims", () => {
    const contract = createVerifyMobilePushRegistrationContract();

    expect(contract.statusLabel).toBe("Contract staged");
    expect(contract.platformLabel).toBe("iOS / APNs token hash");
    expect(contract.tokenHashLabel).toMatch(/^sha256:[a-f0-9]{8}...[a-f0-9]{8}$/);
    expect(contract.writeMode).toBe("Verify route: no write; hosted Edge Function writes only");
    expect(contract.guards).toContain("No raw device token");
    expect(contract.guards).toContain("No APNs/FCM send");
    expect(contract.guards).toContain("No push notification send");
    expect(contract.guards).toContain("No verify-route Supabase write");
    expect(contract.guards).toContain("Hosted Edge Function uses service role");
    expect(contract.checks.map((check) => check.label)).toEqual([
      "Consent",
      "Token Hash",
      "Owner Scope",
      "Hosted Edge Function",
      "Unregister",
      "Provider Send Block",
    ]);
    expect(JSON.stringify(contract)).not.toContain("apns-live-device-token");
    expect(JSON.stringify(contract)).not.toMatch(
      /push sent|notification delivered|apns request sent|fcm request sent|device token stored|supabase write complete/i,
    );
  });

  it("blocks registration review when consent or token hash evidence is missing", () => {
    const contract = buildMobilePushRegistrationContract({
      consentGranted: false,
      platform: "android",
      registrationId: "not-a-uuid",
      targetLabel: " Android Lab Phone ",
      tokenHash: "raw-device-token",
      tokenHint: "raw-device-token",
      unregisterReady: false,
    });

    expect(contract.statusLabel).toBe("Blocked");
    expect(contract.blockedCount).toBe(3);
    expect(contract.platformLabel).toBe("Android / FCM token hash");
    expect(contract.tokenHashLabel).toBe("missing valid token hash");
    expect(contract.consentLabel).toBe("Consent missing");
    expect(contract.checks.find((check) => check.id === "token-hash")?.status).toBe("blocked");
    expect(contract.checks.find((check) => check.id === "unregister")?.status).toBe("blocked");
    expect(JSON.stringify(contract)).not.toContain("raw-device-token");
  });

  it("redacts token-shaped hints before rendering contract evidence", () => {
    const tokenShapedHints = [
      "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      "eyJhbGciOiJIUzI1NiJ9.eyJmb28iOiJiYXIifQ.abcdef0123456789",
      "dR_xY6LqSTm9uZ02bLqZfA:APA91bHvzY4qhz5m1x8v8fCMliveValue",
    ];

    for (const tokenHint of tokenShapedHints) {
      const contract = buildMobilePushRegistrationContract({
        consentGranted: true,
        platform: "ios",
        registrationId: "22222222-2222-4222-8222-222222222222",
        targetLabel: "Steam Deck Companion",
        tokenHash,
        tokenHint,
        unregisterReady: true,
      });

      expect(contract.tokenHintLabel).toBe("token hint redacted");
      expect(JSON.stringify(contract)).not.toContain(tokenHint);
    }
  });
});

const tokenHash = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
