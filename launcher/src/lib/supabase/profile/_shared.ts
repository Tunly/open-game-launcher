import { getSupabaseClient } from "../client";
import type { HardwareInput } from "../../validation/profile";
import type { UserHardware } from "../../types/profile";
import { handleError } from "../helpers";
import { STORAGE_KEYS } from "../../storage-keys";

// ---------------------------------------------------------------------------
// Supabase SELECT fragments
// ---------------------------------------------------------------------------

export const profileSelect = `
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

export const baseProfileSelect = `
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

// ---------------------------------------------------------------------------
// Hardware fallback (localStorage)
// ---------------------------------------------------------------------------

const hardwareFallbackStorageKey = STORAGE_KEYS.HARDWARE_FALLBACK;
const hardwareFallbackCache = new Map<string, UserHardware>();

function readHardwareFallbackStore() {
  try {
    if (typeof globalThis.localStorage === "undefined") return {};
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
    /* In-memory fallback keeps the session working. */
  }
}

export function getHardwareFallback(userId: string) {
  const cached = hardwareFallbackCache.get(userId);
  if (cached) return cached;
  const stored = readHardwareFallbackStore()[userId] ?? null;
  if (stored) hardwareFallbackCache.set(userId, stored);
  return stored;
}

export function saveHardwareFallback(userId: string, input: HardwareInput) {
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

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

export async function getCurrentUser() {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  handleError(error);
  if (!data.user) throw new Error("You must be signed in.");
  return data.user;
}

export async function getCurrentUserId() {
  return (await getCurrentUser()).id;
}

// ---------------------------------------------------------------------------
// Profile metadata helpers
// ---------------------------------------------------------------------------

export function stringMeta(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function buildUsernameCandidate(value: string) {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 32);
  return cleaned.length >= 3 ? cleaned : `user_${crypto.randomUUID().slice(0, 8)}`;
}
