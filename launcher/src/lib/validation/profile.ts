import { z } from "zod";

const visibilitySchema = z.enum(["public", "friends_only", "private"]);

export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters.")
  .max(32, "Username must be 32 characters or less.")
  .regex(
    /^[A-Za-z0-9_.-]+$/,
    "Username can only contain letters, numbers, underscore, dot, and dash.",
  );

export const updateProfileSchema = z.object({
  username: usernameSchema.optional(),
  displayName: z.string().max(64).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  bio: z.string().max(1000).nullable().optional(),
  countryCode: z.string().length(2).nullable().optional(),
  language: z.string().min(2).max(12).optional(),
  timezone: z.string().max(64).nullable().optional(),
  featuredGameId: z.string().uuid().nullable().optional(),
  featuredAchievementId: z.string().uuid().nullable().optional(),
  featuredBadgeId: z.string().uuid().nullable().optional(),
});

export const updatePrivacySchema = z.object({
  profileVisibility: visibilitySchema,
  onlineStatusVisibility: visibilitySchema,
  gameActivityVisibility: visibilitySchema,
  achievementVisibility: visibilitySchema,
  libraryVisibility: visibilitySchema,
  wishlistVisibility: visibilitySchema,
  commentsVisibility: visibilitySchema,
});

const showcaseTypeSchema = z.enum([
  "about",
  "favorite_games",
  "rare_achievements",
  "latest_achievements",
  "completionist",
  "screenshots",
  "stats",
  "collections",
  "reviews",
  "wishlist",
  "activity",
  "friends",
  "hardware_setup",
  "custom_text",
  "trophy_case",
]);

export const createShowcaseSchema = z.object({
  type: showcaseTypeSchema,
  title: z.string().max(80).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  visibility: visibilitySchema.optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  isEnabled: z.boolean().optional(),
});

export const updateShowcaseSchema = createShowcaseSchema.partial();

export const commentSchema = z.object({
  body: z.string().trim().min(1).max(1000),
});

export const socialLinksSchema = z.array(
  z.object({
    id: z.string().uuid().optional(),
    platform: z.string().min(1).max(32),
    label: z.string().max(64).nullable().optional(),
    url: z.string().url(),
    sortOrder: z.number().int().min(0).optional(),
  }),
);

export const hardwareSchema = z.object({
  cpu: z.string().max(120).nullable().optional(),
  gpu: z.string().max(120).nullable().optional(),
  ram: z.string().max(120).nullable().optional(),
  monitor: z.string().max(120).nullable().optional(),
  keyboard: z.string().max(120).nullable().optional(),
  mouse: z.string().max(120).nullable().optional(),
  headset: z.string().max(120).nullable().optional(),
  controller: z.string().max(120).nullable().optional(),
  setupImageUrl: z.string().url().nullable().optional(),
  visibility: visibilitySchema.optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdatePrivacyInput = z.infer<typeof updatePrivacySchema>;
export type CreateShowcaseInput = z.infer<typeof createShowcaseSchema>;
export type UpdateShowcaseInput = z.infer<typeof updateShowcaseSchema>;
export type SocialLinksInput = z.infer<typeof socialLinksSchema>;
export type HardwareInput = z.infer<typeof hardwareSchema>;
