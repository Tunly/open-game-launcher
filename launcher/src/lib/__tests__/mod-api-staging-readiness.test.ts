import { describe, expect, it } from "vitest";

import {
  buildModApiStagingReadiness,
  createVerifyModProviderStagingProbe,
  createVerifyModApiStagingReadiness,
} from "../mod-api-staging-readiness";

describe("buildModApiStagingReadiness", () => {
  it("keeps mod provider API staging local without live key or request claims", () => {
    const readiness = createVerifyModApiStagingReadiness();

    expect(readiness.statusLabel).toBe("Local only");
    expect(readiness.readyCount).toBe(3);
    expect(readiness.warningCount).toBe(2);
    expect(readiness.blockedCount).toBe(2);
    expect(readiness.summary).toContain("terms, limits");
    expect(readiness.guards).toContain("No real provider key configured");
    expect(readiness.guards).toContain("No live mod.io/CurseForge API call");
    expect(readiness.guards).toContain("No hosted moderation/download claim");
    expect(readiness.guards).toContain("No Overwolf/CurseForge direct-download claim");
    expect(readiness.guards).toContain("Keys stay out of Supabase");
    expect(readiness.guardCopy).toContain("no real mod.io or CurseForge key is configured");
    expect(readiness.responseReviews.map((review) => review.id)).toEqual([
      "modio-response",
      "curseforge-response",
    ]);
    expect(readiness.responseReviews[0].blockedFields).toContain("Direct archive URL");
    expect(readiness.responseReviews[1].handoffPolicy).toContain("Overwolf");
    expect(readiness.policyEvidence?.label).toBe("Terms + Limits Policy");
    expect(readiness.policyEvidence?.guards).toContain("One-result staging requests");
    expect(readiness.policyEvidence?.guards).toContain("429/provider errors use capped retry");
    expect(readiness.policyEvidence?.providerRules).toHaveLength(2);
    expect(JSON.stringify(readiness.policyEvidence)).not.toMatch(
      /provider request sent|api key verified|direct download ready/i,
    );
  });

  it("blocks staging when local keychain and provider-id evidence are missing", () => {
    const readiness = buildModApiStagingReadiness({
      curseForgeKeyReady: false,
      localKeychainSlotReady: false,
      modioKeyReady: false,
      overwolfHandoffReady: false,
      providerIdMappingReady: false,
      rateLimitPolicyReady: false,
      sharedCatalogReviewReady: false,
    });

    expect(readiness.blockedCount).toBe(7);
    expect(readiness.nextAction).toBe(
      "Restore native secret storage before any API-key staging run.",
    );
  });

  it("keeps live provider capabilities in staging even when evidence exists", () => {
    const readiness = buildModApiStagingReadiness({
      curseForgeKeyReady: true,
      localKeychainSlotReady: true,
      modioKeyReady: true,
      overwolfHandoffReady: true,
      providerIdMappingReady: true,
      rateLimitPolicyReady: true,
      sharedCatalogReviewReady: true,
    });

    expect(readiness.blockedCount).toBe(0);
    expect(readiness.readyCount).toBe(3);
    expect(readiness.warningCount).toBe(4);
    expect(readiness.statusLabel).toBe("Needs staging");
    expect(readiness.gates.find((gate) => gate.id === "curseforge-key")?.status).toBe("warning");
  });

  it("builds a redacted no-network provider staging packet for verify mode", () => {
    const probe = createVerifyModProviderStagingProbe();

    expect(probe.status).toBe("blocked");
    expect(probe.liveRequestAttempted).toBe(false);
    expect(probe.pageSize).toBe(1);
    expect(probe.redactedRequest).toContain("api_key=<redacted>");
    expect(probe.guards).toContain("No direct-download URL exposed to UI/logs");
    expect(JSON.stringify(probe)).not.toMatch(/secret|downloadUrl|edge\.forgecdn\.net/i);
  });

  it("keeps provider response review fixtures free of raw direct download fields", () => {
    const readiness = createVerifyModApiStagingReadiness();
    const reviewText = JSON.stringify(readiness.responseReviews);

    expect(reviewText).toContain("mod.io fixture");
    expect(reviewText).toContain("CurseForge fixture");
    expect(reviewText).toContain("Direct archive URL");
    expect(reviewText).toContain("Raw file CDN host");
    expect(reviewText).not.toMatch(/downloadUrl|edge\.forgecdn\.net|super-secret|apiKey/i);
  });
});
