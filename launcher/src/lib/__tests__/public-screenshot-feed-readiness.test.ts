import { describe, expect, it } from "vitest";

import {
  buildPublicScreenshotFeedReadinessFromScreenshots,
  buildPublicScreenshotFeedReadiness,
  createLocalPublicScreenshotFeedReadiness,
  createVerifyPublicScreenshotFeedReadiness,
  updatePublicScreenshotFeedLikeState,
} from "../public-screenshot-feed-readiness";

describe("buildPublicScreenshotFeedReadiness", () => {
  it("builds hosted public screenshot feed staging without rollout claims", () => {
    const readiness = createVerifyPublicScreenshotFeedReadiness();

    expect(readiness.statusLabel).toBe("Hosted feed staging");
    expect(readiness.publicEmbedCount).toBe(2);
    expect(readiness.hostedPublicCount).toBe(2);
    expect(readiness.blockedPrivateCount).toBe(1);
    expect(readiness.totalLikeCount).toBe(178);
    expect(readiness.likedByMeCount).toBe(1);
    expect(readiness.feedSourceLabel).toBe("Hosted public rows");
    expect(readiness.moderationRankingEvidence).toEqual(
      expect.objectContaining({
        approvedPublicCount: 2,
        blockedReviewCount: 2,
        pendingReviewCount: 1,
        rankingInputLabel: "Approved public rows // likes desc // created desc",
      }),
    );
    expect(readiness.guards).toContain("Public metadata RLS");
    expect(readiness.guards).toContain("Signed URL path staged");
    expect(readiness.guards).toContain("Like count sync staged");
    expect(readiness.guards).toContain("No private capture embed");
    expect(readiness.guards).toContain("No hosted moderation");
    expect(readiness.guards).toContain("No production ranking claim");
    expect(readiness.guards).toContain("Moderation review contract");
    expect(readiness.guards).toContain("Deterministic ranking contract");
    expect(readiness.guardCopy).toContain("signed media URLs scoped to public rows");
    expect(JSON.stringify(readiness)).not.toMatch(
      /\b(?:supabase\s*(?:connected|synced|verified|ready)|signed\s+url\s*(?:created|generated|served)|public\s+storage\s*(?:served|enabled|ready)|hosted\s*(?:feed|moderation|ranking)\s*(?:ready|synced|enabled|verified|complete)|production\s+ranking\s*(?:ready|synced|enabled)|real\s+(?:profile|community)\s+feed)\b/i,
    );
  });

  it("builds the default community feed from local fixtures only", () => {
    const readiness = createLocalPublicScreenshotFeedReadiness();

    expect(readiness.statusLabel).toBe("Local fixture feed");
    expect(readiness.hostedPublicCount).toBe(0);
    expect(readiness.feedSourceLabel).toBe("Local fixtures");
    expect(readiness.guards).toContain("No Supabase feed read");
    expect(readiness.guards).toContain("No signed URL request");
    expect(readiness.guards).toContain("Moderation review contract");
    expect(readiness.guards).toContain("Deterministic ranking contract");
    expect(readiness.cards.every((card) => card.source === "local-fixture")).toBe(true);
    expect(
      readiness.cards.filter((card) => card.embedLabel === "Public Embed Preview"),
    ).toHaveLength(2);
  });

  it("keeps private captures locked behind the embed gate", () => {
    const readiness = createVerifyPublicScreenshotFeedReadiness();
    const privateCard = readiness.cards.find((card) => card.visibility === "private");

    expect(privateCard).toMatchObject({
      embedLabel: "Embed Blocked",
      gateLabel: "Private Gate Block",
      gateStatus: "blocked",
      privacyLabel: "Private Capture",
    });
    expect(privateCard?.gateDetail).toContain("never exposes capture media");
  });

  it("sorts public previews before blocked private captures and then by local likes", () => {
    const readiness = buildPublicScreenshotFeedReadiness([
      {
        artClass: "library-art-mech",
        authorHandle: "PrivateAce",
        caption: "Private high score",
        createdAt: "2026-06-12T08:00:00.000Z",
        gameTitle: "Steel Battalion X",
        id: "private-high-score",
        likeCount: 999,
        likedByMe: false,
        visibility: "private",
      },
      {
        artClass: "library-art-tokyo",
        authorHandle: "PublicAce",
        caption: "Public low score",
        createdAt: "2026-06-11T08:00:00.000Z",
        gameTitle: "Neo-Tokyo Drift",
        id: "public-low-score",
        likeCount: 1,
        likedByMe: false,
        visibility: "public",
      },
    ]);

    expect(readiness.cards.map((card) => card.id)).toEqual([
      "public-low-score",
      "private-high-score",
    ]);
  });

  it("keeps pending moderation out of public ranking even with high like counts", () => {
    const readiness = createVerifyPublicScreenshotFeedReadiness();

    expect(readiness.cards.map((card) => card.id)).toEqual([
      "shot-feed-tokyo-finish",
      "shot-feed-phantom-clear",
      "shot-feed-pending-spoiler",
      "shot-feed-mech-private",
    ]);
    expect(readiness.cards[2]).toEqual(
      expect.objectContaining({
        embedLabel: "Embed Blocked",
        gateLabel: "Moderation Pending Block",
        gateStatus: "blocked",
        likeCount: 88,
        moderationLabel: "Pending Review",
        rankingDetail:
          "Ranking blocked until privacy and moderation gates pass; likes cannot bypass review.",
      }),
    );
  });

  it("maps Supabase screenshots and like state into hosted feed cards", () => {
    const readiness = buildPublicScreenshotFeedReadinessFromScreenshots(
      [
        {
          caption: "Signed capture",
          createdAt: "2026-06-12T08:00:00.000Z",
          gameId: "game-123456",
          height: 720,
          id: "shot-1",
          isPublic: true,
          publicUrl: "https://signed.example/shot-1.png",
          sizeBytes: 1000,
          storagePath: "user-1/games/game/cap.png",
          thumbnailPath: null,
          thumbnailUrl: null,
          userId: "user-abcdef",
          width: 1280,
        },
        {
          caption: "Private capture",
          createdAt: "2026-06-11T08:00:00.000Z",
          gameId: null,
          height: null,
          id: "shot-2",
          isPublic: false,
          publicUrl: null,
          sizeBytes: null,
          storagePath: "user-1/games/game/private.png",
          thumbnailPath: null,
          thumbnailUrl: null,
          userId: "user-abcdef",
          width: null,
        },
      ],
      {
        "shot-1": { count: 3, likedByMe: true },
      },
    );

    expect(readiness.statusLabel).toBe("Hosted feed staging");
    expect(readiness.hostedPublicCount).toBe(1);
    expect(readiness.totalLikeCount).toBe(3);
    expect(readiness.cards[0]).toEqual(
      expect.objectContaining({
        displayUrl: "https://signed.example/shot-1.png",
        embedLabel: "Hosted Feed Preview",
        gateLabel: "Hosted Privacy Gate Pass",
        likeCount: 3,
        likedByMe: true,
        mediaLabel: "Signed Media Review",
        sourceLabel: "Hosted Row",
      }),
    );
    expect(readiness.cards[1]).toEqual(
      expect.objectContaining({
        embedLabel: "Embed Blocked",
        gateStatus: "blocked",
        privacyLabel: "Private Capture",
      }),
    );
  });

  it("updates a hosted feed card like state and recomputes ranking totals", () => {
    const readiness = createVerifyPublicScreenshotFeedReadiness();
    const updated = updatePublicScreenshotFeedLikeState(readiness, "shot-feed-phantom-clear", {
      count: 99,
      likedByMe: true,
    });

    expect(updated.totalLikeCount).toBe(246);
    expect(updated.likedByMeCount).toBe(2);
    expect(updated.cards[0]).toEqual(
      expect.objectContaining({
        caption: "Phantom menu clear",
        likeCount: 99,
        likedByMe: true,
        rank: "01",
      }),
    );
    expect(updated.cards[1]).toEqual(
      expect.objectContaining({
        caption: "Finish-line spark trail",
        rank: "02",
      }),
    );
    expect(updated.cards[2]).toEqual(
      expect.objectContaining({
        caption: "Unreviewed boss reveal",
        gateStatus: "blocked",
        moderationStatus: "pending-review",
      }),
    );
  });
});
