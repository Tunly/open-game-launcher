// Universal Friends System types

export type PlatformType =
  "steam" | "epic" | "gog" | "ea" | "xbox" | "battlenet" | "ubisoft" | "og";
export type MatchMethod = "linked_account" | "heuristic" | "manual";
export type MergeSuggestionStatus = "pending" | "accepted" | "rejected";
export type ActivityType =
  | "status"
  | "game_start"
  | "game_stop"
  | "achievement_unlocked"
  | "wishlist_added"
  | "game_purchased";
export type InviteFeasibility = "possible" | "uncertain" | "impossible";

export interface PlatformAccount {
  id: string;
  userId: string;
  platform: PlatformType;
  platformUserId: string;
  platformUsername: string | null;
  platformAvatarUrl: string | null;
  metadata: Record<string, unknown>;
  linkedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformFriend {
  platform: PlatformType;
  platformId: string;
  displayName: string;
  avatarUrl: string | null;
  onlineStatus: "online" | "offline" | "away" | "busy" | "unknown";
}

export interface FriendLink {
  id: string;
  ownerId: string;
  platform: PlatformType;
  platformFriendId: string;
  platformFriendName: string | null;
  platformFriendAvatar: string | null;
  matchedUserId: string | null;
  matchMethod: MatchMethod | null;
  dismissed: boolean;
  mergeGroupId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FriendMergeSuggestion {
  id: string;
  userId: string;
  friendLinkA: string;
  friendLinkB: string | null;
  suggestedUserId: string | null;
  confidence: number;
  reason: string | null;
  status: MergeSuggestionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityFeedItem {
  id: string;
  userId: string;
  type: ActivityType;
  gameId: string | null;
  gameTitle: string | null;
  achievementName: string | null;
  metadata: ActivityFeedMetadata;
  visibility: "public" | "friends_only" | "private";
  createdAt: string;
}

export interface ActivityComment {
  activityId: string;
  authorId: string;
  body: string;
  createdAt: string;
  id: string;
}

export interface ActivityInteractionSummary {
  activityId: string;
  commentCount: number;
  reactedByCurrentUser: boolean;
  reactionCount: number;
}

export interface GroupChat {
  id: string;
  name: string | null;
  type: "group";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface GroupChatMember {
  roomId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  joinedAt: string;
}

export interface CrossPlatformInvite {
  id: string;
  senderId: string;
  receiverId: string | null;
  gameId: string | null;
  gameTitle: string;
  platform: PlatformType | null;
  launchUri: string | null;
  message: string | null;
  feasibility: InviteFeasibility;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformPresenceInfo {
  platform: PlatformType;
  source?: string | null;
  status: "online" | "offline" | "away" | "busy" | "unknown";
  currentGame: string | null;
  platformGameId?: string | null;
  lastPolledAt?: string | null;
}

export interface AggregatedPresence {
  userId: string;
  bestStatus: "online" | "away" | "busy" | "offline";
  platforms: PlatformPresenceInfo[];
  currentGame: string | null;
}

export interface ActivityFeedMetadata extends Record<string, unknown> {
  coverImageUrl?: string | null;
  currency?: string | null;
  externalGameId?: string | null;
  launcher?: string | null;
  localGameId?: string | null;
  platform?: PlatformType | string | null;
  platformGameId?: string | null;
  platformSource?: string | null;
  platform_source?: string | null;
  priceCents?: number | null;
  productId?: string | null;
  productSlug?: string | null;
  text?: string | null;
}
