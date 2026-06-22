import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const currentUserMock = vi.hoisted(() => vi.fn());
const profileMocks = vi.hoisted(() => ({
  getProfilePageData: vi.fn(),
}));
const supabaseClientMock = vi.hoisted(() => ({
  isSupabaseConfigured: false,
}));

vi.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: currentUserMock,
}));

vi.mock("../lib/supabase/client", () => ({
  get isSupabaseConfigured() {
    return supabaseClientMock.isSupabaseConfigured;
  },
}));

vi.mock("../lib/supabase/profile", () => profileMocks);

import { ProfilePage } from "./ProfilePage";
import { createVerifyProfilePrivacyGuardData } from "../lib/profile-privacy-guard";

const privateFixtureTerms =
  /Private Backlog RPG|RTX Private Lab|Secret Guestbook|Friends Raid Session|Hidden Boss Clear|Private Showcase Notes/i;

function renderProfileRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<ProfilePage />} path="/u/:username" />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProfilePage privacy guard verify route", () => {
  beforeEach(() => {
    currentUserMock.mockReturnValue({
      isConfigured: false,
      isLoading: false,
      user: null,
    });
    profileMocks.getProfilePageData.mockReset();
    supabaseClientMock.isSupabaseConfigured = false;
  });

  it("renders the local privacy guard without exposing hidden profile fields", async () => {
    renderProfileRoute("/u/localprivacy?verify=profile-privacy-guard");

    const panel = await screen.findByRole("region", {
      name: /public profile privacy guard/i,
    });

    expect(panel).toBeVisible();
    expect(within(panel).getByText("Public Profile Privacy Guard")).toBeInTheDocument();
    expect(within(panel).getByText("Public Safe")).toBeInTheDocument();
    expect(within(panel).getByText("Library Preview")).toBeInTheDocument();
    expect(within(panel).getByText("Guestbook")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(privateFixtureTerms);
    expect(profileMocks.getProfilePageData).not.toHaveBeenCalled();
  });

  it("treats friends-only root profiles as hidden for public viewers", async () => {
    const data = createVerifyProfilePrivacyGuardData();
    data.profile.profileVisibility = "friends_only";
    supabaseClientMock.isSupabaseConfigured = true;
    profileMocks.getProfilePageData.mockResolvedValue(data);

    renderProfileRoute("/u/localprivacy");

    expect(await screen.findByText("Private Profile")).toBeVisible();
    expect(document.body).not.toHaveTextContent(privateFixtureTerms);
  });
});
