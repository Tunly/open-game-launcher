import type { ProfilePageData, ProfileVisibility } from "./types/profile";

export type ProfilePrivacyLaneId =
  | "library"
  | "achievements"
  | "activity"
  | "wishlist"
  | "comments"
  | "hardware"
  | "showcases"
  | "social-links";

export type ProfilePrivacyLaneState = "visible" | "empty" | "guarded";

export type ProfilePrivacyGuardStatus = "public-safe" | "friend-visible" | "owner-visible";

export interface ProfilePrivacyBlockedLane {
  id: ProfilePrivacyLaneId;
  label: string;
  visibility: ProfileVisibility;
  count: number;
  detail: string;
}

export interface ProfilePrivacyVisibleLane {
  id: ProfilePrivacyLaneId;
  label: string;
  visibility: ProfileVisibility;
  count: number;
  state: ProfilePrivacyLaneState;
  detail: string;
}

export interface ProfilePrivacyGuard {
  status: ProfilePrivacyGuardStatus;
  statusLabel: string;
  viewerLabel: string;
  route: string;
  summary: string;
  guardCopy: string;
  blockedCount: number;
  publicCount: number;
  blockedLanes: ProfilePrivacyBlockedLane[];
  visibleLanes: ProfilePrivacyVisibleLane[];
  guardrails: string[];
  laneStates: Record<ProfilePrivacyLaneId, ProfilePrivacyLaneState>;
}

export interface ProfilePrivacyGuardContext {
  isOwnProfile: boolean;
  isFriend?: boolean;
  route: string;
}

interface LaneDefinition {
  id: ProfilePrivacyLaneId;
  label: string;
  visibility: ProfileVisibility;
  count: number;
  detail: string;
}

export function applyProfilePrivacyGuard(
  source: ProfilePageData,
  context: ProfilePrivacyGuardContext,
): { data: ProfilePageData; guard: ProfilePrivacyGuard } {
  const libraryVisibility = source.profile.libraryVisibility;
  const achievementVisibility = source.profile.achievementVisibility;
  const activityVisibility = source.profile.gameActivityVisibility;
  const wishlistVisibility = source.profile.wishlistVisibility;
  const commentsVisibility = source.profile.commentsVisibility;
  const hardwareVisibility = source.hardware?.visibility ?? "private";
  const visibleSocialLinks = source.socialLinks.filter((link) =>
    canViewVisibility(link.visibility, context),
  );
  const hiddenSocialLinkCount = source.socialLinks.length - visibleSocialLinks.length;
  const hiddenShowcaseCount = source.showcases.filter(
    (showcase) => !canViewVisibility(showcase.visibility, context),
  ).length;

  const laneDefinitions: LaneDefinition[] = [
    {
      id: "library",
      label: "Library Preview",
      visibility: libraryVisibility,
      count: source.libraryPreview.length,
      detail: "Game titles and playtime stay hidden unless the library lane is public.",
    },
    {
      id: "achievements",
      label: "Achievement Strip",
      visibility: achievementVisibility,
      count: source.achievementPreview.length,
      detail: "Achievement names, rarity, and game titles follow the achievement visibility lane.",
    },
    {
      id: "activity",
      label: "Activity Feed",
      visibility: activityVisibility,
      count: source.activity.length,
      detail: "Activity rows and game identifiers stay behind the game activity visibility lane.",
    },
    {
      id: "wishlist",
      label: "Wishlist Preview",
      visibility: wishlistVisibility,
      count: source.wishlistPreview.length,
      detail: "Wishlist titles stay hidden unless the wishlist lane is public.",
    },
    {
      id: "comments",
      label: "Guestbook",
      visibility: commentsVisibility,
      count: source.comments.length,
      detail: "Guestbook bodies and authors follow profile comment visibility.",
    },
    {
      id: "hardware",
      label: "Hardware Setup",
      visibility: hardwareVisibility,
      count: source.hardware ? 1 : 0,
      detail: "CPU, GPU, peripherals, and setup art stay hidden unless the setup is public.",
    },
    {
      id: "showcases",
      label: "Private Showcases",
      visibility: hiddenShowcaseCount > 0 ? "private" : "public",
      count: hiddenShowcaseCount,
      detail:
        "Showcase config JSON is removed before public rendering when the showcase is guarded.",
    },
    {
      id: "social-links",
      label: hiddenSocialLinkCount > 0 ? "Private Social Links" : "Social Links",
      visibility: hiddenSocialLinkCount > 0 ? "private" : "public",
      count: hiddenSocialLinkCount > 0 ? hiddenSocialLinkCount : visibleSocialLinks.length,
      detail:
        "Profile links follow per-link visibility before URLs or labels reach the public render.",
    },
  ];

  const laneStates = laneDefinitions.reduce(
    (states, lane) => {
      const isGuarded =
        lane.id === "showcases" ? lane.count > 0 : !canViewVisibility(lane.visibility, context);
      states[lane.id] = isGuarded ? "guarded" : lane.count > 0 ? "visible" : "empty";
      return states;
    },
    {} as Record<ProfilePrivacyLaneId, ProfilePrivacyLaneState>,
  );

  const visibleActivity = canViewVisibility(activityVisibility, context)
    ? source.activity.filter((item) => canViewVisibility(item.visibility, context))
    : [];
  const canViewOnlineStatus = canViewVisibility(source.profile.onlineStatusVisibility, context);

  const visibleData: ProfilePageData = {
    ...source,
    profile: {
      ...source.profile,
      lastSeenAt: canViewOnlineStatus ? source.profile.lastSeenAt : null,
    },
    hardware: laneStates.hardware === "guarded" ? null : source.hardware,
    showcases: source.showcases.filter(
      (showcase) => showcase.isEnabled && canViewVisibility(showcase.visibility, context),
    ),
    comments: laneStates.comments === "guarded" ? [] : source.comments,
    activity: visibleActivity,
    libraryPreview: laneStates.library === "guarded" ? [] : source.libraryPreview,
    achievementPreview: laneStates.achievements === "guarded" ? [] : source.achievementPreview,
    wishlistPreview: laneStates.wishlist === "guarded" ? [] : source.wishlistPreview,
    socialLinks: visibleSocialLinks,
    stats: {
      gamesOwned: laneStates.library === "guarded" ? 0 : source.stats.gamesOwned,
      playtimeMinutes: laneStates.library === "guarded" ? 0 : source.stats.playtimeMinutes,
      achievementsUnlocked:
        laneStates.achievements === "guarded" ? 0 : source.stats.achievementsUnlocked,
      friendsCount: context.isOwnProfile ? source.stats.friendsCount : 0,
    },
  };

  const blockedLanes = laneDefinitions
    .filter((lane) => laneStates[lane.id] === "guarded")
    .map<ProfilePrivacyBlockedLane>((lane) => ({
      id: lane.id,
      label: lane.label,
      visibility: lane.visibility,
      count: lane.count,
      detail: lane.detail,
    }));

  const visibleLanes = laneDefinitions
    .filter((lane) => laneStates[lane.id] !== "guarded")
    .map<ProfilePrivacyVisibleLane>((lane) => ({
      id: lane.id,
      label: lane.label,
      visibility: lane.visibility,
      count: lane.count,
      state: laneStates[lane.id],
      detail: lane.detail,
    }));

  const status = context.isOwnProfile
    ? "owner-visible"
    : context.isFriend
      ? "friend-visible"
      : "public-safe";
  const viewerLabel = context.isOwnProfile
    ? "Profile owner"
    : context.isFriend
      ? "Friend viewer"
      : "Public viewer";

  return {
    data: visibleData,
    guard: {
      status,
      statusLabel: statusToLabel(status),
      viewerLabel,
      route: context.route,
      summary:
        "Public profile lanes are redacted before rendering, with protected records replaced by privacy states instead of raw titles, hardware, activity, or comments.",
      guardCopy:
        "Client render uses visibility gates after the public profile loader returns, so private fixture values never enter panels, cards, or guestbook output.",
      blockedCount: blockedLanes.length,
      publicCount: visibleLanes.filter((lane) => lane.state === "visible").length,
      blockedLanes,
      visibleLanes,
      guardrails: [
        "No Supabase writes",
        "No private table replay",
        "No friend graph assumption",
        "No raw private fixture text",
      ],
      laneStates,
    },
  };
}

export function canViewVisibility(
  visibility: ProfileVisibility,
  context: Pick<ProfilePrivacyGuardContext, "isOwnProfile" | "isFriend">,
) {
  if (context.isOwnProfile) return true;
  if (visibility === "public") return true;
  if (visibility === "friends_only") return Boolean(context.isFriend);
  return false;
}

export function createVerifyProfilePrivacyGuardData(): ProfilePageData {
  const now = "2026-06-14T10:00:00.000Z";

  return {
    profile: {
      id: "privacy-guard-user",
      appShellSkinId: null,
      customTheme: null,
      username: "localprivacy",
      displayName: "Local Privacy Guard",
      avatarUrl: null,
      bannerUrl: null,
      bio: "Public shell for checking profile privacy gates without hosted writes.",
      countryCode: "DE",
      language: "en",
      timezone: "Europe/Berlin",
      profileVisibility: "public",
      onlineStatusVisibility: "public",
      gameActivityVisibility: "friends_only",
      achievementVisibility: "private",
      libraryVisibility: "friends_only",
      wishlistVisibility: "private",
      commentsVisibility: "private",
      profileThemeId: null,
      featuredBadgeId: null,
      featuredGameId: null,
      featuredAchievementId: null,
      profileLevel: 22,
      profileXp: 9400,
      isBanned: false,
      isDeleted: false,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    },
    theme: null,
    badges: [
      {
        id: "privacy-guard-badge",
        userId: "privacy-guard-user",
        key: "privacy-guard",
        name: "Privacy Guard",
        description: "Public profile privacy verification badge.",
        iconUrl: null,
        rarity: "rare",
        source: "system",
        earnedAt: now,
      },
    ],
    socialLinks: [
      {
        id: "privacy-guard-public-link",
        userId: "privacy-guard-user",
        platform: "docs",
        label: "Public Notes",
        url: "https://example.com/public-profile-privacy",
        sortOrder: 0,
        visibility: "public",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "privacy-guard-private-link",
        userId: "privacy-guard-user",
        platform: "discord",
        label: "Private Discord",
        url: "https://discord.gg/private-lab",
        sortOrder: 1,
        visibility: "private",
        createdAt: now,
        updatedAt: now,
      },
    ],
    hardware: {
      userId: "privacy-guard-user",
      cpu: "Ryzen Privacy CPU",
      gpu: "RTX Private Lab",
      ram: "64 GB private bench",
      monitor: "Confidential OLED panel",
      keyboard: "Private split board",
      mouse: "Hidden sensor mouse",
      headset: null,
      controller: null,
      setupImageUrl: null,
      visibility: "private",
      createdAt: now,
      updatedAt: now,
    },
    showcases: [
      {
        id: "privacy-public-about",
        userId: "privacy-guard-user",
        type: "about",
        title: "Public Bio",
        sortOrder: 0,
        visibility: "public",
        config: {},
        isEnabled: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "privacy-private-notes",
        userId: "privacy-guard-user",
        type: "custom_text",
        title: "Hidden Notes",
        sortOrder: 1,
        visibility: "private",
        config: { body: "Private Showcase Notes" },
        isEnabled: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    comments: [
      {
        id: "privacy-comment",
        profileUserId: "privacy-guard-user",
        authorId: "privacy-friend",
        body: "Secret Guestbook",
        parentCommentId: null,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
        author: {
          id: "privacy-friend",
          username: "hiddenfriend",
          displayName: "Hidden Friend",
          avatarUrl: null,
        },
      },
    ],
    activity: [
      {
        id: "privacy-activity",
        userId: "privacy-guard-user",
        type: "Friends Raid Session",
        gameId: "private-game",
        achievementId: null,
        visibility: "friends_only",
        data: { lobby: "hidden" },
        createdAt: now,
      },
    ],
    libraryPreview: [
      {
        id: "privacy-library-1",
        gameId: "private-game",
        title: "Private Backlog RPG",
        coverUrl: null,
        playtimeMinutes: 1440,
        lastPlayedAt: now,
      },
      {
        id: "privacy-library-2",
        gameId: "private-game-2",
        title: "Coop Draft Build",
        coverUrl: null,
        playtimeMinutes: 960,
        lastPlayedAt: now,
      },
    ],
    achievementPreview: [
      {
        id: "privacy-achievement",
        achievementId: "privacy-achievement",
        gameId: "private-game",
        gameTitle: "Private Backlog RPG",
        name: "Hidden Boss Clear",
        description: "A private achievement that must not render for public viewers.",
        iconUrl: null,
        rarity: "epic",
        unlockedAt: now,
      },
    ],
    wishlistPreview: [
      {
        id: "privacy-wishlist",
        gameId: "private-wish",
        title: "Unannounced Wishlist",
        coverUrl: null,
        addedAt: now,
      },
    ],
    stats: {
      achievementsUnlocked: 7,
      friendsCount: 4,
      gamesOwned: 2,
      playtimeMinutes: 2400,
    },
  };
}

function statusToLabel(status: ProfilePrivacyGuardStatus) {
  if (status === "owner-visible") return "Owner Visible";
  if (status === "friend-visible") return "Friend Visible";
  return "Public Safe";
}
