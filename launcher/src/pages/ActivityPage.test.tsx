import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityPage } from "./ActivityPage";
import type { ActivityFeedItem } from "../lib/types/friends";

const mocks = vi.hoisted(() => ({
  getFriendActivityFeed: vi.fn(),
  getFriends: vi.fn(),
  listInstalledGames: vi.fn(),
  getProfilesForUsers: vi.fn(),
  getVisiblePresence: vi.fn(),
  getActivityInteractionSummaries: vi.fn(),
  subscribeToActivityInteractions: vi.fn(() => vi.fn()),
  subscribeToFriendActivity: vi.fn(() => vi.fn()),
  subscribeToPresenceChanges: vi.fn(() => vi.fn()),
  useCurrentUser: vi.fn(),
}));

vi.mock("../hooks/useCurrentUser", () => ({ useCurrentUser: mocks.useCurrentUser }));
vi.mock("../lib/supabase/activity", () => ({
  getFriendActivityFeed: mocks.getFriendActivityFeed,
  subscribeToFriendActivity: mocks.subscribeToFriendActivity,
}));
vi.mock("../lib/supabase/activity-interactions", () => ({
  addActivityComment: vi.fn(),
  deleteActivityComment: vi.fn(),
  getActivityComments: vi.fn(),
  getActivityInteractionSummaries: mocks.getActivityInteractionSummaries,
  setActivityRateUp: vi.fn(),
  subscribeToActivityInteractions: mocks.subscribeToActivityInteractions,
}));
vi.mock("../lib/supabase/profile", () => ({
  getFriends: mocks.getFriends,
  getProfilesForUsers: mocks.getProfilesForUsers,
}));
vi.mock("../lib/launcher", () => ({ listInstalledGames: mocks.listInstalledGames }));
vi.mock("../lib/supabase/presence", () => ({
  getActivityPlatformLabel: () => "Steam",
  getVisiblePresence: mocks.getVisiblePresence,
  subscribeToPresenceChanges: mocks.subscribeToPresenceChanges,
}));

function renderPage(initialEntry = "/activity") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ActivityPage />
    </MemoryRouter>,
  );
}

function activityItem(overrides: Partial<ActivityFeedItem> = {}): ActivityFeedItem {
  return {
    achievementName: null,
    createdAt: "2026-07-16T12:00:00.000Z",
    gameId: null,
    gameTitle: null,
    id: "activity-1",
    metadata: {},
    type: "status",
    userId: "user-1",
    visibility: "friends_only",
    ...overrides,
  };
}

describe("ActivityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useCurrentUser.mockReturnValue({ isConfigured: false, isLoading: false, user: null });
    mocks.getFriendActivityFeed.mockResolvedValue([]);
    mocks.getFriends.mockResolvedValue([]);
    mocks.listInstalledGames.mockResolvedValue([]);
    mocks.getProfilesForUsers.mockResolvedValue(new Map());
    mocks.getVisiblePresence.mockResolvedValue([]);
    mocks.getActivityInteractionSummaries.mockResolvedValue(new Map());
  });

  it("renders the Steam-like local activity preview in the manga visual system", async () => {
    renderPage();

    expect(screen.getByRole("heading", { name: /friend activity/i })).toBeInTheDocument();
    expect(screen.getByText(/Added Neon Drift to their wishlist/i)).toBeInTheDocument();
    expect(screen.getByText(/Now owns Phantom Arcade/i)).toBeInTheDocument();
    expect(screen.getByText(/Unlocked "Hard Reset" in Mecha Signal/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /year recap/i })).toHaveAttribute(
      "href",
      "/activity/recap",
    );
    expect(screen.getByRole("heading", { name: /friend list/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /activity transmission/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/post a status to your friends/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /post status/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /upcoming events/i })).not.toBeInTheDocument();
  });

  it("loads local game artwork for the activity feed without blocking the feed", async () => {
    mocks.listInstalledGames.mockResolvedValue([
      {
        id: "steam-neon-drift",
        title: "Neon Drift",
        description: "",
        coverUrl: "https://cdn.example.test/neon-drift-cover.jpg",
        platform: "windows",
        status: "installed",
        version: "1.0",
      },
    ]);

    renderPage();

    expect((await screen.findAllByAltText("Neon Drift activity artwork"))[0]).toHaveAttribute(
      "src",
      "https://cdn.example.test/neon-drift-cover.jpg",
    );
  });

  it("shows only the current player's sample items in the local My Activity preview", () => {
    renderPage("/activity?view=mine");

    expect(screen.getByRole("heading", { name: /^my activity$/i })).toBeInTheDocument();
    expect(screen.getByText(/sample activity for your own player profile/i)).toBeInTheDocument();
    expect(screen.getByText("Loadout locked. Night run starts at 21:00.")).toBeInTheDocument();
    expect(screen.getByText(/Unlocked "Perfect Line" in Neon Drift/i)).toBeInTheDocument();
    expect(screen.getAllByText("You")).toHaveLength(2);
    expect(screen.queryByText(/Added Neon Drift to their wishlist/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Now owns Phantom Arcade/i)).not.toBeInTheDocument();
  });

  it("loads My Activity without waiting for the friend roster", async () => {
    mocks.useCurrentUser.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      user: { id: "user-1" },
    });
    mocks.getFriends.mockReturnValue(new Promise(() => undefined));
    mocks.getFriendActivityFeed.mockResolvedValue([
      activityItem({ metadata: { text: "Solo queue ready." } }),
    ]);

    renderPage("/activity?view=mine");

    expect(await screen.findByText("Solo queue ready.")).toBeInTheDocument();
    expect(mocks.getFriendActivityFeed).toHaveBeenCalledWith(["user-1"], 30);
    expect(screen.getByText(/feed remains available/i)).toBeInTheDocument();
  });

  it("keeps the feed available when friend profiles fail and retries friend data", async () => {
    mocks.useCurrentUser.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      user: { id: "user-1" },
    });
    mocks.getFriends.mockResolvedValue([{ addresseeId: "friend-1", requesterId: "user-1" }]);
    mocks.getProfilesForUsers
      .mockRejectedValueOnce(new Error("Profile relay offline"))
      .mockResolvedValue(
        new Map([
          ["friend-1", { avatarUrl: null, displayName: "Signal Fox", username: "signalfox" }],
        ]),
      );
    mocks.getVisiblePresence.mockResolvedValue([
      { currentGameTitle: "Neon Drift", status: "online", userId: "friend-1" },
    ]);
    mocks.getFriendActivityFeed.mockImplementation(async (ids: string[]) =>
      ids.includes("friend-1")
        ? [
            activityItem({
              gameTitle: "Neon Drift",
              id: "friend-activity",
              type: "game_start",
              userId: "friend-1",
            }),
          ]
        : [],
    );

    renderPage();

    expect(await screen.findByText(/Started playing Neon Drift/i)).toBeInTheDocument();
    expect(await screen.findByText(/Friend profiles unavailable/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry friend data/i }));

    expect(await screen.findByText("Signal Fox")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText(/Friend profiles unavailable/i)).not.toBeInTheDocument();
    });
    expect(mocks.getProfilesForUsers).toHaveBeenCalledTimes(2);
  });

  it("uses offline presence fallbacks without blocking friend activity", async () => {
    mocks.useCurrentUser.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      user: { id: "user-1" },
    });
    mocks.getFriends.mockResolvedValue([{ addresseeId: "friend-1", requesterId: "user-1" }]);
    mocks.getProfilesForUsers.mockResolvedValue(
      new Map([
        ["friend-1", { avatarUrl: null, displayName: "Signal Fox", username: "signalfox" }],
      ]),
    );
    mocks.getVisiblePresence.mockRejectedValue(new Error("Presence relay offline"));
    mocks.getFriendActivityFeed.mockImplementation(async (ids: string[]) =>
      ids.includes("friend-1")
        ? [
            activityItem({
              gameTitle: "Mecha Signal",
              id: "friend-achievement",
              type: "game_start",
              userId: "friend-1",
            }),
          ]
        : [],
    );

    renderPage();

    expect(await screen.findByText(/Started playing Mecha Signal/i)).toBeInTheDocument();
    expect(await screen.findByText(/Friend presence unavailable/i)).toBeInTheDocument();
    expect(screen.getByText("offline")).toBeInTheDocument();
  });

  it("reports a friend-roster partial failure while retaining the current user's feed", async () => {
    mocks.useCurrentUser.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      user: { id: "user-1" },
    });
    mocks.getFriends.mockRejectedValue(new Error("Roster relay offline"));
    mocks.getFriendActivityFeed.mockResolvedValue([
      activityItem({ metadata: { text: "Feed survives roster loss." } }),
    ]);

    renderPage();

    expect(await screen.findByText("Feed survives roster loss.")).toBeInTheDocument();
    expect(await screen.findByText(/Friend roster unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry friend data/i })).toBeEnabled();
  });

  it("does not retain another user's friend data when the auth user changes", async () => {
    let currentUserId = "user-1";
    mocks.useCurrentUser.mockImplementation(() => ({
      isConfigured: true,
      isLoading: false,
      user: { id: currentUserId },
    }));
    mocks.getFriends.mockImplementation(async (userId: string) => {
      if (userId === "user-2") throw new Error("New roster unavailable");
      return [{ addresseeId: "friend-1", requesterId: "user-1" }];
    });
    mocks.getProfilesForUsers.mockResolvedValue(
      new Map([
        ["friend-1", { avatarUrl: null, displayName: "Signal Fox", username: "signalfox" }],
      ]),
    );
    const view = renderPage();
    expect(await screen.findByText("Signal Fox")).toBeInTheDocument();

    currentUserId = "user-2";
    view.rerender(
      <MemoryRouter>
        <ActivityPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText("Signal Fox")).not.toBeInTheDocument();
    expect(await screen.findByText(/Friend roster unavailable/i)).toBeInTheDocument();
    expect(mocks.getFriendActivityFeed).toHaveBeenCalledWith(["user-2"], 30);
  });
});
