import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileActions } from "./ProfileActions";

const profileMocks = vi.hoisted(() => ({
  sendFriendRequest: vi.fn(),
}));
const socialMocks = vi.hoisted(() => ({
  getDirectThread: vi.fn(),
}));

vi.mock("../../lib/supabase/profile", () => profileMocks);
vi.mock("../../lib/supabase/social", () => socialMocks);

const originalClipboard = navigator.clipboard;

function renderProfileActions({
  canUseSocialActions = true,
  initialEntry = "/u/packetghost?deck=showcase",
  profileUserId = "profile-1",
}: {
  canUseSocialActions?: boolean;
  initialEntry?: string;
  profileUserId?: string;
} = {}) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          element={
            <ProfileActions
              canUseSocialActions={canUseSocialActions}
              profileUserId={profileUserId}
            />
          }
          path="/u/:username"
        />
        <Route element={<p>Friends hub route</p>} path="/friends" />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProfileActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
  });

  it("opens a visible More action menu and copies the profile route", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderProfileActions();

    const moreButton = screen.getByRole("button", { name: /more profile actions/i });
    fireEvent.click(moreButton);

    expect(moreButton).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu", { name: /more profile actions/i });
    expect(within(menu).getByText("Player Actions")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /copy profile link/i })).toBeVisible();
    expect(within(menu).getByRole("menuitem", { name: /open friends hub/i })).toBeVisible();

    fireEvent.click(within(menu).getByRole("menuitem", { name: /copy profile link/i }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/u/packetghost?deck=showcase`,
      ),
    );
    expect(screen.getByText("Profile link copied.")).toBeInTheDocument();
    expect(screen.queryByRole("menu", { name: /more profile actions/i })).not.toBeInTheDocument();
  });

  it("routes the More menu social handoff to the friends hub", () => {
    renderProfileActions();

    fireEvent.click(screen.getByRole("button", { name: /more profile actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /open friends hub/i }));

    expect(screen.getByText("Friends hub route")).toBeInTheDocument();
  });

  it("keeps the menu useful when signed out but locks social handoffs", () => {
    renderProfileActions({ canUseSocialActions: false });

    const moreButton = screen.getByRole("button", { name: /more profile actions/i });
    expect(moreButton).toBeEnabled();

    fireEvent.click(moreButton);

    const menu = screen.getByRole("menu", { name: /more profile actions/i });
    expect(within(menu).getByRole("menuitem", { name: /copy profile link/i })).toBeEnabled();
    expect(within(menu).getByRole("menuitem", { name: /open friends hub/i })).toBeDisabled();
    expect(within(menu).getByText(/sign in to route social handoffs/i)).toBeInTheDocument();
  });

  it("closes the More menu with Escape", () => {
    renderProfileActions();

    const moreButton = screen.getByRole("button", { name: /more profile actions/i });
    fireEvent.click(moreButton);
    expect(screen.getByRole("menu", { name: /more profile actions/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("menu", { name: /more profile actions/i })).not.toBeInTheDocument();
    expect(moreButton).toHaveAttribute("aria-expanded", "false");
  });
});
