import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  requireCurrentSupabaseUser: vi.fn(),
}));

vi.mock("../client", () => ({
  getSupabaseClient: () => ({
    from: mocks.from,
  }),
  requireCurrentSupabaseUser: mocks.requireCurrentSupabaseUser,
}));

import { updateMyAppShellSkin, updateMyCustomTheme, updateMyProfileTheme } from "../profile";
import { toTheme } from "../profile/schemas";
import type { ProfileTheme } from "../../types/profile";

describe("updateMyProfileTheme", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.requireCurrentSupabaseUser.mockReset();
    mocks.requireCurrentSupabaseUser.mockResolvedValue({ id: "user-1" });
  });

  it("writes a catalog profile theme id to the current profile", async () => {
    const updateChain = createUpdateChain({
      data: makeProfileRow({ profile_theme_id: "catalog-theme" }),
      error: null,
    });
    mocks.from.mockReturnValue(updateChain);

    const profile = await updateMyProfileTheme("catalog-theme");

    expect(mocks.from).toHaveBeenCalledWith("profiles");
    expect(updateChain.update).toHaveBeenCalledWith({ profile_theme_id: "catalog-theme" });
    expect(updateChain.eq).toHaveBeenCalledWith("id", "user-1");
    expect(updateChain.select).toHaveBeenCalledWith(expect.stringContaining("profile_theme_id"));
    expect(profile.profileThemeId).toBe("catalog-theme");
  });

  it("writes a null profile theme reset to the current profile", async () => {
    const updateChain = createUpdateChain({
      data: makeProfileRow({ profile_theme_id: null }),
      error: null,
    });
    mocks.from.mockReturnValue(updateChain);

    const profile = await updateMyProfileTheme(null);

    expect(updateChain.update).toHaveBeenCalledWith({ profile_theme_id: null });
    expect(profile.profileThemeId).toBeNull();
  });

  it("falls back to the current profile when the hosted profile-theme column is absent", async () => {
    const updateChain = createUpdateChain({
      data: null,
      error: { code: "42703", message: "column profile_theme_id does not exist" },
    });
    const selectChain = createSelectChain({
      data: makeProfileRow({ profile_theme_id: null }),
      error: null,
    });
    mocks.from.mockReturnValueOnce(updateChain).mockReturnValueOnce(selectChain);

    const profile = await updateMyProfileTheme("catalog-theme");

    expect(updateChain.update).toHaveBeenCalledWith({ profile_theme_id: "catalog-theme" });
    expect(selectChain.select).toHaveBeenCalled();
    expect(profile.id).toBe("user-1");
    expect(profile.profileThemeId).toBeNull();
  });
});

describe("updateMyAppShellSkin", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.requireCurrentSupabaseUser.mockReset();
    mocks.requireCurrentSupabaseUser.mockResolvedValue({ id: "user-1" });
  });

  it("writes a hosted built-in shell skin preference to the current profile", async () => {
    const updateChain = createUpdateChain({
      data: makeProfileRow({ app_shell_skin: "teal-print" }),
      error: null,
    });
    mocks.from.mockReturnValue(updateChain);

    const profile = await updateMyAppShellSkin("teal-print");

    expect(mocks.from).toHaveBeenCalledWith("profiles");
    expect(updateChain.update).toHaveBeenCalledWith({ app_shell_skin: "teal-print" });
    expect(updateChain.eq).toHaveBeenCalledWith("id", "user-1");
    expect(updateChain.select).toHaveBeenCalledWith(expect.stringContaining("app_shell_skin"));
    expect(profile.appShellSkinId).toBe("teal-print");
  });

  it("normalizes unknown shell skin values before hosted writes", async () => {
    const updateChain = createUpdateChain({
      data: makeProfileRow({ app_shell_skin: "retro-paper" }),
      error: null,
    });
    mocks.from.mockReturnValue(updateChain);

    const profile = await updateMyAppShellSkin("bad-skin" as never);

    expect(updateChain.update).toHaveBeenCalledWith({ app_shell_skin: "retro-paper" });
    expect(profile.appShellSkinId).toBe("retro-paper");
  });

  it("fails closed when the hosted shell-skin column is absent", async () => {
    const updateChain = createUpdateChain({
      data: null,
      error: { code: "42703", message: "column app_shell_skin does not exist" },
    });
    mocks.from.mockReturnValue(updateChain);

    await expect(updateMyAppShellSkin("redline-print")).rejects.toThrow(
      "Supabase profiles.app_shell_skin is unavailable",
    );

    expect(updateChain.update).toHaveBeenCalledWith({ app_shell_skin: "redline-print" });
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
});

describe("updateMyCustomTheme", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.requireCurrentSupabaseUser.mockReset();
    mocks.requireCurrentSupabaseUser.mockResolvedValue({ id: "user-1" });
  });

  it("writes a validated custom theme exchange payload to the current profile", async () => {
    const theme = makeTheme({ name: "Hosted Teal Draft" });
    const updateChain = createUpdateChain({
      data: makeProfileRow({
        custom_theme_json: {
          exportedAt: "2026-06-12T10:00:00.000Z",
          schema: "og-launcher.profile-theme",
          theme: {
            accentColor: "#007166",
            backgroundType: "solid",
            backgroundValue: "#fff9ed",
            cardStyle: "pixel",
            description: "Theme fixture.",
            name: "Hosted Teal Draft",
            textColor: "#171411",
          },
          version: 1,
        },
        profile_theme_id: null,
      }),
      error: null,
    });
    mocks.from.mockReturnValue(updateChain);

    const profile = await updateMyCustomTheme(theme);

    expect(mocks.from).toHaveBeenCalledWith("profiles");
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        custom_theme_json: expect.objectContaining({
          schema: "og-launcher.profile-theme",
          theme: expect.objectContaining({
            name: "Hosted Teal Draft",
            backgroundType: "solid",
          }),
          version: 1,
        }),
        profile_theme_id: null,
      }),
    );
    expect(updateChain.select).toHaveBeenCalledWith(expect.stringContaining("custom_theme_json"));
    expect(profile.customTheme?.name).toBe("Hosted Teal Draft");
    expect(profile.profileThemeId).toBeNull();
  });

  it("clears the hosted custom theme draft without touching the selected catalog theme", async () => {
    const updateChain = createUpdateChain({
      data: makeProfileRow({ custom_theme_json: null, profile_theme_id: "catalog-theme" }),
      error: null,
    });
    mocks.from.mockReturnValue(updateChain);

    const profile = await updateMyCustomTheme(null);

    expect(updateChain.update).toHaveBeenCalledWith({ custom_theme_json: null });
    expect(profile.customTheme).toBeNull();
    expect(profile.profileThemeId).toBe("catalog-theme");
  });

  it("fails closed when the hosted custom-theme column is absent", async () => {
    const updateChain = createUpdateChain({
      data: null,
      error: { code: "42703", message: "column custom_theme_json does not exist" },
    });
    mocks.from.mockReturnValue(updateChain);

    await expect(updateMyCustomTheme(makeTheme())).rejects.toThrow(
      "Supabase profiles.custom_theme_json is unavailable",
    );

    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        custom_theme_json: expect.objectContaining({ schema: "og-launcher.profile-theme" }),
        profile_theme_id: null,
      }),
    );
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
});

describe("toTheme", () => {
  it("defaults missing hosted theme style fields to Retro Manga-safe values", () => {
    const theme = toTheme({
      created_at: "2026-06-12T10:00:00.000Z",
      id: "theme-1",
      is_active: true,
      is_premium: false,
      key: "theme-1",
      name: "Theme 1",
    });

    expect(theme?.backgroundType).toBe("solid");
    expect(theme?.cardStyle).toBe("pixel");
  });
});

function createUpdateChain(response: {
  data: unknown;
  error: null | { code?: string; message: string };
}) {
  const chain = {
    eq: vi.fn(() => chain),
    select: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(response)),
    update: vi.fn(() => chain),
  };
  return chain;
}

function createSelectChain(response: {
  data: unknown;
  error: null | { code?: string; message: string };
}) {
  const chain = {
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(response)),
    select: vi.fn(() => chain),
  };
  return chain;
}

function makeProfileRow(patch: Record<string, unknown> = {}) {
  return {
    achievement_visibility: "public",
    app_shell_skin: null,
    avatar_url: null,
    banner_url: null,
    bio: "Profile fixture",
    comments_visibility: "public",
    country_code: "DE",
    created_at: "2026-06-12T10:00:00.000Z",
    custom_theme_json: null,
    display_name: "Profile Fixture",
    featured_achievement_id: null,
    featured_badge_id: null,
    featured_game_id: null,
    game_activity_visibility: "friends_only",
    id: "user-1",
    is_banned: false,
    is_deleted: false,
    language: "en",
    last_seen_at: "2026-06-12T10:00:00.000Z",
    library_visibility: "friends_only",
    online_status_visibility: "public",
    profile_level: 1,
    profile_theme_id: null,
    profile_visibility: "public",
    profile_xp: 0,
    timezone: "Europe/Berlin",
    updated_at: "2026-06-12T10:00:00.000Z",
    username: "profile-fixture",
    wishlist_visibility: "public",
    ...patch,
  };
}

function makeTheme(patch: Partial<ProfileTheme> = {}): ProfileTheme {
  return {
    accentColor: "#007166",
    backgroundType: "solid",
    backgroundValue: "#fff9ed",
    cardStyle: "pixel",
    createdAt: "2026-06-12T10:00:00.000Z",
    description: "Theme fixture.",
    id: "local-custom-theme-hosted-teal-draft",
    isActive: true,
    isPremium: false,
    key: "custom-hosted-teal-draft",
    name: "Hosted Teal Draft",
    textColor: "#171411",
    ...patch,
  };
}
