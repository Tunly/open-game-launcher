import type { PlatformType } from "./friends";

export type ProfileVisibility = "public" | "friends_only" | "private";

type ShowcaseType =
  | "about"
  | "favorite_games"
  | "rare_achievements"
  | "latest_achievements"
  | "completionist"
  | "screenshots"
  | "stats"
  | "collections"
  | "reviews"
  | "wishlist"
  | "activity"
  | "friends"
  | "hardware_setup"
  | "custom_text"
  | "trophy_case";

type BadgeRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface Profile {
  id: string;
  appShellSkinId: string | null;
  customTheme: ProfileTheme | null;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  countryCode: string | null;
  language: string;
  timezone: string | null;
  profileVisibility: ProfileVisibility;
  onlineStatusVisibility: ProfileVisibility;
  gameActivityVisibility: ProfileVisibility;
  achievementVisibility: ProfileVisibility;
  libraryVisibility: ProfileVisibility;
  wishlistVisibility: ProfileVisibility;
  commentsVisibility: ProfileVisibility;
  profileThemeId: string | null;
  featuredBadgeId: string | null;
  featuredGameId: string | null;
  featuredAchievementId: string | null;
  profileLevel: number;
  profileXp: number;
  isBanned: boolean;
  isDeleted: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileTheme {
  id: string;
  key: string;
  name: string;
  description: string | null;
  backgroundType: "solid" | "gradient" | "image" | "animated";
  backgroundValue: string | null;
  accentColor: string | null;
  textColor: string | null;
  cardStyle: "default" | "glass" | "solid" | "neon" | "pixel" | "minimal";
  isPremium: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface ProfileShowcase {
  id: string;
  userId: string;
  type: ShowcaseType;
  title: string | null;
  sortOrder: number;
  visibility: ProfileVisibility;
  config: Record<string, unknown>;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileComment {
  id: string;
  profileUserId: string;
  authorId: string;
  body: string;
  parentCommentId: string | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  author?: Pick<Profile, "id" | "username" | "displayName" | "avatarUrl">;
}

export interface Friendship {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "blocked";
  requestedAt: string;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
  profile?: Pick<
    Profile,
    "id" | "username" | "displayName" | "avatarUrl" | "profileVisibility"
  > | null;
}

export interface FriendRequest extends Friendship {
  requesterProfile?:
    | Pick<Profile, "id" | "username" | "displayName" | "avatarUrl" | "profileVisibility">
    | undefined;
  addresseeProfile?:
    | Pick<Profile, "id" | "username" | "displayName" | "avatarUrl" | "profileVisibility">
    | undefined;
}

export interface UserPresence {
  userId: string;
  status: "offline" | "online" | "away" | "busy" | "invisible";
  customStatus: string | null;
  currentGameId: string | null;
  currentGameTitle: string | null;
  lastHeartbeatAt: string | null;
  platform: PlatformType | null;
  platformGameId: string | null;
  platformLastPolledAt: string | null;
  platformSource: string | null;
  updatedAt: string;
}

export interface ChatRoom {
  id: string;
  type: "dm" | "group";
  name: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GameInvite {
  id: string;
  senderId: string;
  receiverId: string | null;
  gameId: string | null;
  gameTitle: string;
  launchUri: string | null;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  message: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserBadge {
  id: string;
  userId: string;
  key: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  rarity: BadgeRarity;
  source: "system" | "achievement" | "event" | "founder" | "purchase" | "admin";
  earnedAt: string;
}

export interface UserSocialLink {
  id: string;
  userId: string;
  platform: string;
  label: string | null;
  url: string;
  sortOrder: number;
  visibility: ProfileVisibility;
  createdAt: string;
  updatedAt: string;
}

export interface UserHardware {
  userId: string;
  cpu: string | null;
  gpu: string | null;
  ram: string | null;
  monitor: string | null;
  keyboard: string | null;
  mouse: string | null;
  headset: string | null;
  controller: string | null;
  setupImageUrl: string | null;
  visibility: ProfileVisibility;
  createdAt: string;
  updatedAt: string;
}

export interface UserActivity {
  id: string;
  userId: string;
  type: string;
  gameId: string | null;
  achievementId: string | null;
  visibility: ProfileVisibility;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface ProfileStatsPreview {
  gamesOwned: number;
  achievementsUnlocked: number;
  playtimeMinutes: number;
  friendsCount: number;
}

export interface LibraryPreviewItem {
  id: string;
  gameId: string;
  title: string;
  coverUrl: string | null;
  playtimeMinutes: number;
  lastPlayedAt: string | null;
}

export interface AchievementPreviewItem {
  id: string;
  achievementId: string;
  gameId: string;
  gameTitle: string | null;
  name: string;
  description: string | null;
  iconUrl: string | null;
  rarity: BadgeRarity;
  unlockedAt: string;
}

export interface WishlistPreviewItem {
  id: string;
  gameId: string;
  title: string;
  coverUrl: string | null;
  addedAt: string;
}

export interface ProfilePageData {
  profile: Profile;
  theme: ProfileTheme | null;
  badges: UserBadge[];
  socialLinks: UserSocialLink[];
  hardware: UserHardware | null;
  showcases: ProfileShowcase[];
  comments: ProfileComment[];
  activity: UserActivity[];
  libraryPreview: LibraryPreviewItem[];
  achievementPreview: AchievementPreviewItem[];
  wishlistPreview: WishlistPreviewItem[];
  stats: ProfileStatsPreview;
}
