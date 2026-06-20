import { describe, expect, it } from "vitest";

import {
  applyHostedCommunityArtworkReviewPreview,
  createVerifyHostedCommunityArtworkModerationConsole,
} from "../hosted-community-artwork-moderation-console";

describe("hosted community artwork moderation console fixtures", () => {
  it("creates deterministic queue and audit evidence", () => {
    const consoleState = createVerifyHostedCommunityArtworkModerationConsole({
      id: "akira",
      title: "Akira's Revenge",
    } as never);

    expect(consoleState.modeLabel).toBe("Local Review Preview");
    expect(consoleState.queueItems.map((item) => item.moderationStatus)).toEqual([
      "pending",
      "pending",
      "rejected",
    ]);
    expect(consoleState.queueItems[1]).toEqual(
      expect.objectContaining({
        lastReportReason: "wrong_game",
        moderationReason: "reported-by-community",
        reportCount: 3,
      }),
    );
    expect(consoleState.auditEntries[0]).toEqual(
      expect.objectContaining({
        action: "reported-threshold",
        actor: "community-report-threshold",
        reportCount: 3,
      }),
    );
  });

  it("applies local review previews without claiming live writes", () => {
    const consoleState = createVerifyHostedCommunityArtworkModerationConsole();
    const next = applyHostedCommunityArtworkReviewPreview(
      consoleState,
      consoleState.queueItems[0].id,
      "approve",
      "Approved in local preview.",
    );

    expect(next.queueItems[0]).toEqual(
      expect.objectContaining({
        lastAuditAction: "approved",
        moderationReason: "Approved in local preview.",
        moderationStatus: "approved",
        reportCount: 0,
      }),
    );
    expect(next.auditEntries[0]).toEqual(
      expect.objectContaining({
        action: "approved",
        actor: "local-moderator-fixture",
        newStatus: "approved",
        reason: "Approved in local preview.",
      }),
    );
    expect(next.guardCopy).toContain("Browser users do not receive service-role keys");
  });
});
