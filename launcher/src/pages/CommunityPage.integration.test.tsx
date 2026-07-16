import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useCurrentUserMock = vi.hoisted(() => vi.fn());
const activityMocks = vi.hoisted(() => ({
  getFriendActivityFeed: vi.fn(),
  postActivity: vi.fn(),
  subscribeToFriendActivity: vi.fn(),
}));
const interactionMocks = vi.hoisted(() => ({
  addActivityComment: vi.fn(),
  deleteActivityComment: vi.fn(),
  getActivityComments: vi.fn(),
  getActivityInteractionSummaries: vi.fn(),
  setActivityRateUp: vi.fn(),
  subscribeToActivityInteractions: vi.fn(),
}));
const profileMocks = vi.hoisted(() => ({
  getFriends: vi.fn(),
  getProfilesForUsers: vi.fn(),
}));

vi.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: () => useCurrentUserMock(),
}));

vi.mock("../lib/supabase/activity", () => ({
  getFriendActivityFeed: (...args: unknown[]) => activityMocks.getFriendActivityFeed(...args),
  postActivity: (...args: unknown[]) => activityMocks.postActivity(...args),
  subscribeToFriendActivity: (...args: unknown[]) =>
    activityMocks.subscribeToFriendActivity(...args),
}));

vi.mock("../lib/supabase/activity-interactions", () => ({
  addActivityComment: (...args: unknown[]) => interactionMocks.addActivityComment(...args),
  deleteActivityComment: (...args: unknown[]) => interactionMocks.deleteActivityComment(...args),
  getActivityComments: (...args: unknown[]) => interactionMocks.getActivityComments(...args),
  getActivityInteractionSummaries: (...args: unknown[]) =>
    interactionMocks.getActivityInteractionSummaries(...args),
  setActivityRateUp: (...args: unknown[]) => interactionMocks.setActivityRateUp(...args),
  subscribeToActivityInteractions: (...args: unknown[]) =>
    interactionMocks.subscribeToActivityInteractions(...args),
}));

vi.mock("../lib/supabase/profile", () => ({
  getFriends: (...args: unknown[]) => profileMocks.getFriends(...args),
  getProfilesForUsers: (...args: unknown[]) => profileMocks.getProfilesForUsers(...args),
}));

vi.mock("../lib/supabase/presence", () => ({
  getActivityPlatformLabel: () => null,
}));

import { CommunityPage } from "./CommunityPage";

describe("CommunityPage live integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/community");
    useCurrentUserMock.mockReturnValue({
      error: null,
      isConfigured: true,
      isLoading: false,
      session: null,
      signOut: vi.fn(),
      user: { id: "user-current" },
    });
    profileMocks.getFriends.mockResolvedValue([]);
    profileMocks.getProfilesForUsers.mockResolvedValue(new Map());
    activityMocks.subscribeToFriendActivity.mockReturnValue(vi.fn());
    interactionMocks.getActivityComments.mockResolvedValue({ comments: [], nextCursor: null });
    interactionMocks.getActivityInteractionSummaries.mockResolvedValue(new Map());
    interactionMocks.subscribeToActivityInteractions.mockReturnValue(vi.fn());
  });

  it("reloads and renders the signed-in user's new status with live interactions enabled", async () => {
    let statusPosted = false;
    const postedStatus = {
      achievementName: null,
      createdAt: "2026-07-16T12:00:00.000Z",
      gameId: null,
      gameTitle: null,
      id: "status-live-1",
      metadata: { text: "Ready for co-op" },
      type: "status",
      userId: "user-current",
      visibility: "friends_only",
    };
    activityMocks.getFriendActivityFeed.mockImplementation(async () =>
      statusPosted ? [postedStatus] : [],
    );
    activityMocks.postActivity.mockImplementation(async () => {
      statusPosted = true;
      return { id: "status-live-1" };
    });

    render(
      <MemoryRouter>
        <CommunityPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("No recent community activity.")).toBeInTheDocument();
    expect(activityMocks.getFriendActivityFeed).toHaveBeenCalledWith(["user-current"], 30);
    const feedLoadsBeforePost = activityMocks.getFriendActivityFeed.mock.calls.length;

    const composer = screen.getByRole("form", { name: /friends-only status composer/i });
    fireEvent.change(within(composer).getByRole("textbox", { name: /status for accepted/i }), {
      target: { value: "Ready for co-op" },
    });
    fireEvent.click(within(composer).getByRole("button", { name: /post status/i }));

    expect(await screen.findByText("Ready for co-op")).toBeInTheDocument();
    expect(await screen.findByText("You")).toBeInTheDocument();
    expect(activityMocks.getFriendActivityFeed.mock.calls.length).toBeGreaterThan(
      feedLoadsBeforePost,
    );
    expect(activityMocks.getFriendActivityFeed).toHaveBeenLastCalledWith(["user-current"], 30);

    const rateButton = screen.getByRole("button", { name: /rate up this activity/i });
    expect(rateButton).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /comments/i }));
    expect(await screen.findByRole("textbox", { name: /comment on this activity/i })).toBeEnabled();
    await waitFor(() =>
      expect(interactionMocks.getActivityComments).toHaveBeenCalledWith("status-live-1", {
        limit: 8,
      }),
    );
  });
});
