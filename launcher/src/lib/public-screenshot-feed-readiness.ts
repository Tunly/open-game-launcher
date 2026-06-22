import type { Screenshot, ScreenshotLikeState } from "./types/screenshots";

export type PublicScreenshotFeedVisibility = "public" | "private";
export type PublicScreenshotFeedGateStatus = "review" | "blocked";
export type PublicScreenshotFeedModerationStatus =
  | "approved"
  | "pending-review"
  | "reported"
  | "private-blocked";
export type PublicScreenshotFeedSource = "hosted-supabase" | "local-fixture";

export interface PublicScreenshotFeedFixture {
  artClass: "library-art-tokyo" | "library-art-mech" | "library-art-phantom";
  authorHandle: string;
  caption: string;
  createdAt: string;
  displayUrl?: string | null;
  gameTitle: string;
  id: string;
  likeCount: number;
  likedByMe: boolean;
  moderationStatus?: PublicScreenshotFeedModerationStatus;
  reportCount?: number;
  source?: PublicScreenshotFeedSource;
  visibility: PublicScreenshotFeedVisibility;
}

export interface PublicScreenshotFeedCard extends PublicScreenshotFeedFixture {
  embedLabel: string;
  gateDetail: string;
  gateLabel: string;
  gateStatus: PublicScreenshotFeedGateStatus;
  mediaLabel: string;
  moderationDetail: string;
  moderationLabel: string;
  moderationStatus: PublicScreenshotFeedModerationStatus;
  privacyLabel: string;
  rank: string;
  rankingDetail: string;
  rankingSignals: string[];
  source: PublicScreenshotFeedSource;
  sourceLabel: string;
}

export interface PublicScreenshotFeedModerationRankingEvidence {
  approvedPublicCount: number;
  blockedReviewCount: number;
  pendingReviewCount: number;
  reportedCount: number;
  rankingInputLabel: string;
  rules: PublicScreenshotFeedModerationRankingRule[];
  sourceLabel: string;
  summary: string;
}

export interface PublicScreenshotFeedModerationRankingRule {
  detail: string;
  id: string;
  label: string;
  status: "review" | "blocked";
}

export interface PublicScreenshotFeedReadiness {
  blockedPrivateCount: number;
  cards: PublicScreenshotFeedCard[];
  feedSourceLabel: string;
  guardCopy: string;
  guards: string[];
  hostedPublicCount: number;
  likedByMeCount: number;
  moderationRankingEvidence: PublicScreenshotFeedModerationRankingEvidence;
  publicEmbedCount: number;
  statusLabel: string;
  summary: string;
  totalLikeCount: number;
}

const LOCAL_PUBLIC_SCREENSHOT_FEED_GUARDS = [
  "Local fixture feed only",
  "No Supabase feed read",
  "No signed URL request",
  "No private capture embed",
  "No hosted moderation",
  "No ranking sync",
  "Moderation review contract",
  "Deterministic ranking contract",
];

const HOSTED_PUBLIC_SCREENSHOT_FEED_GUARDS = [
  "Public metadata RLS",
  "Signed URL path staged",
  "Like count sync staged",
  "No private capture embed",
  "No hosted moderation",
  "No production ranking claim",
  "Moderation review contract",
  "Deterministic ranking contract",
];

const LOCAL_PUBLIC_SCREENSHOT_FEED_GUARD_COPY =
  "Local screenshot feed preview only. The launcher ranks deterministic fixtures against the screenshot privacy and like contract; it does not fetch Supabase profile or community feeds, request signed URLs, expose private captures, run hosted moderation, or sync ranking state.";

const HOSTED_PUBLIC_SCREENSHOT_FEED_GUARD_COPY =
  "Public screenshot feed staging ranks public screenshot metadata and like counts through the screenshot privacy contract, with signed media URLs scoped to public rows. It does not expose private captures, run hosted moderation, publish production ranking, or claim community-wide rollout.";

const VERIFY_PUBLIC_SCREENSHOT_FEED_FIXTURES: PublicScreenshotFeedFixture[] = [
  {
    artClass: "library-art-tokyo",
    authorHandle: "KiraByte",
    caption: "Finish-line spark trail",
    createdAt: "2026-06-10T18:30:00.000Z",
    displayUrl: "signed-url-review://shot-feed-tokyo-finish",
    gameTitle: "Neo-Tokyo Drift",
    id: "shot-feed-tokyo-finish",
    likeCount: 42,
    likedByMe: true,
    moderationStatus: "approved",
    reportCount: 0,
    source: "hosted-supabase",
    visibility: "public",
  },
  {
    artClass: "library-art-phantom",
    authorHandle: "NullVector",
    caption: "Phantom menu clear",
    createdAt: "2026-06-09T20:15:00.000Z",
    displayUrl: "signed-url-review://shot-feed-phantom-clear",
    gameTitle: "Cipher Phantom",
    id: "shot-feed-phantom-clear",
    likeCount: 31,
    likedByMe: false,
    moderationStatus: "approved",
    reportCount: 0,
    source: "hosted-supabase",
    visibility: "public",
  },
  {
    artClass: "library-art-tokyo",
    authorHandle: "SpoilerWall",
    caption: "Unreviewed boss reveal",
    createdAt: "2026-06-10T19:00:00.000Z",
    displayUrl: "signed-url-review://shot-feed-pending-spoiler",
    gameTitle: "Cipher Phantom",
    id: "shot-feed-pending-spoiler",
    likeCount: 88,
    likedByMe: false,
    moderationStatus: "pending-review",
    reportCount: 1,
    source: "hosted-supabase",
    visibility: "public",
  },
  {
    artClass: "library-art-mech",
    authorHandle: "MechaMina",
    caption: "Raid hangar draft",
    createdAt: "2026-06-08T21:45:00.000Z",
    gameTitle: "Steel Battalion X",
    id: "shot-feed-mech-private",
    likeCount: 17,
    likedByMe: false,
    moderationStatus: "private-blocked",
    reportCount: 0,
    source: "local-fixture",
    visibility: "private",
  },
];

export interface BuildPublicScreenshotFeedReadinessOptions {
  source?: PublicScreenshotFeedSource;
}

export function buildPublicScreenshotFeedReadiness(
  fixtures: PublicScreenshotFeedFixture[],
  options: BuildPublicScreenshotFeedReadinessOptions = {},
): PublicScreenshotFeedReadiness {
  const cards = fixtures
    .map((fixture) => mapPublicScreenshotFeedCard(fixture, options.source ?? "local-fixture"))
    .sort((left, right) => {
      if (left.gateStatus !== right.gateStatus) {
        return left.gateStatus === "review" ? -1 : 1;
      }

      if (left.likeCount !== right.likeCount) {
        return right.likeCount - left.likeCount;
      }

      return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    })
    .map((card, index) => ({
      ...card,
      rank: String(index + 1).padStart(2, "0"),
    }));

  const publicEmbedCount = cards.filter(isPublicApprovedCard).length;
  const blockedPrivateCount = cards.filter((card) => card.visibility === "private").length;
  const hostedPublicCount = cards.filter(
    (card) => isPublicApprovedCard(card) && card.source === "hosted-supabase",
  ).length;
  const totalLikeCount = cards.reduce((total, card) => total + Math.max(0, card.likeCount), 0);
  const likedByMeCount = cards.filter((card) => card.likedByMe).length;
  const hasHostedEvidence = hostedPublicCount > 0;
  const moderationRankingEvidence = buildModerationRankingEvidence(cards, hasHostedEvidence);

  return {
    blockedPrivateCount,
    cards,
    feedSourceLabel: hasHostedEvidence ? "Hosted public rows" : "Local fixtures",
    guardCopy: hasHostedEvidence
      ? HOSTED_PUBLIC_SCREENSHOT_FEED_GUARD_COPY
      : LOCAL_PUBLIC_SCREENSHOT_FEED_GUARD_COPY,
    guards: hasHostedEvidence
      ? [...HOSTED_PUBLIC_SCREENSHOT_FEED_GUARDS]
      : [...LOCAL_PUBLIC_SCREENSHOT_FEED_GUARDS],
    hostedPublicCount,
    likedByMeCount,
    moderationRankingEvidence,
    publicEmbedCount,
    statusLabel:
      publicEmbedCount > 0
        ? hasHostedEvidence
          ? "Hosted feed staging"
          : "Local fixture feed"
        : "Privacy blocked",
    summary:
      publicEmbedCount > 0
        ? hasHostedEvidence
          ? `${hostedPublicCount}/${cards.length} approved public screenshot rows can stage feed cards with signed media review while pending, reported, and private captures stay locked.`
          : `${publicEmbedCount}/${cards.length} approved local screenshot fixtures can render as public embed previews while pending, reported, and private captures stay locked.`
        : "No public screenshot fixtures can render as embed previews; every capture stays behind the private gate.",
    totalLikeCount,
  };
}

export function createVerifyPublicScreenshotFeedReadiness(): PublicScreenshotFeedReadiness {
  return buildPublicScreenshotFeedReadiness(VERIFY_PUBLIC_SCREENSHOT_FEED_FIXTURES, {
    source: "hosted-supabase",
  });
}

export function createLocalPublicScreenshotFeedReadiness(): PublicScreenshotFeedReadiness {
  return buildPublicScreenshotFeedReadiness(
    VERIFY_PUBLIC_SCREENSHOT_FEED_FIXTURES.map((fixture) => ({
      ...fixture,
      source: "local-fixture",
    })),
    {
      source: "local-fixture",
    },
  );
}

export function buildPublicScreenshotFeedReadinessFromScreenshots(
  screenshots: Screenshot[],
  likes: Record<string, ScreenshotLikeState> = {},
): PublicScreenshotFeedReadiness {
  const fixtures = screenshots.map((screenshot, index) =>
    mapScreenshotToPublicFeedFixture(screenshot, likes[screenshot.id], index),
  );
  return buildPublicScreenshotFeedReadiness(fixtures, { source: "hosted-supabase" });
}

export function updatePublicScreenshotFeedLikeState(
  readiness: PublicScreenshotFeedReadiness,
  screenshotId: string,
  likeState: ScreenshotLikeState,
): PublicScreenshotFeedReadiness {
  let didUpdate = false;
  const fixtures = readiness.cards.map((card) => {
    const isMatch = card.id === screenshotId;
    didUpdate = didUpdate || isMatch;
    return {
      artClass: card.artClass,
      authorHandle: card.authorHandle,
      caption: card.caption,
      createdAt: card.createdAt,
      displayUrl: card.displayUrl,
      gameTitle: card.gameTitle,
      id: card.id,
      likeCount: isMatch ? likeState.count : card.likeCount,
      likedByMe: isMatch ? likeState.likedByMe : card.likedByMe,
      moderationStatus: card.moderationStatus,
      reportCount: card.reportCount,
      source: card.source,
      visibility: card.visibility,
    } satisfies PublicScreenshotFeedFixture;
  });

  return didUpdate ? buildPublicScreenshotFeedReadiness(fixtures) : readiness;
}

function mapPublicScreenshotFeedCard(
  fixture: PublicScreenshotFeedFixture,
  fallbackSource: PublicScreenshotFeedSource,
): PublicScreenshotFeedCard {
  const isPublic = fixture.visibility === "public";
  const moderationStatus = fixture.moderationStatus ?? (isPublic ? "approved" : "private-blocked");
  const isApproved = isPublic && moderationStatus === "approved";
  const source = fixture.source ?? fallbackSource;
  const isHosted = source === "hosted-supabase";

  return {
    ...fixture,
    displayUrl: fixture.displayUrl ?? null,
    moderationStatus,
    reportCount: Math.max(0, fixture.reportCount ?? 0),
    embedLabel: isApproved
      ? isHosted
        ? "Hosted Feed Preview"
        : "Public Embed Preview"
      : "Embed Blocked",
    gateDetail: isApproved
      ? isHosted
        ? "Public metadata can stage a scoped signed media URL while private captures remain locked."
        : "Public flag allows this local fixture to show the embed shell without a Supabase feed read or signed URL request."
      : moderationStatus === "pending-review"
        ? "Pending moderation blocks the embed shell; the card stays visible as review evidence only."
        : moderationStatus === "reported"
          ? "Reported capture blocks the embed shell until a trusted review clears the row."
          : "Private flag blocks the embed shell; the feed renders a locked placeholder and never exposes capture media.",
    gateLabel: isApproved
      ? isHosted
        ? "Hosted Privacy Gate Pass"
        : "Privacy Gate Pass"
      : moderationStatus === "pending-review"
        ? "Moderation Pending Block"
        : moderationStatus === "reported"
          ? "Report Review Block"
          : "Private Gate Block",
    gateStatus: isApproved ? "review" : "blocked",
    mediaLabel:
      isApproved && isHosted
        ? "Signed Media Review"
        : isApproved
          ? "Local Embed Shell"
          : "Locked Media",
    moderationDetail: moderationDetail(moderationStatus, fixture.reportCount ?? 0),
    moderationLabel: moderationLabel(moderationStatus),
    privacyLabel: isPublic ? "Public Capture" : "Private Capture",
    rank: "00",
    rankingDetail: isApproved
      ? "Ranking uses approved public rows only: likes first, then newest capture time."
      : "Ranking blocked until privacy and moderation gates pass; likes cannot bypass review.",
    rankingSignals: [
      `Likes: ${Math.max(0, fixture.likeCount)}`,
      `Created: ${fixture.createdAt}`,
      `Moderation: ${moderationLabel(moderationStatus)}`,
      `Reports: ${Math.max(0, fixture.reportCount ?? 0)}`,
    ],
    source,
    sourceLabel: isHosted ? "Hosted Row" : "Local Fixture",
  };
}

function isPublicApprovedCard(card: PublicScreenshotFeedCard): boolean {
  return card.visibility === "public" && card.moderationStatus === "approved";
}

function moderationLabel(status: PublicScreenshotFeedModerationStatus): string {
  switch (status) {
    case "approved":
      return "Approved Review";
    case "pending-review":
      return "Pending Review";
    case "reported":
      return "Report Review";
    case "private-blocked":
      return "Private Block";
    default:
      return "Review Block";
  }
}

function moderationDetail(
  status: PublicScreenshotFeedModerationStatus,
  reportCount: number,
): string {
  switch (status) {
    case "approved":
      return "Approved public metadata can enter the local feed ranking contract.";
    case "pending-review":
      return "Pending moderation stays blocked from embeds and cannot enter public ranking.";
    case "reported":
      return `${Math.max(0, reportCount)} report${reportCount === 1 ? "" : "s"} keep this capture out of public ranking until review.`;
    case "private-blocked":
      return "Private captures stay locked regardless of likes or recency.";
    default:
      return "Unknown moderation status stays blocked from public ranking.";
  }
}

function buildModerationRankingEvidence(
  cards: PublicScreenshotFeedCard[],
  hasHostedEvidence: boolean,
): PublicScreenshotFeedModerationRankingEvidence {
  const approvedPublicCount = cards.filter(isPublicApprovedCard).length;
  const pendingReviewCount = cards.filter(
    (card) => card.moderationStatus === "pending-review",
  ).length;
  const reportedCount = cards.filter((card) => card.moderationStatus === "reported").length;
  const blockedReviewCount = cards.length - approvedPublicCount;

  return {
    approvedPublicCount,
    blockedReviewCount,
    pendingReviewCount,
    reportedCount,
    rankingInputLabel: "Approved public rows // likes desc // created desc",
    rules: [
      {
        detail: "Only public captures with approved moderation status can render media.",
        id: "approved-public-only",
        label: "Approved Public Only",
        status: "review",
      },
      {
        detail:
          "Pending, reported, and private captures stay as locked review cards; likes cannot bypass moderation.",
        id: "moderation-before-ranking",
        label: "Moderation Before Ranking",
        status: blockedReviewCount > 0 ? "blocked" : "review",
      },
      {
        detail:
          "Ranking order is deterministic and local: approved cards sort by like count, then created time.",
        id: "deterministic-ranking",
        label: "Deterministic Ranking",
        status: "review",
      },
      {
        detail:
          "The packet does not send moderation actions, write ranking rows, or claim community-wide rollout.",
        id: "no-write-rollout-guard",
        label: "No-Write Rollout Guard",
        status: "blocked",
      },
    ],
    sourceLabel: hasHostedEvidence ? "Hosted public metadata packet" : "Local fixture packet",
    summary: `${approvedPublicCount} approved public row${approvedPublicCount === 1 ? "" : "s"} rank locally; ${blockedReviewCount} card${blockedReviewCount === 1 ? "" : "s"} stay locked for privacy or moderation review.`,
  };
}

function mapScreenshotToPublicFeedFixture(
  screenshot: Screenshot,
  likeState: ScreenshotLikeState | undefined,
  index: number,
): PublicScreenshotFeedFixture {
  const artClasses: PublicScreenshotFeedFixture["artClass"][] = [
    "library-art-tokyo",
    "library-art-phantom",
    "library-art-mech",
  ];

  return {
    artClass: artClasses[index % artClasses.length],
    authorHandle: screenshot.userId ? `player-${screenshot.userId.slice(0, 6)}` : "Unknown",
    caption: screenshot.caption?.trim() || "Shared capture",
    createdAt: screenshot.createdAt,
    displayUrl: screenshot.thumbnailUrl || screenshot.publicUrl || null,
    gameTitle: screenshot.gameId ? `Game ${screenshot.gameId.slice(0, 8)}` : "Community Capture",
    id: screenshot.id,
    likeCount: likeState?.count ?? 0,
    likedByMe: likeState?.likedByMe ?? false,
    source: "hosted-supabase",
    visibility: screenshot.isPublic ? "public" : "private",
  };
}
