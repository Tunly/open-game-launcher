import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityFeed } from "./ActivityFeed";

const activityMocks = vi.hoisted(() => ({
  getFriendActivityFeed: vi.fn(),
  subscribeToFriendActivity: vi.fn(() => vi.fn()),
}));
const interactionMocks = vi.hoisted(() => ({
  addActivityComment: vi.fn(),
  deleteActivityComment: vi.fn(),
  getActivityComments: vi.fn(),
  getActivityInteractionSummaries: vi.fn(),
  setActivityRateUp: vi.fn(),
  subscribeToActivityInteractions: vi.fn(() => vi.fn()),
}));
const profileMocks = vi.hoisted(() => ({ getProfilesForUsers: vi.fn() }));

vi.mock("../../lib/supabase/activity", () => activityMocks);
vi.mock("../../lib/supabase/activity-interactions", () => interactionMocks);
vi.mock("../../lib/supabase/profile", () => profileMocks);
vi.mock("../../lib/supabase/presence", () => ({
  getActivityPlatformLabel: (metadata: Record<string, unknown>) =>
    metadata.platform === "steam" ? "Steam" : null,
}));

describe("ActivityFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    interactionMocks.getActivityComments.mockResolvedValue([]);
    interactionMocks.getActivityInteractionSummaries.mockResolvedValue(new Map());
    interactionMocks.setActivityRateUp.mockResolvedValue({
      activityId: "activity-1",
      reactedByCurrentUser: true,
      reactionCount: 1,
    });
    profileMocks.getProfilesForUsers.mockResolvedValue(new Map());
  });

  it("renders friend activity as Steam-like feed cards", async () => {
    activityMocks.getFriendActivityFeed.mockResolvedValue([
      {
        achievementName: null,
        createdAt: new Date().toISOString(),
        gameId: "neon-runner",
        gameTitle: "Neon Runner",
        id: "activity-1",
        metadata: { platform: "steam" },
        type: "game_start",
        userId: "friend-12345678",
        visibility: "friends_only",
      },
      {
        achievementName: null,
        createdAt: new Date(Date.now() - 120_000).toISOString(),
        gameId: null,
        gameTitle: null,
        id: "activity-status",
        metadata: { text: "Queue is clear. Ready for co-op." },
        type: "status",
        userId: "friend-status",
        visibility: "friends_only",
      },
      {
        achievementName: "Hard Reset",
        createdAt: new Date(Date.now() - 86_400_000).toISOString(),
        gameId: "mecha-shift",
        gameTitle: "Mecha Shift",
        id: "activity-2",
        metadata: { platform: "steam" },
        type: "achievement_unlocked",
        userId: "friend-87654321",
        visibility: "friends_only",
      },
      {
        achievementName: null,
        createdAt: new Date(Date.now() - 90_000_000).toISOString(),
        gameId: null,
        gameTitle: "Paper Orbit",
        id: "activity-wishlist",
        metadata: {},
        type: "wishlist_added",
        userId: "friend-12345678",
        visibility: "friends_only",
      },
      {
        achievementName: null,
        createdAt: new Date(Date.now() - 91_000_000).toISOString(),
        gameId: null,
        gameTitle: "Boss Rush EX",
        id: "activity-purchase",
        metadata: { currency: "EUR", priceCents: 1999 },
        type: "game_purchased",
        userId: "friend-87654321",
        visibility: "friends_only",
      },
    ]);

    render(
      <ActivityFeed
        friendIds={["friend-12345678", "friend-87654321"]}
        profiles={
          new Map([
            [
              "friend-12345678",
              { avatarUrl: null, displayName: "Packet Ghost", username: "packetghost" },
            ],
            [
              "friend-87654321",
              { avatarUrl: null, displayName: "Teal Shift", username: "tealshift" },
            ],
          ])
        }
      />,
    );

    expect(await screen.findByText("Neon Runner")).toBeInTheDocument();
    expect(activityMocks.getFriendActivityFeed).toHaveBeenCalledWith(
      ["friend-12345678", "friend-87654321"],
      30,
    );
    expect(screen.getByText(/Started playing Neon Runner on Steam/i)).toBeInTheDocument();
    expect(screen.getByText("Mecha Shift")).toBeInTheDocument();
    expect(screen.getByText(/Unlocked "Hard Reset" in Mecha Shift on Steam/i)).toBeInTheDocument();
    expect(screen.getByText("Queue is clear. Ready for co-op.")).toBeInTheDocument();
    expect(screen.getAllByText("Packet Ghost").length).toBeGreaterThan(0);
    expect(screen.getByText(/Added Paper Orbit to their wishlist/i)).toBeInTheDocument();
    expect(screen.getByText(/Now owns Boss Rush EX/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /rate up/i })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /comments/i }).length).toBeGreaterThan(0);
  });

  it("renders the empty state when no friend activity is available", async () => {
    render(<ActivityFeed friendIds={[]} />);

    expect(await screen.findByText(/No recent activity from friends/i)).toBeInTheDocument();
    expect(activityMocks.getFriendActivityFeed).not.toHaveBeenCalled();
    expect(activityMocks.subscribeToFriendActivity).not.toHaveBeenCalled();
  });

  it("shows the load error and retries with the same filtered friend IDs", async () => {
    activityMocks.getFriendActivityFeed
      .mockRejectedValueOnce(new Error("activity service unavailable"))
      .mockResolvedValueOnce([]);

    render(<ActivityFeed friendIds={["friend-12345678"]} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Friend activity could not be loaded.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("activity service unavailable");

    fireEvent.click(screen.getByRole("button", { name: /retry activity feed/i }));

    expect(await screen.findByText(/No recent activity from friends/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(activityMocks.getFriendActivityFeed).toHaveBeenCalledTimes(2);
    });
    expect(activityMocks.getFriendActivityFeed).toHaveBeenLastCalledWith(["friend-12345678"], 30);
  });

  it("loads, posts, deletes, and rates activity interactions", async () => {
    const createdAt = new Date().toISOString();
    activityMocks.getFriendActivityFeed.mockResolvedValue([
      {
        achievementName: null,
        createdAt,
        gameId: null,
        gameTitle: "Neon Runner",
        id: "activity-1",
        metadata: {},
        type: "wishlist_added",
        userId: "friend-1",
        visibility: "friends_only",
      },
    ]);
    interactionMocks.getActivityInteractionSummaries.mockResolvedValue(
      new Map([
        [
          "activity-1",
          {
            activityId: "activity-1",
            commentCount: 1,
            reactedByCurrentUser: false,
            reactionCount: 3,
          },
        ],
      ]),
    );
    interactionMocks.getActivityComments.mockResolvedValue([
      {
        activityId: "activity-1",
        authorId: "user-1",
        body: "Already installed.",
        createdAt,
        id: "comment-1",
      },
    ]);
    interactionMocks.addActivityComment.mockResolvedValue({
      activityId: "activity-1",
      authorId: "user-1",
      body: "Let us play tonight.",
      createdAt,
      id: "comment-2",
    });

    render(<ActivityFeed currentUserId="user-1" friendIds={["friend-1"]} />);

    const rateButton = await screen.findByRole("button", { name: /rate up neon runner/i });
    await waitFor(() => expect(rateButton).toHaveTextContent("Rate Up 3"));
    fireEvent.click(rateButton);
    await waitFor(() => {
      expect(interactionMocks.setActivityRateUp).toHaveBeenCalledWith("activity-1", true);
    });
    expect(rateButton).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /comments 1/i }));
    expect(await screen.findByText("Already installed.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/comment on neon runner/i), {
      target: { value: "Let us play tonight." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^post$/i }));
    expect(await screen.findByText("Let us play tonight.")).toBeInTheDocument();
    expect(interactionMocks.addActivityComment).toHaveBeenCalledWith(
      "activity-1",
      "Let us play tonight.",
    );

    fireEvent.click(screen.getAllByRole("button", { name: /delete comment by you/i })[0]);
    await waitFor(() => {
      expect(interactionMocks.deleteActivityComment).toHaveBeenCalledWith("comment-1");
    });
  });

  it("does not reload when an equivalent friend id array is passed", async () => {
    activityMocks.getFriendActivityFeed.mockResolvedValue([]);
    const view = render(<ActivityFeed friendIds={["friend-2", "friend-1"]} />);
    expect(await screen.findByText(/No recent activity from friends/i)).toBeInTheDocument();

    view.rerender(<ActivityFeed friendIds={["friend-1", "friend-2"]} />);

    await waitFor(() => expect(activityMocks.getFriendActivityFeed).toHaveBeenCalledTimes(1));
  });
});
