import { describe, expect, it } from "vitest";

import {
  buildHostedControllerLayoutReadiness,
  createHostedControllerLayoutConsentRollbackEvidence,
  createVerifyHostedControllerLayoutReadiness,
} from "../hosted-controller-layout-readiness";

describe("buildHostedControllerLayoutReadiness", () => {
  it("marks hosted controller layout review gates ready while rollout lanes stay blocked", () => {
    const readiness = createVerifyHostedControllerLayoutReadiness();

    expect(readiness.statusLabel).toBe("Staged review ready");
    expect(readiness.readyCount).toBe(8);
    expect(readiness.warningCount).toBe(0);
    expect(readiness.blockedCount).toBe(0);
    expect(readiness.rolloutBlockedCount).toBe(3);
    expect(readiness.progress).toBe(100);
    expect(readiness.guards).toContain("Approved hosted layouts only");
    expect(readiness.guards).toContain("One-user vote RPC");
    expect(readiness.guards).toContain("Editor approved-feed staging");
    expect(readiness.guards).toContain("Report-backed moderation queue");
    expect(readiness.guards).toContain("Profile consent/rollback evidence only");
    expect(readiness.guards).toContain("No production/community rollout claim");
    expect(readiness.guardCopy).toContain("one-user vote persistence");
    expect(readiness.guardCopy).toContain("editor approved-feed staging");
    expect(readiness.guardCopy).toContain("profile consent evidence");
    expect(readiness.guardCopy).toContain("These are review gates only");
    expect(readiness.guardCopy).toContain("do not enable production/community rollout");
    expect(readiness.guardCopy).toContain("live/automatic profile cloud sync");
    expect(readiness.summary).toContain("approved feed");
    expect(readiness.summary).toContain("8 staged review gates ready");
    expect(readiness.summary).toContain("profile consent/rollback evidence");
    expect(readiness.summary).toContain(
      "rollout, marketplace, and live profile sync lanes remain blocked",
    );
    expect(readiness.consentRollbackEvidence?.consentLabel).toContain("Explicit profile consent");
    expect(readiness.gates.find((gate) => gate.id === "consent-rollback-evidence")?.status).toBe(
      "ready",
    );
    expect(readiness.rolloutBlockers.map((blocker) => blocker.label)).toEqual([
      "Production/Community Rollout",
      "Marketplace Publish",
      "Live Profile Cloud Sync",
    ]);
    expect(readiness.nextAction).toBe(
      "Hosted controller layout review gates are ready; keep rollout, marketplace, and live profile sync blocked.",
    );
  });

  it("blocks hosted review when local gallery/import fallback is missing", () => {
    const readiness = buildHostedControllerLayoutReadiness({
      consentRollbackEvidenceReady: false,
      editorApprovedFeedStagingReady: false,
      hostedDownloadsReady: false,
      localGalleryReady: false,
      localImportReady: false,
      moderationQueueReady: false,
      rlsVerified: false,
      supabaseConfigured: false,
      votingReady: false,
    });

    expect(readiness.blockedCount).toBe(7);
    expect(readiness.warningCount).toBe(1);
    expect(readiness.nextAction).toBe(
      "Restore the local community layout gallery before hosted review.",
    );
    expect(readiness.gates.find((gate) => gate.id === "local-import")?.status).toBe("blocked");
  });

  it("marks staged review gates ready when consent evidence exists", () => {
    const readiness = buildHostedControllerLayoutReadiness({
      consentRollbackEvidence: createHostedControllerLayoutConsentRollbackEvidence(),
      consentRollbackEvidenceReady: true,
      editorApprovedFeedStagingReady: true,
      hostedDownloadsReady: true,
      localGalleryReady: true,
      localImportReady: true,
      moderationQueueReady: true,
      rlsVerified: true,
      supabaseConfigured: true,
      votingReady: true,
    });

    expect(readiness.blockedCount).toBe(0);
    expect(readiness.readyCount).toBe(8);
    expect(readiness.warningCount).toBe(0);
    expect(readiness.statusLabel).toBe("Staged review ready");
    expect(readiness.rolloutBlockedCount).toBe(3);
    expect(readiness.gates.find((gate) => gate.id === "voting")?.status).toBe("ready");
    expect(readiness.gates.find((gate) => gate.id === "consent-rollback-evidence")?.status).toBe(
      "ready",
    );
  });

  it("keeps consent/rollback warning when evidence is missing", () => {
    const readiness = buildHostedControllerLayoutReadiness({
      consentRollbackEvidenceReady: true,
      editorApprovedFeedStagingReady: true,
      hostedDownloadsReady: true,
      localGalleryReady: true,
      localImportReady: true,
      moderationQueueReady: true,
      rlsVerified: true,
      supabaseConfigured: true,
      votingReady: true,
    });

    expect(readiness.readyCount).toBe(7);
    expect(readiness.warningCount).toBe(1);
    expect(readiness.consentRollbackEvidence).toBeNull();
    expect(readiness.gates.find((gate) => gate.id === "consent-rollback-evidence")?.status).toBe(
      "warning",
    );
  });
});
