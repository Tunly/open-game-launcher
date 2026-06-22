import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditProfilePage } from "./EditProfilePage";

const LOCAL_PROFILE_EDITOR_KEY = "og-launcher:profile-editor-draft:v1";

const currentUserMock = vi.hoisted(() => vi.fn());
const profileMocks = vi.hoisted(() => ({
  ensureMyHardwareShowcase: vi.fn(),
  getMyProfile: vi.fn(),
  getProfileThemes: vi.fn(),
  getUserHardware: vi.fn(),
  getUserSocialLinks: vi.fn(),
  isUsernameAvailable: vi.fn(),
  updateMyHardware: vi.fn(),
  updateMyProfile: vi.fn(),
  updateMyProfileTheme: vi.fn(),
  updateMySocialLinks: vi.fn(),
  uploadAvatar: vi.fn(),
  uploadBanner: vi.fn(),
}));

vi.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: () => currentUserMock(),
}));

vi.mock("../lib/launcher", () => ({
  detectHardwareInfo: vi.fn(),
}));

vi.mock("../lib/supabase/profile", () => ({
  ensureMyHardwareShowcase: profileMocks.ensureMyHardwareShowcase,
  getMyProfile: profileMocks.getMyProfile,
  getProfileThemes: profileMocks.getProfileThemes,
  getUserHardware: profileMocks.getUserHardware,
  getUserSocialLinks: profileMocks.getUserSocialLinks,
  isUsernameAvailable: profileMocks.isUsernameAvailable,
  updateMyHardware: profileMocks.updateMyHardware,
  updateMyProfile: profileMocks.updateMyProfile,
  updateMyProfileTheme: profileMocks.updateMyProfileTheme,
  updateMySocialLinks: profileMocks.updateMySocialLinks,
  uploadAvatar: profileMocks.uploadAvatar,
  uploadBanner: profileMocks.uploadBanner,
}));

beforeEach(() => {
  window.history.replaceState(null, "", "/settings/profile");
  currentUserMock.mockReturnValue({
    isConfigured: false,
    isLoading: false,
    session: null,
    user: null,
  });
  Object.values(profileMocks).forEach((mock) => mock.mockReset());
  profileMocks.getProfileThemes.mockResolvedValue([]);
  profileMocks.getUserHardware.mockResolvedValue(null);
  profileMocks.getUserSocialLinks.mockResolvedValue([]);
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

function renderEditProfilePage() {
  return render(
    <MemoryRouter>
      <EditProfilePage />
    </MemoryRouter>,
  ).container;
}

describe("EditProfilePage local image drafts", () => {
  it("stores local uploaded avatar images as data URLs instead of blob URLs", async () => {
    const container = renderEditProfilePage();

    await waitFor(() => {
      expect(container).toHaveTextContent("Save Local Draft");
    });

    const [avatarInput] = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="file"]'),
    );
    const file = new File([new Uint8Array([137, 80, 78, 71])], "avatar.png", {
      type: "image/png",
    });
    fireEvent.change(avatarInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(container).toHaveTextContent("Avatar staged as a local browser draft asset.");
    });

    const form = container.querySelector("form");
    if (!form) throw new Error("Expected edit profile form to render.");
    fireEvent.submit(form);

    await waitFor(() => {
      const draft = window.localStorage.getItem(LOCAL_PROFILE_EDITOR_KEY) ?? "";
      expect(draft).toContain("data:image/png");
      expect(draft).not.toContain("blob:");
    });
  });

  it("falls back to the local editor when configured Supabase profile schema is missing", async () => {
    currentUserMock.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      session: { user: { id: "user-1" } },
      user: { id: "user-1" },
    });
    profileMocks.getMyProfile.mockRejectedValue(
      new Error("Could not find the profiles table in the schema cache"),
    );

    const container = renderEditProfilePage();

    await waitFor(() => {
      expect(container).toHaveTextContent("Profile schema fallback active");
      expect(container).toHaveTextContent("Save Local Draft");
      expect(container).toHaveTextContent("Local Editor");
    });
  });
});

describe("EditProfilePage social-link visibility editor", () => {
  it("renders the social-link visibility verify route without Supabase calls", async () => {
    window.history.replaceState(null, "", "/settings/profile?verify=social-link-visibility-editor");

    const container = renderEditProfilePage();

    await waitFor(() => {
      expect(container).toHaveTextContent("Social-link visibility editor verification active");
      expect(inputValues(container)).toEqual(
        expect.arrayContaining(["Public Proof", "Friends Lobby", "Private Discord"]),
      );
      expect(selectValues(container)).toEqual(
        expect.arrayContaining(["public", "friends_only", "private"]),
      );
      expect(profileMocks.getMyProfile).not.toHaveBeenCalled();
      expect(profileMocks.getUserSocialLinks).not.toHaveBeenCalled();
    });
  });

  it("stores social link visibility in local profile drafts", async () => {
    window.history.replaceState(null, "", "/settings/profile?verify=social-link-visibility-editor");
    const container = renderEditProfilePage();

    await waitFor(() => {
      expect(container).toHaveTextContent("Save Local Draft");
    });

    const form = container.querySelector("form");
    if (!form) throw new Error("Expected edit profile form to render.");
    fireEvent.submit(form);

    await waitFor(() => {
      const draft = JSON.parse(window.localStorage.getItem(LOCAL_PROFILE_EDITOR_KEY) ?? "{}") as {
        socialLinks?: Array<{ label: string; visibility: string }>;
      };
      expect(draft.socialLinks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: "Public Proof", visibility: "public" }),
          expect.objectContaining({ label: "Friends Lobby", visibility: "friends_only" }),
          expect.objectContaining({ label: "Private Discord", visibility: "private" }),
        ]),
      );
    });
  });

  it("sends explicit social link visibility in Supabase save payloads", async () => {
    currentUserMock.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      session: { user: { id: "hosted-user" } },
      user: { id: "hosted-user" },
    });
    const profile = createHostedProfile();
    profileMocks.getMyProfile.mockResolvedValue(profile);
    profileMocks.getUserSocialLinks.mockResolvedValue([
      {
        id: "hosted-social-public",
        label: "Public Proof",
        platform: "docs",
        sortOrder: 0,
        url: "https://example.com/public",
        visibility: "public",
      },
      {
        id: "hosted-social-private",
        label: "Private Discord",
        platform: "discord",
        sortOrder: 1,
        url: "https://discord.gg/private",
        visibility: "private",
      },
    ]);
    profileMocks.updateMyProfile.mockResolvedValue(profile);
    profileMocks.updateMyProfileTheme.mockResolvedValue(null);
    profileMocks.updateMyHardware.mockResolvedValue(null);
    profileMocks.ensureMyHardwareShowcase.mockResolvedValue(null);
    profileMocks.updateMySocialLinks.mockResolvedValue([]);

    const container = renderEditProfilePage();

    await waitFor(() => {
      expect(container).toHaveTextContent("Save Profile");
      expect(inputValues(container)).toEqual(
        expect.arrayContaining(["Public Proof", "Private Discord"]),
      );
    });

    const form = container.querySelector("form");
    if (!form) throw new Error("Expected edit profile form to render.");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(profileMocks.updateMySocialLinks).toHaveBeenCalledWith([
        {
          id: "hosted-social-public",
          label: "Public Proof",
          platform: "docs",
          sortOrder: 0,
          url: "https://example.com/public",
          visibility: "public",
        },
        {
          id: "hosted-social-private",
          label: "Private Discord",
          platform: "discord",
          sortOrder: 1,
          url: "https://discord.gg/private",
          visibility: "private",
        },
      ]);
    });
  });
});

function inputValues(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLInputElement>("input")).map(
    (input) => input.value,
  );
}

function selectValues(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLSelectElement>("select")).map(
    (select) => select.value,
  );
}

function createHostedProfile() {
  const now = "2026-06-14T10:00:00.000Z";
  return {
    achievementVisibility: "public",
    appShellSkinId: null,
    avatarUrl: null,
    bannerUrl: null,
    bio: "Hosted editor profile",
    commentsVisibility: "public",
    countryCode: "DE",
    createdAt: now,
    customTheme: null,
    displayName: "Hosted Editor",
    featuredAchievementId: null,
    featuredBadgeId: null,
    featuredGameId: null,
    gameActivityVisibility: "friends_only",
    id: "hosted-user",
    isBanned: false,
    isDeleted: false,
    language: "en",
    lastSeenAt: now,
    libraryVisibility: "friends_only",
    onlineStatusVisibility: "public",
    profileLevel: 12,
    profileThemeId: null,
    profileVisibility: "public",
    profileXp: 2400,
    timezone: "Europe/Berlin",
    updatedAt: now,
    username: "hosted-editor",
    wishlistVisibility: "public",
  };
}
