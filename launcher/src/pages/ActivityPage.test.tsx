import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityPage } from "./ActivityPage";

const mocks = vi.hoisted(() => ({
  getFriendActivityFeed: vi.fn(),
  getFriends: vi.fn(),
  getProfilesForUsers: vi.fn(),
  getVisiblePresence: vi.fn(),
  getActivityInteractionSummaries: vi.fn(),
  subscribeToActivityInteractions: vi.fn(() => vi.fn()),
  postActivity: vi.fn(),
  subscribeToFriendActivity: vi.fn(() => vi.fn()),
  subscribeToPresenceChanges: vi.fn(() => vi.fn()),
  useCurrentUser: vi.fn(),
}));

vi.mock("../hooks/useCurrentUser", () => ({ useCurrentUser: mocks.useCurrentUser }));
vi.mock("../lib/supabase/activity", () => ({
  getFriendActivityFeed: mocks.getFriendActivityFeed,
  postActivity: mocks.postActivity,
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
vi.mock("../lib/supabase/presence", () => ({
  getActivityPlatformLabel: () => "Steam",
  getVisiblePresence: mocks.getVisiblePresence,
  subscribeToPresenceChanges: mocks.subscribeToPresenceChanges,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ActivityPage />
    </MemoryRouter>,
  );
}

describe("ActivityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useCurrentUser.mockReturnValue({ isConfigured: false, isLoading: false, user: null });
    mocks.getFriendActivityFeed.mockResolvedValue([]);
    mocks.getFriends.mockResolvedValue([]);
    mocks.getProfilesForUsers.mockResolvedValue(new Map());
    mocks.getVisiblePresence.mockResolvedValue([]);
    mocks.getActivityInteractionSummaries.mockResolvedValue(new Map());
    mocks.postActivity.mockResolvedValue({ id: "status-1" });
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
  });

  it("loads real friends and posts a friends-only status", async () => {
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
    mocks.getVisiblePresence.mockResolvedValue([
      { currentGameTitle: "Neon Drift", status: "online", userId: "friend-1" },
    ]);

    renderPage();

    expect(await screen.findByText("Signal Fox")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/post a status to your friends/i), {
      target: { value: "Ready for co-op" },
    });
    fireEvent.change(screen.getByLabelText(/tag with game/i), {
      target: { value: "Neon Drift" },
    });
    fireEvent.click(screen.getByRole("button", { name: /post status/i }));

    await waitFor(() => {
      expect(mocks.postActivity).toHaveBeenCalledWith("status", {
        gameTitle: "Neon Drift",
        metadata: { text: "Ready for co-op" },
        visibility: "friends_only",
      });
    });
    expect(await screen.findByText(/status posted to your friends/i)).toBeInTheDocument();
  });
});
