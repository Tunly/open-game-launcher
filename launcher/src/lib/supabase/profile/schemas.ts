import {
  rowBoolean,
  rowConfig,
  rowNullableString,
  rowNumber,
  rowString,
  type UnknownRecord,
} from "../helpers";
import type {
  Friendship,
  Profile,
  ProfileComment,
  ProfileShowcase,
  ProfileTheme,
  UserActivity,
  UserBadge,
  UserSocialLink,
} from "../../types/profile";
import type { UpdateProfileInput } from "../../validation/profile";

export function toProfile(row: UnknownRecord): Profile {
  return {
    id: rowString(row, "id"),
    username: rowString(row, "username"),
    displayName: rowNullableString(row, "display_name"),
    avatarUrl: rowNullableString(row, "avatar_url"),
    bannerUrl: rowNullableString(row, "banner_url"),
    bio: rowNullableString(row, "bio"),
    countryCode: rowNullableString(row, "country_code"),
    language: rowString(row, "language", "en"),
    timezone: rowNullableString(row, "timezone"),
    profileVisibility: rowString(
      row,
      "profile_visibility",
      "public",
    ) as Profile["profileVisibility"],
    onlineStatusVisibility: rowString(
      row,
      "online_status_visibility",
      "public",
    ) as Profile["onlineStatusVisibility"],
    gameActivityVisibility: rowString(
      row,
      "game_activity_visibility",
      "friends_only",
    ) as Profile["gameActivityVisibility"],
    achievementVisibility: rowString(
      row,
      "achievement_visibility",
      "public",
    ) as Profile["achievementVisibility"],
    libraryVisibility: rowString(
      row,
      "library_visibility",
      "friends_only",
    ) as Profile["libraryVisibility"],
    wishlistVisibility: rowString(
      row,
      "wishlist_visibility",
      "public",
    ) as Profile["wishlistVisibility"],
    commentsVisibility: rowString(
      row,
      "comments_visibility",
      "friends_only",
    ) as Profile["commentsVisibility"],
    profileThemeId: rowNullableString(row, "profile_theme_id"),
    featuredBadgeId: rowNullableString(row, "featured_badge_id"),
    featuredGameId: rowNullableString(row, "featured_game_id"),
    featuredAchievementId: rowNullableString(row, "featured_achievement_id"),
    profileLevel: rowNumber(row, "profile_level", 1),
    profileXp: rowNumber(row, "profile_xp", 0),
    isBanned: rowBoolean(row, "is_banned"),
    isDeleted: rowBoolean(row, "is_deleted"),
    lastSeenAt: rowNullableString(row, "last_seen_at"),
    createdAt: rowString(row, "created_at"),
    updatedAt: rowString(row, "updated_at"),
  };
}

export function toTheme(row: UnknownRecord | null): ProfileTheme | null {
  if (!row) return null;
  return {
    id: rowString(row, "id"),
    key: rowString(row, "key"),
    name: rowString(row, "name"),
    description: rowNullableString(row, "description"),
    backgroundType: rowString(row, "background_type", "gradient") as ProfileTheme["backgroundType"],
    backgroundValue: rowNullableString(row, "background_value"),
    accentColor: rowNullableString(row, "accent_color"),
    textColor: rowNullableString(row, "text_color"),
    cardStyle: rowString(row, "card_style", "glass") as ProfileTheme["cardStyle"],
    isPremium: rowBoolean(row, "is_premium"),
    isActive: rowBoolean(row, "is_active", true),
    createdAt: rowString(row, "created_at"),
  };
}

export function toShowcase(row: UnknownRecord): ProfileShowcase {
  return {
    id: rowString(row, "id"),
    userId: rowString(row, "user_id"),
    type: rowString(row, "type") as ProfileShowcase["type"],
    title: rowNullableString(row, "title"),
    sortOrder: rowNumber(row, "sort_order"),
    visibility: rowString(row, "visibility", "public") as ProfileShowcase["visibility"],
    config: rowConfig(row, "config"),
    isEnabled: rowBoolean(row, "is_enabled", true),
    createdAt: rowString(row, "created_at"),
    updatedAt: rowString(row, "updated_at"),
  };
}

export function toBadge(row: UnknownRecord): UserBadge {
  return {
    id: rowString(row, "id"),
    userId: rowString(row, "user_id"),
    key: rowString(row, "key"),
    name: rowString(row, "name"),
    description: rowNullableString(row, "description"),
    iconUrl: rowNullableString(row, "icon_url"),
    rarity: rowString(row, "rarity", "common") as UserBadge["rarity"],
    source: rowString(row, "source", "system") as UserBadge["source"],
    earnedAt: rowString(row, "earned_at"),
  };
}

export function toSocialLink(row: UnknownRecord): UserSocialLink {
  return {
    id: rowString(row, "id"),
    userId: rowString(row, "user_id"),
    platform: rowString(row, "platform"),
    label: rowNullableString(row, "label"),
    url: rowString(row, "url"),
    sortOrder: rowNumber(row, "sort_order"),
    createdAt: rowString(row, "created_at"),
    updatedAt: rowString(row, "updated_at"),
  };
}

export function toHardware(
  row: UnknownRecord | null,
): import("../../types/profile").UserHardware | null {
  if (!row) return null;
  return {
    userId: rowString(row, "user_id"),
    cpu: rowNullableString(row, "cpu"),
    gpu: rowNullableString(row, "gpu"),
    ram: rowNullableString(row, "ram"),
    monitor: rowNullableString(row, "monitor"),
    keyboard: rowNullableString(row, "keyboard"),
    mouse: rowNullableString(row, "mouse"),
    headset: rowNullableString(row, "headset"),
    controller: rowNullableString(row, "controller"),
    setupImageUrl: rowNullableString(row, "setup_image_url"),
    visibility: rowString(
      row,
      "visibility",
      "friends_only",
    ) as import("../../types/profile").UserHardware["visibility"],
    createdAt: rowString(row, "created_at"),
    updatedAt: rowString(row, "updated_at"),
  };
}

export function toActivity(row: UnknownRecord): UserActivity {
  return {
    id: rowString(row, "id"),
    userId: rowString(row, "user_id"),
    type: rowString(row, "type"),
    gameId: rowNullableString(row, "game_id"),
    achievementId: rowNullableString(row, "achievement_id"),
    visibility: rowString(row, "visibility", "friends_only") as UserActivity["visibility"],
    data: rowConfig(row, "data"),
    createdAt: rowString(row, "created_at"),
  };
}

export function toComment(row: UnknownRecord): ProfileComment {
  return {
    id: rowString(row, "id"),
    profileUserId: rowString(row, "profile_user_id"),
    authorId: rowString(row, "author_id"),
    body: rowString(row, "body"),
    parentCommentId: rowNullableString(row, "parent_comment_id"),
    isDeleted: rowBoolean(row, "is_deleted"),
    createdAt: rowString(row, "created_at"),
    updatedAt: rowString(row, "updated_at"),
  };
}

export function toFriendship(row: UnknownRecord): Friendship {
  return {
    id: rowString(row, "id"),
    requesterId: rowString(row, "requester_id"),
    addresseeId: rowString(row, "addressee_id"),
    status: rowString(row, "status", "pending") as Friendship["status"],
    requestedAt: rowString(row, "requested_at"),
    respondedAt: rowNullableString(row, "responded_at"),
    createdAt: rowString(row, "created_at"),
    updatedAt: rowString(row, "updated_at"),
  };
}

export function toFriendPreview(profile: Profile): NonNullable<Friendship["profile"]> {
  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    profileVisibility: profile.profileVisibility,
  };
}

export function profileUpdatePayload(input: UpdateProfileInput) {
  return {
    username: input.username,
    display_name: input.displayName,
    avatar_url: input.avatarUrl,
    banner_url: input.bannerUrl,
    bio: input.bio,
    country_code: input.countryCode,
    language: input.language,
    timezone: input.timezone,
    featured_game_id: input.featuredGameId,
    featured_achievement_id: input.featuredAchievementId,
    featured_badge_id: input.featuredBadgeId,
  };
}

export function baseProfileUpdatePayload(input: UpdateProfileInput) {
  return {
    username: input.username,
    display_name: input.displayName,
    avatar_url: input.avatarUrl,
    banner_url: input.bannerUrl,
    bio: input.bio,
    country_code: input.countryCode,
    language: input.language,
    timezone: input.timezone,
  };
}

export function toHardwarePayload(input: import("../../validation/profile").HardwareInput) {
  return {
    cpu: input.cpu,
    gpu: input.gpu,
    ram: input.ram,
    monitor: input.monitor,
    keyboard: input.keyboard,
    mouse: input.mouse,
    headset: input.headset,
    controller: input.controller,
    setup_image_url: input.setupImageUrl,
    visibility: input.visibility,
  };
}
