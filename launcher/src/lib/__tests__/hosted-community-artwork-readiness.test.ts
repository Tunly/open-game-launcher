import { describe, expect, it } from "vitest";

import {
  buildHostedCommunityArtworkReadiness,
  createVerifyHostedCommunityArtworkReadiness,
} from "../hosted-community-artwork-readiness";

describe("hosted community artwork readiness", () => {
  it("marks hosted v1 scan and provider policy gates ready while keeping rollout staged", () => {
    const readiness = createVerifyHostedCommunityArtworkReadiness();

    expect(readiness.statusLabel).toBe("Hosted v1 staged");
    expect(readiness.readyCount).toBe(12);
    expect(readiness.warningCount).toBe(1);
    expect(readiness.blockedCount).toBe(0);
    expect(readiness.guards).toContain("Admin review actions require service-role tooling");
    expect(readiness.guards).toContain("Live review endpoint keeps service-role server-side");
    expect(readiness.guards).toContain("Review decisions write audit rows");
    expect(readiness.guards).toContain("Deterministic content scans gate approval");
    expect(readiness.guards).toContain("Provider artwork imports require source policy evidence");
    expect(readiness.guards).toContain("Epic artwork caps are local review only");
    expect(readiness.guards).toContain("No ML image moderation claim");
    expect(readiness.guards).toContain("No unvetted provider artwork scrape claim");
    expect(readiness.guardCopy).toContain("public upload UI");
    expect(readiness.guardCopy).toContain("audit rows");
    expect(readiness.guardCopy).toContain("deterministic content-scan evidence");
    expect(readiness.guardCopy).toContain("provider artwork source-policy evidence");
    expect(readiness.summary).toContain("persistent votes");
    expect(readiness.summary).toContain("public upload UI");
    expect(readiness.summary).toContain("moderator console");
    expect(readiness.summary).toContain("trusted live review endpoint");
    expect(readiness.summary).toContain("deterministic content-scan evidence");
    expect(readiness.summary).toContain("provider artwork source-policy evidence");
    expect(readiness.summary).toContain("local Steam/RAWG/Epic caps proof");
    expect(readiness.summary).toContain("community rollout remains staged work");
    expect(readiness.providerCapsProof).toMatchObject({
      blockedCount: 0,
      passCount: 2,
      reviewCount: 1,
      statusLabel: "Caps review",
    });
    expect(readiness.nextAction).toBe(
      "Run a controlled community rollout with real staging evidence before broad release.",
    );
  });

  it("does not claim hosted readiness when schema and client helpers are missing", () => {
    const readiness = buildHostedCommunityArtworkReadiness({
      adminModerationDashboardReady: false,
      clientHelpersReady: false,
      communityRolloutReady: false,
      contentScanningReady: false,
      localFallbackReady: true,
      moderationQueueReady: false,
      providerArtworkScrapingReady: false,
      publicUploadUiReady: false,
      rankingSyncReady: false,
      schemaRlsReady: false,
      storageBucketReady: false,
      trustedLiveReviewEndpointReady: false,
      votePersistenceReady: false,
    });

    expect(readiness.statusLabel).toBe("Local fallback");
    expect(readiness.blockedCount).toBeGreaterThan(0);
    expect(readiness.nextAction).toBe(
      "Add community artwork tables, RLS, and moderation-safe grants.",
    );
  });
});
