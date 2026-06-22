import { describe, expect, it } from "vitest";

import {
  buildBroadcastVodArchivePolicy,
  createVerifyBroadcastVodArchivePolicy,
} from "../broadcast-vod-archive-policy";

const falseVodArchivePolicyClaim =
  /\b(?:(?:twitch|youtube|provider)\s*(?:oauth|vod|archive|video)\s*(?:ready|verified|connected|enabled|synced|complete|imported|published)|vod\s+archive\s+policy\s*(?:ready|verified|synced|enabled|complete)|vod(?:\s+(?:provider|archive))?\s*(?:sync|archive|import|publish|delete|retention)\s*(?:ready|verified|synced|enabled|complete|executed|applied)|archive\s*(?:created|written|served|published|synced|deleted)|supabase\s*(?:vod|archive(?:\s+row)?|storage|bucket|row)\s*(?:ready|verified|synced|enabled|written|inserted|updated|served|complete)|signed\s+url\s*(?:ready|created|generated|served)|public\s+storage\s*(?:ready|served|enabled|synced)|(?:rtmp(?:\/live|\s+live|\s+ingest)?|live\s+output)\s*(?:ready|connected|enabled|started)|audience(?:\/live)?\s*status\s*(?:ready|updated|online)|hosted\s*(?:moderation|archive|vod)\s*(?:ready|verified|enabled|synced|complete))\b/i;

describe("buildBroadcastVodArchivePolicy", () => {
  it("creates local VOD policy review without hosted archive claims", () => {
    const policy = createVerifyBroadcastVodArchivePolicy();

    expect(policy.statusLabel).toBe("Local policy review");
    expect(policy.reviewCount).toBe(3);
    expect(policy.blockedCount).toBe(4);
    expect(policy.guards).toContain("No Twitch/YouTube OAuth");
    expect(policy.guards).toContain("No OAuth token exchange");
    expect(policy.guards).toContain("No RTMP/live output");
    expect(policy.guards).toContain("No stream-key live use");
    expect(policy.guards).toContain("No hosted chat moderation");
    expect(policy.guards).toContain("No hosted enforcement");
    expect(policy.guards).toContain("No VOD provider sync");
    expect(policy.guards).toContain("No Supabase archive write");
    expect(policy.guards).toContain("No signed URL request");
    expect(policy.guards).toContain("No public storage serve");
    expect(policy.guards).toContain("No VOD sync job");
    expect(policy.guards).toContain("No provider archive import");
    expect(policy.guards).toContain("No delete request sent");
    expect(policy.guards).toContain("No audience/live-status claim");
    expect(policy.guardCopy).toContain("does not run Twitch/YouTube OAuth");
    expect(JSON.stringify(policy)).not.toMatch(falseVodArchivePolicyClaim);
  });

  it("flags hosted VOD archive wording as false-claim copy", () => {
    const falseClaims = [
      "public storage ready",
      "public storage served",
      "signed URL ready",
      "audience status updated",
      "live output started",
      "Supabase archive row inserted",
      "provider archive imported",
      "VOD sync ready",
    ];

    for (const claim of falseClaims) {
      expect(claim).toMatch(falseVodArchivePolicyClaim);
    }
  });

  it("keeps local retention, visibility, and delete coverage in review", () => {
    const policy = createVerifyBroadcastVodArchivePolicy();

    expect(policy.items.find((item) => item.id === "retention-draft")).toMatchObject({
      label: "Retention draft",
      status: "review",
    });
    expect(policy.items.find((item) => item.id === "visibility-review")).toMatchObject({
      label: "Visibility review",
      status: "review",
    });
    expect(policy.items.find((item) => item.id === "delete-coverage")).toMatchObject({
      label: "Delete coverage",
      status: "review",
    });
    expect(policy.items.find((item) => item.id === "provider-archive-import")).toMatchObject({
      status: "blocked",
    });
    expect(policy.items.find((item) => item.id === "vod-sync-job")).toMatchObject({
      status: "blocked",
    });
  });

  it("blocks every lane when local policy fixtures are absent", () => {
    const policy = buildBroadcastVodArchivePolicy({
      deleteCoverageDrafted: false,
      localRetentionDraft: false,
      providerArchiveImportStaged: false,
      signedUrlPreviewStaged: false,
      supabaseArchiveWriteStaged: false,
      visibilityMatrixReviewed: false,
      vodSyncJobStaged: false,
    });

    expect(policy.reviewCount).toBe(0);
    expect(policy.blockedCount).toBe(7);
    expect(policy.items.every((item) => item.status === "blocked")).toBe(true);
    expect(JSON.stringify(policy)).not.toMatch(falseVodArchivePolicyClaim);
  });
});
