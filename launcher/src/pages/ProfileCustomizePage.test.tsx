import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { APP_SHELL_SKIN_STORAGE_KEY } from "../lib/app-shell-skins";
import { createProfileThemeExchangePayload } from "../lib/profile-theme-exchange";
import type { Profile, ProfileTheme } from "../lib/types/profile";
import { ProfileCustomizePage } from "./ProfileCustomizePage";

const currentUserMock = vi.hoisted(() => vi.fn());
const profileMocks = vi.hoisted(() => ({
  createShowcase: vi.fn(),
  getMyProfile: vi.fn(),
  getMyShowcases: vi.fn(),
  getProfileThemes: vi.fn(),
  updateMyAppShellSkin: vi.fn(),
  updateMyCustomTheme: vi.fn(),
  updateMyProfileTheme: vi.fn(),
  updateShowcases: vi.fn(),
}));

vi.mock("../components/profile/ProfileCustomizeForm", () => ({
  ProfileCustomizeForm: ({ showcases }: { showcases: Array<{ title: string | null }> }) => (
    <div data-testid="showcases">{showcases.map((showcase) => showcase.title).join(" / ")}</div>
  ),
}));

vi.mock("../components/profile/ProfileThemePreview", () => ({
  ProfileThemePreview: ({ theme }: { theme: { name: string } }) => (
    <div data-testid="theme-preview">{theme.name}</div>
  ),
}));

vi.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: () => currentUserMock(),
}));

vi.mock("../lib/supabase/profile", () => ({
  createShowcase: profileMocks.createShowcase,
  getMyProfile: profileMocks.getMyProfile,
  getMyShowcases: profileMocks.getMyShowcases,
  getProfileThemes: profileMocks.getProfileThemes,
  updateMyAppShellSkin: profileMocks.updateMyAppShellSkin,
  updateMyCustomTheme: profileMocks.updateMyCustomTheme,
  updateMyProfileTheme: profileMocks.updateMyProfileTheme,
  updateShowcases: profileMocks.updateShowcases,
}));

let root: Root | null = null;

beforeEach(() => {
  currentUserMock.mockReturnValue({
    isConfigured: false,
    isLoading: false,
    session: null,
    user: null,
  });
  profileMocks.createShowcase.mockReset();
  profileMocks.getMyProfile.mockReset();
  profileMocks.getMyShowcases.mockReset();
  profileMocks.getProfileThemes.mockReset();
  profileMocks.updateMyAppShellSkin.mockReset();
  profileMocks.updateMyCustomTheme.mockReset();
  profileMocks.updateMyProfileTheme.mockReset();
  profileMocks.updateShowcases.mockReset();
  profileMocks.getMyShowcases.mockResolvedValue([]);
  profileMocks.getProfileThemes.mockResolvedValue([]);
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:theme-export"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  window.history.replaceState(null, "", "/settings/profile/customize");
  window.localStorage.clear();
});

afterEach(() => {
  unmountRoot();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function renderWithRoot(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(node);
  });
  return container;
}

async function waitForAssertion(assertion: () => void) {
  await waitFor(assertion, { interval: 10 });
}

function unmountRoot() {
  if (!root) return;

  act(() => {
    root?.unmount();
  });
  root = null;
  document.body.innerHTML = "";
}

async function clickElement(element: HTMLElement | null | undefined) {
  await act(async () => {
    element?.click();
    await Promise.resolve();
  });
}

async function dispatchChange(element: Element | null | undefined) {
  await act(async () => {
    element?.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
}

describe("ProfileCustomizePage local draft fallback", () => {
  it("persists the selected local theme across remounts", async () => {
    const container = renderWithRoot(<ProfileCustomizePage />);

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Save Local Draft");
      expect(container).toHaveTextContent("Theme Skin Readiness");
      expect(container).toHaveTextContent(
        "Profile themes remain separate from browser-only shell skin",
      );
      expect(container).toHaveTextContent(
        "Custom theme import/export is schema-validated; hosted draft sync is profile-only",
      );
      expect(container).toHaveTextContent("Custom theme JSON exchange staged");
      expect(container).toHaveTextContent("profile_theme_id query-shape evidence only");
      expect(container).toHaveTextContent("App Shell");
      expect(container).toHaveTextContent("Browser only");
      expect(container).toHaveTextContent("Reset Shell Skin");
      expect(container).toHaveTextContent("Theme Exchange");
      expect(container).toHaveTextContent("Export JSON");
      expect(container).toHaveTextContent("Import JSON");
      expect(container).not.toHaveTextContent("App-Wide Theme");
    });

    const select = container.querySelector("select");
    expect(select).toHaveValue("local-theme-paper");
    select!.value = "local-theme-clean";
    await dispatchChange(select);

    await waitForAssertion(() => {
      expect(select).toHaveValue("local-theme-clean");
    });

    const saveButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Save Local Draft"),
    );
    await clickElement(saveButton);

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Local customization draft saved in this browser.");
      expect(window.localStorage.getItem("og-launcher:profile-customize-draft:v1")).toContain(
        "local-theme-clean",
      );
    });

    unmountRoot();
    const remounted = renderWithRoot(<ProfileCustomizePage />);

    await waitForAssertion(() => {
      expect(remounted.querySelector("select")).toHaveValue("local-theme-clean");
      expect(remounted).toHaveTextContent("Clean Paper Room");
    });
  });

  it("stores a browser-only app shell skin selection", async () => {
    const container = renderWithRoot(<ProfileCustomizePage />);

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("App Shell");
      expect(container).toHaveTextContent("Teal Print");
    });

    const tealButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Teal Print"),
    );
    await clickElement(tealButton);

    await waitForAssertion(() => {
      expect(window.localStorage.getItem(APP_SHELL_SKIN_STORAGE_KEY)).toBe("teal-print");
      expect(container).toHaveTextContent("Teal Print browser-only shell skin selected.");
    });

    const resetButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Reset Shell Skin"),
    );
    await clickElement(resetButton);

    await waitForAssertion(() => {
      expect(window.localStorage.getItem(APP_SHELL_SKIN_STORAGE_KEY)).toBe("retro-paper");
      expect(container).toHaveTextContent("Retro Paper browser-only shell skin restored.");
    });
  });

  it("loads and syncs the hosted app shell skin when Supabase profile data is available", async () => {
    const hostedProfile = makeProfile({ appShellSkinId: "redline-print" });
    currentUserMock.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      session: { user: { id: hostedProfile.id } },
      user: { id: hostedProfile.id },
    });
    profileMocks.getMyProfile.mockResolvedValue(hostedProfile);
    profileMocks.getMyShowcases.mockResolvedValue([]);
    profileMocks.getProfileThemes.mockResolvedValue([makeTheme({ id: "theme-paper" })]);
    profileMocks.updateMyAppShellSkin.mockResolvedValue({
      ...hostedProfile,
      appShellSkinId: "teal-print",
    });

    const container = renderWithRoot(<ProfileCustomizePage />);

    await waitForAssertion(() => {
      expect(window.localStorage.getItem(APP_SHELL_SKIN_STORAGE_KEY)).toBe("redline-print");
      expect(container).toHaveTextContent("Redline Print");
    });

    const tealButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Teal Print"),
    );
    await clickElement(tealButton);

    await waitForAssertion(() => {
      expect(profileMocks.updateMyAppShellSkin).toHaveBeenCalledWith("teal-print");
      expect(window.localStorage.getItem(APP_SHELL_SKIN_STORAGE_KEY)).toBe("teal-print");
      expect(container).toHaveTextContent("Teal Print shell skin synced to this profile.");
    });
  });

  it("imports and persists a validated local custom theme draft", async () => {
    const container = renderWithRoot(<ProfileCustomizePage />);

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Import JSON");
    });

    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Import custom theme JSON"]',
    );
    const file = new File(
      [
        JSON.stringify(
          createProfileThemeExchangePayload(
            makeTheme({
              accentColor: "#007166",
              backgroundValue: "#fff9ed",
              name: "Teal Review Skin",
            }),
          ),
        ),
      ],
      "teal-review-skin.json",
      { type: "application/json" },
    );
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await dispatchChange(input);

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Custom theme imported as local draft.");
      expect(container).toHaveTextContent("Teal Review Skin");
      expect(container.querySelector("select")).toHaveValue("local-custom-theme-teal-review-skin");
      expect(window.localStorage.getItem("og-launcher:profile-customize-draft:v1")).toContain(
        "local-custom-theme-teal-review-skin",
      );
    });

    unmountRoot();
    const remounted = renderWithRoot(<ProfileCustomizePage />);

    await waitForAssertion(() => {
      expect(remounted.querySelector("select")).toHaveValue("local-custom-theme-teal-review-skin");
      expect(remounted).toHaveTextContent("Teal Review Skin");
      expect(remounted).toHaveTextContent("Custom theme JSON draft imported");
    });
  });

  it("syncs an imported custom theme as a hosted profile draft", async () => {
    const hostedProfile = makeProfile();
    currentUserMock.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      session: { user: { id: hostedProfile.id } },
      user: { id: hostedProfile.id },
    });
    profileMocks.getMyProfile.mockResolvedValue(hostedProfile);
    profileMocks.getMyShowcases.mockResolvedValue([]);
    profileMocks.getProfileThemes.mockResolvedValue([makeTheme({ id: "theme-paper" })]);
    profileMocks.updateMyCustomTheme.mockImplementation(async (theme: ProfileTheme) => ({
      ...hostedProfile,
      customTheme: theme,
      profileThemeId: null,
    }));

    const container = renderWithRoot(<ProfileCustomizePage />);

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Import JSON");
    });

    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Import custom theme JSON"]',
    );
    const file = new File(
      [
        JSON.stringify(
          createProfileThemeExchangePayload(
            makeTheme({
              accentColor: "#007166",
              backgroundValue: "#fff9ed",
              name: "Hosted Teal Draft",
            }),
          ),
        ),
      ],
      "hosted-teal-draft.json",
      { type: "application/json" },
    );
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await dispatchChange(input);

    await waitForAssertion(() => {
      expect(profileMocks.updateMyCustomTheme).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Hosted Teal Draft" }),
      );
      expect(container.querySelector("select")).toHaveValue("local-custom-theme-hosted-teal-draft");
      expect(container).toHaveTextContent("Custom theme JSON synced as hosted profile draft.");
    });
  });

  it("exports the selected local theme as JSON", async () => {
    const container = renderWithRoot(<ProfileCustomizePage />);

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Export JSON");
    });

    const exportButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Export JSON"),
    );
    await clickElement(exportButton);

    await waitForAssertion(() => {
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:theme-export");
      expect(container).toHaveTextContent("Custom theme JSON exported for local review.");
    });
  });

  it("falls back to local customization when configured Supabase schema is missing", async () => {
    currentUserMock.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      session: { user: { id: "user-1" } },
      user: { id: "user-1" },
    });
    profileMocks.getMyProfile.mockRejectedValue(
      new Error("Could not find the profile_showcases table in the schema cache"),
    );

    const container = renderWithRoot(<ProfileCustomizePage />);

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Profile showcase schema fallback active");
      expect(container).toHaveTextContent("Save Local Draft");
      expect(container).toHaveTextContent("Room Note");
    });
  });

  it("keeps the app-wide theme readiness panel off the base route", async () => {
    const container = renderWithRoot(<ProfileCustomizePage />);

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Theme Skin Readiness");
      expect(container.querySelector('[aria-label="App-wide Theme/Skin readiness"]')).toBeNull();
    });
  });

  it("keeps the existing theme-skins verification route local-profile only", async () => {
    window.history.replaceState(null, "", "/settings/profile/customize?verify=theme-skins");

    const container = renderWithRoot(<ProfileCustomizePage />);

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Theme Skin Readiness");
      expect(container).toHaveTextContent(
        "Profile themes remain separate from browser-only shell skin",
      );
      expect(container.querySelector('[aria-label="App-wide Theme/Skin readiness"]')).toBeNull();
    });
  });

  it("shows app-wide theme readiness only on the app-wide verification route", async () => {
    window.history.replaceState(
      null,
      "",
      "/settings/profile/customize?verify=app-wide-theme-readiness",
    );

    const container = renderWithRoot(<ProfileCustomizePage />);

    await waitForAssertion(() => {
      expect(
        container.querySelector('[aria-label="App-wide Theme/Skin readiness"]'),
      ).not.toBeNull();
      expect(container).toHaveTextContent("App-Wide Theme");
      expect(container).toHaveTextContent("Profile Themes");
      expect(container).toHaveTextContent("Local Draft");
      expect(container).toHaveTextContent("Shell Skin Switch");
      expect(container).toHaveTextContent("Import + Export");
      expect(container).toHaveTextContent("Hosted Sync");
      expect(container).toHaveTextContent("Browser-only shell skin selected");
      expect(container).toHaveTextContent("Shell-skin query-shape evidence only");
      expect(container).toHaveTextContent("Custom-theme draft query-shape evidence only");
      expect(container).toHaveTextContent("profile_theme_id query-shape evidence only");
      expect(container).toHaveTextContent("Local custom theme JSON only");
      expect(container).toHaveTextContent("Browser-only default-skin reset only");
      expect(container).not.toHaveTextContent(
        /(custom theme (?:loaded|installed|ready|synced)|profile_theme_id (?:persisted|synced|verified|written)|marketplace skin (?:installed|synced|ready)|rollback verified)/i,
      );
    });
  });
});

function makeTheme(patch: Partial<ProfileTheme> = {}): ProfileTheme {
  return {
    accentColor: "#b7102a",
    backgroundType: "solid",
    backgroundValue: "#f6edd8",
    cardStyle: "pixel",
    createdAt: "2026-06-11T10:00:00.000Z",
    description: "Imported local profile theme.",
    id: "theme",
    isActive: true,
    isPremium: false,
    key: "theme",
    name: "Import Theme",
    textColor: "#171411",
    ...patch,
  };
}

function makeProfile(patch: Partial<Profile> = {}): Profile {
  return {
    achievementVisibility: "public",
    appShellSkinId: null,
    customTheme: null,
    avatarUrl: null,
    bannerUrl: null,
    bio: "Hosted profile fixture.",
    commentsVisibility: "public",
    countryCode: "DE",
    createdAt: "2026-06-12T10:00:00.000Z",
    displayName: "Hosted Player",
    featuredAchievementId: null,
    featuredBadgeId: null,
    featuredGameId: null,
    gameActivityVisibility: "friends_only",
    id: "hosted-user",
    isBanned: false,
    isDeleted: false,
    language: "en",
    lastSeenAt: "2026-06-12T10:00:00.000Z",
    libraryVisibility: "friends_only",
    onlineStatusVisibility: "public",
    profileLevel: 18,
    profileThemeId: null,
    profileVisibility: "public",
    profileXp: 7400,
    timezone: "Europe/Berlin",
    updatedAt: "2026-06-12T10:00:00.000Z",
    username: "hosted-player",
    wishlistVisibility: "public",
    ...patch,
  };
}
