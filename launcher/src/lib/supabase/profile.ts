import { getSupabaseClient } from "./client";
import type { User } from "@supabase/supabase-js";
import {
  commentSchema,
  createShowcaseSchema,
  hardwareSchema,
  socialLinksSchema,
  updatePrivacySchema,
  updateProfileSchema,
  updateShowcaseSchema,
  usernameSchema,
  type CreateShowcaseInput,
  type HardwareInput,
  type SocialLinksInput,
  type UpdatePrivacyInput,
  type UpdateProfileInput,
  type UpdateShowcaseInput,
} from "../validation/profile";
import type {
  AchievementPreviewItem,
  FriendRequest,
  Friendship,
  LibraryPreviewItem,
  Profile,
  ProfileComment,
  ProfilePageData,
  ProfileShowcase,
  ProfileTheme,
  UserActivity,
  UserBadge,
  UserHardware,
  UserSocialLink,
  WishlistPreviewItem,
} from "../types/profile";
import {
  assertSingle,
  handleError,
  isMissingSchemaError,
  isMissingSchemaMessage,
  rowBoolean,
  rowConfig,
  rowNullableString,
  rowNumber,
  rowString,
  type UnknownRecord,
} from "./helpers";
import { STORAGE_KEYS } from "../storage-keys";

const hardwareFallbackStorageKey = STORAGE_KEYS.HARDWARE_FALLBACK;
const hardwareFallbackCache = new Map<string, UserHardware>();

const profileSelect = `
  id,
  username,
  display_name,
  avatar_url,
  banner_url,
  bio,
  country_code,
  language,
  timezone,
  profile_visibility,
  online_status_visibility,
  game_activity_visibility,
  achievement_visibility,
  library_visibility,
  wishlist_visibility,
  comments_visibility,
  profile_theme_id,
  featured_badge_id,
  featured_game_id,
  featured_achievement_id,
  profile_level,
  profile_xp,
  is_banned,
  is_deleted,
  last_seen_at,
  created_at,
  updated_at
`;

const baseProfileSelect = `
  id,
  username,
  display_name,
  avatar_url,
  banner_url,
  bio,
  country_code,
  language,
  timezone,
  profile_visibility,
  online_status_visibility,
  game_activity_visibility,
  achievement_visibility,
  is_banned,
  is_deleted,
  last_seen_at,
  created_at,
  updated_at
`;

function readHardwareFallbackStore() {
  try {
    if (typeof globalThis.localStorage === "undefined") {
      return {};
    }

    const rawValue = globalThis.localStorage.getItem(hardwareFallbackStorageKey);
    const parsedValue = rawValue ? JSON.parse(rawValue) : {};
    return parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue)
      ? (parsedValue as Record<string, UserHardware>)
      : {};
  } catch {
    return {};
  }
}

function writeHardwareFallbackStore(store: Record<string, UserHardware>) {
  try {
    if (typeof globalThis.localStorage !== "undefined") {
      globalThis.localStorage.setItem(hardwareFallbackStorageKey, JSON.stringify(store));
    }
  } catch {
    // In-memory fallback still keeps the current preview session working.
  }
}

function getHardwareFallback(userId: string) {
  const cached = hardwareFallbackCache.get(userId);
  if (cached) {
    return cached;
  }

  const stored = readHardwareFallbackStore()[userId] ?? null;
  if (stored) {
    hardwareFallbackCache.set(userId, stored);
  }

  return stored;
}

function saveHardwareFallback(userId: string, input: HardwareInput) {
  const now = new Date().toISOString();
  const existing = getHardwareFallback(userId);
  const hardware: UserHardware = {
    controller: input.controller ?? null,
    cpu: input.cpu ?? null,
    createdAt: existing?.createdAt ?? now,
    gpu: input.gpu ?? null,
    headset: input.headset ?? null,
    keyboard: input.keyboard ?? null,
    monitor: input.monitor ?? null,
    mouse: input.mouse ?? null,
    ram: input.ram ?? null,
    setupImageUrl: input.setupImageUrl ?? null,
    updatedAt: now,
    userId,
    visibility: input.visibility ?? "friends_only",
  };
  const store = readHardwareFallbackStore();
  store[userId] = hardware;
  hardwareFallbackCache.set(userId, hardware);
  writeHardwareFallbackStore(store);

  return hardware;
}

async function getCurrentUser() {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  handleError(error);

  if (!data.user) {
    throw new Error("You must be signed in.");
  }

  return data.user;
}

async function getCurrentUserId() {
  return (await getCurrentUser()).id;
}

function toProfile(row: UnknownRecord): Profile {
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
    profileVisibility: rowString(row, "profile_visibility", "public") as Profile["profileVisibility"],
    onlineStatusVisibility: rowString(row, "online_status_visibility", "public") as Profile["onlineStatusVisibility"],
    gameActivityVisibility: rowString(row, "game_activity_visibility", "friends_only") as Profile["gameActivityVisibility"],
    achievementVisibility: rowString(row, "achievement_visibility", "public") as Profile["achievementVisibility"],
    libraryVisibility: rowString(row, "library_visibility", "friends_only") as Profile["libraryVisibility"],
    wishlistVisibility: rowString(row, "wishlist_visibility", "public") as Profile["wishlistVisibility"],
    commentsVisibility: rowString(row, "comments_visibility", "friends_only") as Profile["commentsVisibility"],
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

function toTheme(row: UnknownRecord | null): ProfileTheme | null {
  if (!row) {
    return null;
  }

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

function toShowcase(row: UnknownRecord): ProfileShowcase {
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

function toBadge(row: UnknownRecord): UserBadge {
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

function toSocialLink(row: UnknownRecord): UserSocialLink {
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

function toHardware(row: UnknownRecord | null): UserHardware | null {
  if (!row) {
    return null;
  }

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
    visibility: rowString(row, "visibility", "friends_only") as UserHardware["visibility"],
    createdAt: rowString(row, "created_at"),
    updatedAt: rowString(row, "updated_at"),
  };
}

function toActivity(row: UnknownRecord): UserActivity {
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

function toComment(row: UnknownRecord): ProfileComment {
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

function profileUpdatePayload(input: UpdateProfileInput) {
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

function baseProfileUpdatePayload(input: UpdateProfileInput) {
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

export async function getProfileByUsername(username: string) {
  const client = getSupabaseClient();
  const initial = await client
    .from("profiles")
    .select(profileSelect)
    .eq("username", username)
    .maybeSingle();
  let data: unknown = initial.data;
  let error = initial.error;

  if (isMissingSchemaError(error)) {
    const retry = await client
      .from("profiles")
      .select(baseProfileSelect)
      .eq("username", username)
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }

  handleError(error);

  return data ? toProfile(data as UnknownRecord) : null;
}

export async function isUsernameAvailable(username: string) {
  const normalizedUsername = usernameSchema.parse(username.trim().toLowerCase());
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("is_username_available", {
    username_input: normalizedUsername,
  });

  if (!error && typeof data === "boolean") {
    return data;
  }

  const message = error?.message.toLowerCase() ?? "";
  const canFallback =
    !error ||
    error.code === "PGRST202" ||
    error.code === "42883" ||
    message.includes("is_username_available") ||
    message.includes("schema cache");

  if (!canFallback) {
    handleError(error);
  }

  const existingProfile = await getProfileByUsername(normalizedUsername);
  return !existingProfile;
}

export async function getProfileByUserId(userId: string) {
  const client = getSupabaseClient();
  const initial = await client
    .from("profiles")
    .select(profileSelect)
    .eq("id", userId)
    .maybeSingle();
  let data: unknown = initial.data;
  let error = initial.error;

  if (isMissingSchemaError(error)) {
    const retry = await client
      .from("profiles")
      .select(baseProfileSelect)
      .eq("id", userId)
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }

  handleError(error);

  return data ? toProfile(data as UnknownRecord) : null;
}

export async function searchProfiles(query: string) {
  const client = getSupabaseClient();
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  const initial = await client
    .from("profiles")
    .select(profileSelect)
    .or(`username.ilike.%${normalizedQuery}%,display_name.ilike.%${normalizedQuery}%`)
    .limit(12);
  let data: unknown = initial.data;
  let error = initial.error;

  if (isMissingSchemaError(error)) {
    const retry = await client
      .from("profiles")
      .select(baseProfileSelect)
      .or(`username.ilike.%${normalizedQuery}%,display_name.ilike.%${normalizedQuery}%`)
      .limit(12);
    data = retry.data;
    error = retry.error;
  }

  handleError(error);

  return (Array.isArray(data) ? data : []).map((row) =>
    toProfile(row as UnknownRecord),
  );
}

export async function getMyProfile() {
  const user = await getCurrentUser();
  const existingProfile = await getProfileByUserId(user.id);

  if (existingProfile) {
    return existingProfile;
  }

  return createProfileForCurrentUser(user);
}

async function createProfileForCurrentUser(user: User) {
  const client = getSupabaseClient();
  const metadata = user.user_metadata as Record<string, unknown>;
  const displayName =
    stringMeta(metadata, "display_name") ?? stringMeta(metadata, "full_name");
  const avatarUrl =
    stringMeta(metadata, "avatar_url") ?? stringMeta(metadata, "picture");
  const baseUsername = buildUsernameCandidate(
    stringMeta(metadata, "username") ??
      stringMeta(metadata, "user_name") ??
      user.email?.split("@")[0] ??
      `user_${user.id.slice(0, 8)}`,
  );

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const username =
      attempt === 0
        ? baseUsername
        : `${baseUsername.slice(0, 25)}_${user.id.replace(/-/g, "").slice(attempt, attempt + 6)}`;

    const { data, error } = await client
      .from("profiles")
      .insert({
        avatar_url: avatarUrl,
        display_name: displayName,
        id: user.id,
        username,
      })
      .select(baseProfileSelect)
      .single();

    if (!error) {
      return toProfile(data as UnknownRecord);
    }

    if (error.code === "23505") {
      const existingProfile = await getProfileByUserId(user.id);
      if (existingProfile) {
        return existingProfile;
      }
      continue;
    }

    handleError(error);
  }

  throw new Error("Could not create a profile for the current user.");
}

function stringMeta(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildUsernameCandidate(value: string) {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 32);

  return cleaned.length >= 3 ? cleaned : `user_${crypto.randomUUID().slice(0, 8)}`;
}

export async function getProfilePageData(username: string): Promise<ProfilePageData | null> {
  const profile = await getProfileByUsername(username);
  if (!profile) {
    return null;
  }

  const [
    theme,
    badges,
    socialLinks,
    hardware,
    showcases,
    comments,
    activity,
    libraryPreview,
    achievementPreview,
    wishlistPreview,
  ] = await Promise.all([
    profile.profileThemeId ? getProfileTheme(profile.profileThemeId) : Promise.resolve(null),
    getUserBadges(profile.id),
    getUserSocialLinks(profile.id),
    getUserHardware(profile.id),
    getPublicShowcases(profile.id),
    getProfileComments(profile.id),
    getUserActivity(profile.id),
    getUserLibraryPreview(profile.id),
    getUserAchievementPreview(profile.id),
    getUserWishlistPreview(profile.id),
  ]);

  return {
    profile,
    theme,
    badges,
    socialLinks,
    hardware,
    showcases,
    comments,
    activity,
    libraryPreview,
    achievementPreview,
    wishlistPreview,
    stats: {
      gamesOwned: libraryPreview.length,
      achievementsUnlocked: achievementPreview.length,
      playtimeMinutes: libraryPreview.reduce(
        (total, item) => total + item.playtimeMinutes,
        0,
      ),
      friendsCount: 0,
    },
  };
}

export async function updateMyProfile(input: UpdateProfileInput) {
  const parsed = updateProfileSchema.parse(input);
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const initial = await client
    .from("profiles")
    .update(profileUpdatePayload(parsed))
    .eq("id", userId)
    .select(profileSelect)
    .single();
  let data: unknown = initial.data;
  let error = initial.error;

  if (isMissingSchemaError(error)) {
    const retry = await client
      .from("profiles")
      .update(baseProfileUpdatePayload(parsed))
      .eq("id", userId)
      .select(baseProfileSelect)
      .single();
    data = retry.data;
    error = retry.error;
  }

  handleError(error);

  return toProfile(data as UnknownRecord);
}

export async function updateMyProfilePrivacy(input: UpdatePrivacyInput) {
  const parsed = updatePrivacySchema.parse(input);
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const { data, error } = await client
    .from("profiles")
    .update({
      profile_visibility: parsed.profileVisibility,
      online_status_visibility: parsed.onlineStatusVisibility,
      game_activity_visibility: parsed.gameActivityVisibility,
      achievement_visibility: parsed.achievementVisibility,
      library_visibility: parsed.libraryVisibility,
      wishlist_visibility: parsed.wishlistVisibility,
      comments_visibility: parsed.commentsVisibility,
    })
    .eq("id", userId)
    .select(profileSelect)
    .single();
  handleError(error);

  return toProfile(data as UnknownRecord);
}

export async function updateMyProfileTheme(themeId: string | null) {
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const { data, error } = await client
    .from("profiles")
    .update({ profile_theme_id: themeId })
    .eq("id", userId)
    .select(profileSelect)
    .single();
  if (isMissingSchemaError(error)) {
    return assertSingle(
      await getProfileByUserId(userId),
      "Profile was not found for the current user.",
    );
  }
  handleError(error);

  return toProfile(data as UnknownRecord);
}

async function uploadProfileAsset(bucket: "avatars" | "profile-banners", file: File) {
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
  });
  handleError(error);

  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export function uploadAvatar(file: File) {
  return uploadProfileAsset("avatars", file);
}

export function uploadBanner(file: File) {
  return uploadProfileAsset("profile-banners", file);
}

async function getProfileTheme(themeId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("profile_themes")
    .select("*")
    .eq("id", themeId)
    .maybeSingle();
  if (isMissingSchemaError(error)) {
    return null;
  }
  handleError(error);

  return toTheme(data as UnknownRecord | null);
}

export async function getProfileThemes() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("profile_themes")
    .select("*")
    .eq("is_active", true)
    .order("name");
  if (isMissingSchemaError(error)) {
    return [];
  }
  handleError(error);

  return (data ?? [])
    .map((row) => toTheme(row as UnknownRecord))
    .filter((theme): theme is ProfileTheme => Boolean(theme));
}

export async function getMyShowcases() {
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const { data, error } = await client
    .from("profile_showcases")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order");
  if (isMissingSchemaError(error)) {
    return [];
  }
  handleError(error);

  return (data ?? []).map((row) => toShowcase(row as UnknownRecord));
}

async function getPublicShowcases(userId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("profile_showcases")
    .select("*")
    .eq("user_id", userId)
    .eq("is_enabled", true)
    .order("sort_order");
  if (isMissingSchemaError(error)) {
    return [];
  }
  handleError(error);

  return (data ?? []).map((row) => toShowcase(row as UnknownRecord));
}

export async function updateShowcases(showcases: ProfileShowcase[]) {
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const payload = showcases.map((showcase, index) => ({
    id: showcase.id,
    user_id: userId,
    type: showcase.type,
    title: showcase.title,
    sort_order: index,
    visibility: showcase.visibility,
    config: showcase.config as unknown as string,
    is_enabled: showcase.isEnabled,
  }));
  const { data, error } = await client
    .from("profile_showcases")
    .upsert(payload as unknown as { user_id: string; type: string; sort_order: number }[])
    .select("*")
    .order("sort_order");
  handleError(error);

  return (data ?? []).map((row) => toShowcase(row as UnknownRecord));
}

export async function createShowcase(input: CreateShowcaseInput) {
  const parsed = createShowcaseSchema.parse(input);
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const { data, error } = await client
    .from("profile_showcases")
    .insert({
      user_id: userId,
      type: parsed.type,
      title: parsed.title,
      sort_order: parsed.sortOrder,
      visibility: parsed.visibility,
      config: parsed.config as unknown as string,
      is_enabled: parsed.isEnabled,
    })
    .select("*")
    .single();
  handleError(error);

  return toShowcase(data as UnknownRecord);
}

export async function ensureMyHardwareShowcase(visibility: ProfileShowcase["visibility"]) {
  try {
    const showcases = await getMyShowcases();
    const existing = showcases.find((showcase) => showcase.type === "hardware_setup");

    if (!existing) {
      return createShowcase({
        config: {},
        isEnabled: true,
        sortOrder: showcases.length,
        title: "Hardware Rig",
        type: "hardware_setup",
        visibility,
      });
    }

    if (
      existing.isEnabled &&
      existing.visibility === visibility &&
      existing.title === "Hardware Rig"
    ) {
      return existing;
    }

    return updateShowcase(existing.id, {
      config: existing.config,
      isEnabled: true,
      sortOrder: existing.sortOrder,
      title: "Hardware Rig",
      visibility,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (isMissingSchemaMessage(message)) {
      return null;
    }

    throw error;
  }
}

export async function updateShowcase(id: string, input: UpdateShowcaseInput) {
  const parsed = updateShowcaseSchema.parse(input);
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const { data, error } = await client
    .from("profile_showcases")
    .update({
      title: parsed.title,
      sort_order: parsed.sortOrder,
      visibility: parsed.visibility,
      config: parsed.config as unknown as string,
      is_enabled: parsed.isEnabled,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  handleError(error);

  return toShowcase(data as UnknownRecord);
}

export async function deleteShowcase(id: string) {
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const { error } = await client
    .from("profile_showcases")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  handleError(error);
}

export async function reorderShowcases(idsInOrder: string[]) {
  const showcases = await getMyShowcases();
  const ordered = idsInOrder
    .map((id) => showcases.find((showcase) => showcase.id === id))
    .filter((showcase): showcase is ProfileShowcase => Boolean(showcase));

  return updateShowcases(ordered);
}

export async function sendFriendRequest(userId: string) {
  const client = getSupabaseClient();
  const requesterId = await getCurrentUserId();
  const { data, error } = await client
    .from("friendships")
    .insert({ requester_id: requesterId, addressee_id: userId, status: "pending" })
    .select("*")
    .single();
  handleError(error);
  return toFriendship(data as UnknownRecord);
}

export function acceptFriendRequest(friendshipId: string) {
  return updateFriendshipStatus(friendshipId, "accepted");
}

export function declineFriendRequest(friendshipId: string) {
  return updateFriendshipStatus(friendshipId, "declined");
}

async function updateFriendshipStatus(friendshipId: string, status: Friendship["status"]) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("friendships")
    .update({ status, responded_at: new Date().toISOString() })
    .eq("id", friendshipId)
    .select("*")
    .single();
  handleError(error);
  return toFriendship(data as UnknownRecord);
}

export async function removeFriend(userId: string) {
  const client = getSupabaseClient();
  const currentUserId = await getCurrentUserId();
  const { error } = await client
    .from("friendships")
    .delete()
    .or(`and(requester_id.eq.${currentUserId},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${currentUserId})`);
  handleError(error);
}

export async function blockUser(userId: string) {
  const client = getSupabaseClient();
  const currentUserId = await getCurrentUserId();
  const { error } = await client
    .from("user_blocks")
    .insert({ blocker_id: currentUserId, blocked_id: userId });
  handleError(error);
}

export async function unblockUser(userId: string) {
  const client = getSupabaseClient();
  const currentUserId = await getCurrentUserId();
  const { error } = await client
    .from("user_blocks")
    .delete()
    .eq("blocker_id", currentUserId)
    .eq("blocked_id", userId);
  handleError(error);
}

export async function getFriends(userId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("friendships")
    .select("*")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .eq("status", "accepted");
  handleError(error);
  return (data ?? []).map((row) => toFriendship(row as UnknownRecord));
}

export async function getMyFriendRequests(): Promise<FriendRequest[]> {
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const { data, error } = await client
    .from("friendships")
    .select("*")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .eq("status", "pending");
  handleError(error);
  return (data ?? []).map((row) => toFriendship(row as UnknownRecord));
}

function toFriendship(row: UnknownRecord): Friendship {
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

async function getProfileComments(profileUserId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("profile_comments")
    .select("*")
    .eq("profile_user_id", profileUserId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (isMissingSchemaError(error)) {
    return [];
  }
  handleError(error);
  return (data ?? []).map((row) => toComment(row as UnknownRecord));
}

export async function addProfileComment(profileUserId: string, body: string) {
  const parsed = commentSchema.parse({ body });
  const client = getSupabaseClient();
  const authorId = await getCurrentUserId();
  const { data, error } = await client
    .from("profile_comments")
    .insert({ profile_user_id: profileUserId, author_id: authorId, body: parsed.body })
    .select("*")
    .single();
  handleError(error);
  return toComment(data as UnknownRecord);
}

export async function deleteProfileComment(commentId: string) {
  const client = getSupabaseClient();
  const { error } = await client
    .from("profile_comments")
    .delete()
    .eq("id", commentId);
  handleError(error);
}

export async function updateProfileComment(commentId: string, body: string) {
  const parsed = commentSchema.parse({ body });
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("profile_comments")
    .update({ body: parsed.body })
    .eq("id", commentId)
    .select("*")
    .single();
  handleError(error);
  return toComment(data as UnknownRecord);
}

export async function getUserBadges(userId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("user_badges")
    .select("*")
    .eq("user_id", userId)
    .order("earned_at", { ascending: false })
    .limit(12);
  if (isMissingSchemaError(error)) {
    return [];
  }
  handleError(error);
  return (data ?? []).map((row) => toBadge(row as UnknownRecord));
}

export async function getUserActivity(userId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("user_activity")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (isMissingSchemaError(error)) {
    return [];
  }
  handleError(error);
  return (data ?? []).map((row) => toActivity(row as UnknownRecord));
}

export async function getUserLibraryPreview(userId: string): Promise<LibraryPreviewItem[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("user_library")
    .select("id, game_id")
    .eq("user_id", userId)
    .limit(6);
  if (isMissingSchemaError(error)) {
    return [];
  }
  handleError(error);

  const libraryItems = (data ?? []).map((row) => row as UnknownRecord);
  const gameIds = Array.from(new Set(libraryItems.map((row) => rowString(row, "game_id")).filter(Boolean)));

  let gamesById = new Map<string, UnknownRecord>();
  if (gameIds.length > 0) {
    const { data: gamesData, error: gamesError } = await client
      .from("games")
      .select("id, title, cover_url")
      .in("id", gameIds);
    if (isMissingSchemaError(gamesError)) {
      return [];
    }
    handleError(gamesError);

    gamesById = new Map(
      (gamesData ?? []).map((row) => {
        const record = row as UnknownRecord;
        return [rowString(record, "id"), record];
      }),
    );
  }

  let statsByGameId = new Map<string, UnknownRecord>();
  if (gameIds.length > 0) {
    const { data: statsData, error: statsError } = await client
      .from("user_game_stats")
      .select("game_id, playtime_minutes, last_played_at")
      .eq("user_id", userId)
      .in("game_id", gameIds);
    if (!isMissingSchemaError(statsError)) {
      handleError(statsError);

      statsByGameId = new Map(
        (statsData ?? []).map((row) => {
          const record = row as UnknownRecord;
          return [rowString(record, "game_id"), record];
        }),
      );
    }
  }

  return libraryItems.map((record) => {
    const gameId = rowString(record, "game_id");
    const game = gamesById.get(gameId) ?? null;
    const stats = statsByGameId.get(gameId) ?? {};

    return {
      id: rowString(record, "id"),
      gameId,
      title: game ? rowString(game, "title", "Unknown Game") : "Unknown Game",
      coverUrl: game ? rowNullableString(game, "cover_url") : null,
      playtimeMinutes: rowNumber(stats, "playtime_minutes"),
      lastPlayedAt: rowNullableString(stats, "last_played_at"),
    };
  });
}

export async function getUserAchievementPreview(userId: string): Promise<AchievementPreviewItem[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("user_achievements")
    .select("id, achievement_id, game_id, unlocked_at")
    .eq("user_id", userId)
    .order("unlocked_at", { ascending: false })
    .limit(8);
  if (isMissingSchemaError(error)) {
    return [];
  }
  handleError(error);

  const achievementUnlocks = (data ?? []).map((row) => row as UnknownRecord);
  const achievementIds = Array.from(
    new Set(achievementUnlocks.map((row) => rowString(row, "achievement_id")).filter(Boolean)),
  );
  const gameIds = Array.from(new Set(achievementUnlocks.map((row) => rowString(row, "game_id")).filter(Boolean)));

  let achievementsById = new Map<string, UnknownRecord>();
  if (achievementIds.length > 0) {
    const { data: achievementsData, error: achievementsError } = await client
      .from("achievements")
      .select("id, name, description, icon_url, rarity")
      .in("id", achievementIds);
    if (isMissingSchemaError(achievementsError)) {
      return [];
    }
    handleError(achievementsError);

    achievementsById = new Map(
      (achievementsData ?? []).map((row) => {
        const record = row as UnknownRecord;
        return [rowString(record, "id"), record];
      }),
    );
  }

  let gamesById = new Map<string, UnknownRecord>();
  if (gameIds.length > 0) {
    const { data: gamesData, error: gamesError } = await client
      .from("games")
      .select("id, title")
      .in("id", gameIds);
    if (isMissingSchemaError(gamesError)) {
      return [];
    }
    handleError(gamesError);

    gamesById = new Map(
      (gamesData ?? []).map((row) => {
        const record = row as UnknownRecord;
        return [rowString(record, "id"), record];
      }),
    );
  }

  return achievementUnlocks.map((record) => {
    const achievementId = rowString(record, "achievement_id");
    const gameId = rowString(record, "game_id");
    const achievement = achievementsById.get(achievementId) ?? null;
    const game = gamesById.get(gameId) ?? null;

    return {
      id: rowString(record, "id"),
      achievementId,
      gameId,
      gameTitle: game ? rowNullableString(game, "title") : null,
      name: achievement ? rowString(achievement, "name", "Achievement") : "Achievement",
      description: achievement ? rowNullableString(achievement, "description") : null,
      iconUrl: achievement ? rowNullableString(achievement, "icon_url") : null,
      rarity: achievement
        ? (rowString(achievement, "rarity", "common") as AchievementPreviewItem["rarity"])
        : "common",
      unlockedAt: rowString(record, "unlocked_at"),
    };
  });
}

export async function getUserWishlistPreview(userId: string): Promise<WishlistPreviewItem[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("user_wishlist")
    .select("id, game_id, added_at, games(title, cover_url)")
    .eq("user_id", userId)
    .order("added_at", { ascending: false })
    .limit(6);
  handleError(error);

  return (data ?? []).map((row) => {
    const record = row as UnknownRecord;
    const game = record.games as UnknownRecord | null;
    return {
      id: rowString(record, "id"),
      gameId: rowString(record, "game_id"),
      title: game ? rowString(game, "title", "Unknown Game") : "Unknown Game",
      coverUrl: game ? rowNullableString(game, "cover_url") : null,
      addedAt: rowString(record, "added_at"),
    };
  });
}

export async function getUserHardware(userId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("user_hardware")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (isMissingSchemaError(error)) {
    return getHardwareFallback(userId);
  }
  handleError(error);
  return toHardware(data as UnknownRecord | null);
}

export async function updateMyHardware(input: HardwareInput) {
  const parsed = hardwareSchema.parse(input);
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const { data, error } = await client
    .from("user_hardware")
    .upsert({ user_id: userId, ...toHardwarePayload(parsed) })
    .select("*")
    .single();
  if (isMissingSchemaError(error)) {
    return saveHardwareFallback(userId, parsed);
  }
  handleError(error);
  return toHardware(data as UnknownRecord);
}

function toHardwarePayload(input: HardwareInput) {
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

export async function getUserSocialLinks(userId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("user_social_links")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order");
  if (isMissingSchemaError(error)) {
    return [];
  }
  handleError(error);
  return (data ?? []).map((row) => toSocialLink(row as UnknownRecord));
}

export async function updateMySocialLinks(links: SocialLinksInput) {
  const parsed = socialLinksSchema.parse(links);
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();

  const { error: deleteError } = await client
    .from("user_social_links")
    .delete()
    .eq("user_id", userId);
  if (isMissingSchemaError(deleteError)) {
    return [];
  }
  handleError(deleteError);

  if (parsed.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("user_social_links")
    .insert(
      parsed.map((link, index) => ({
        user_id: userId,
        platform: link.platform,
        label: link.label,
        url: link.url,
        sort_order: link.sortOrder ?? index,
      })),
    )
    .select("*")
    .order("sort_order");
  handleError(error);
  return (data ?? []).map((row) => toSocialLink(row as UnknownRecord));
}

// TODO: Move writes for badges, XP, entitlements, playtime, and achievements to
// a secure backend/service_role API before production. This client only reads
// those surfaces under Supabase RLS.
