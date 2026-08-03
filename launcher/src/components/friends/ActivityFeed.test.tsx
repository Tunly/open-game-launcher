import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
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

function renderFeed(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("ActivityFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    interactionMocks.getActivityComments.mockResolvedValue({ comments: [], nextCursor: null });
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
        metadata: { platform: "steam", productSlug: "neon-runner" },
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

    renderFeed(
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
    expect(screen.getAllByRole("link", { name: "Packet Ghost" })[0]).toHaveAttribute(
      "href",
      "/u/packetghost",
    );
    expect(screen.getByRole("link", { name: "Neon Runner" })).toHaveAttribute(
      "href",
      "/store?slug=neon-runner",
    );
    expect(screen.getByText(/Added Paper Orbit to their wishlist/i)).toBeInTheDocument();
    expect(screen.getByText(/Now owns Boss Rush EX/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /rate up/i })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /comments/i }).length).toBeGreaterThan(0);
  });

  it("renders the empty state when no friend activity is available", async () => {
    renderFeed(<ActivityFeed friendIds={[]} />);

    expect(await screen.findByText(/No recent activity from friends/i)).toBeInTheDocument();
    expect(activityMocks.getFriendActivityFeed).not.toHaveBeenCalled();
    expect(activityMocks.subscribeToFriendActivity).not.toHaveBeenCalled();
  });

  it("loads interaction summaries only for newly paginated activity", async () => {
    const initialItems = Array.from({ length: 30 }, (_, index) => ({
      achievementName: null,
      createdAt: new Date(Date.now() - index * 60_000).toISOString(),
      gameId: `game-${index}`,
      gameTitle: `Game ${index}`,
      id: `activity-${index}`,
      metadata: {},
      type: "game_start" as const,
      userId: "friend-1",
      visibility: "friends_only" as const,
    }));
    const olderItem = {
      ...initialItems[0],
      createdAt: new Date(Date.now() - 31 * 60_000).toISOString(),
      gameId: "older-game",
      gameTitle: "Older Game",
      id: "activity-older",
    };
    activityMocks.getFriendActivityFeed
      .mockResolvedValueOnce(initialItems)
      .mockResolvedValueOnce([olderItem]);
    interactionMocks.getActivityInteractionSummaries.mockImplementation(
      async (ids: string[]) =>
        new Map(
          ids.map((activityId) => [
            activityId,
            {
              activityId,
              commentCount: 0,
              reactedByCurrentUser: false,
              reactionCount: 0,
            },
          ]),
        ),
    );

    renderFeed(<ActivityFeed currentUserId="user-1" friendIds={["friend-1"]} />);

    const loadOlderButton = await screen.findByRole("button", { name: /load older activity/i });
    await waitFor(() => {
      expect(interactionMocks.getActivityInteractionSummaries).toHaveBeenCalledWith(
        initialItems.map((item) => item.id),
      );
    });

    fireEvent.click(loadOlderButton);

    expect(await screen.findByText("Older Game")).toBeInTheDocument();
    await waitFor(() => {
      expect(interactionMocks.getActivityInteractionSummaries).toHaveBeenLastCalledWith([
        "activity-older",
      ]);
    });
    expect(interactionMocks.getActivityInteractionSummaries).toHaveBeenCalledTimes(2);
  });

  it("uses account-specific empty and error copy for My Activity", async () => {
    activityMocks.getFriendActivityFeed
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("account feed unavailable"));

    const view = renderFeed(
      <ActivityFeed currentUserId="user-1" friendIds={["user-1"]} scope="mine" />,
    );
    expect(await screen.findByText(/No recent activity on your account/i)).toBeInTheDocument();

    view.unmount();
    renderFeed(<ActivityFeed currentUserId="user-1" friendIds={["user-1"]} scope="mine" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your activity could not be loaded.",
    );
  });

  it("shows the load error and retries with the same filtered friend IDs", async () => {
    activityMocks.getFriendActivityFeed
      .mockRejectedValueOnce(new Error("activity service unavailable"))
      .mockResolvedValueOnce([]);

    renderFeed(<ActivityFeed friendIds={["friend-12345678"]} />);

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
    interactionMocks.getActivityComments.mockResolvedValue({
      comments: [
        {
          activityId: "activity-1",
          authorId: "user-1",
          body: "Already installed.",
          createdAt,
          id: "comment-1",
        },
      ],
      nextCursor: null,
    });
    interactionMocks.addActivityComment.mockResolvedValue({
      activityId: "activity-1",
      authorId: "user-1",
      body: "Let us play tonight.",
      createdAt,
      id: "comment-2",
    });

    renderFeed(<ActivityFeed currentUserId="user-1" friendIds={["friend-1"]} />);

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
    const view = renderFeed(<ActivityFeed friendIds={["friend-2", "friend-1"]} />);
    expect(await screen.findByText(/No recent activity from friends/i)).toBeInTheDocument();

    view.rerender(
      <MemoryRouter>
        <ActivityFeed friendIds={["friend-1", "friend-2"]} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(activityMocks.getFriendActivityFeed).toHaveBeenCalledTimes(1));
  });

  it("loads older comments with a stable cursor and prepends them chronologically", async () => {
    const newerCreatedAt = "2026-07-14T12:01:00.000Z";
    const olderCreatedAt = "2026-07-14T12:00:00.000Z";
    activityMocks.getFriendActivityFeed.mockResolvedValue([
      {
        achievementName: null,
        createdAt: newerCreatedAt,
        gameId: null,
        gameTitle: "Neon Runner",
        id: "activity-1",
        metadata: {},
        type: "status",
        userId: "friend-1",
        visibility: "friends_only",
      },
    ]);
    interactionMocks.getActivityComments
      .mockResolvedValueOnce({
        comments: [
          {
            activityId: "activity-1",
            authorId: "friend-1",
            body: "Newer comment",
            createdAt: newerCreatedAt,
            id: "comment-2",
          },
        ],
        nextCursor: { createdAt: newerCreatedAt, id: "comment-2" },
      })
      .mockResolvedValueOnce({
        comments: [
          {
            activityId: "activity-1",
            authorId: "friend-1",
            body: "Older comment",
            createdAt: olderCreatedAt,
            id: "comment-1",
          },
        ],
        nextCursor: null,
      });

    renderFeed(<ActivityFeed currentUserId="user-1" friendIds={["friend-1"]} />);

    fireEvent.click(await screen.findByRole("button", { name: /comments/i }));
    expect(await screen.findByText("Newer comment")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /load older comments/i }));

    expect(await screen.findByText("Older comment")).toBeInTheDocument();
    expect(interactionMocks.getActivityComments).toHaveBeenNthCalledWith(1, "activity-1", {
      limit: 8,
    });
    expect(interactionMocks.getActivityComments).toHaveBeenNthCalledWith(2, "activity-1", {
      before: { createdAt: newerCreatedAt, id: "comment-2" },
      limit: 8,
    });
    expect(screen.queryByRole("button", { name: /load older comments/i })).not.toBeInTheDocument();
    const renderedComments = screen.getAllByText(/^(Older|Newer) comment$/);
    expect(renderedComments.map((node) => node.textContent)).toEqual([
      "Older comment",
      "Newer comment",
    ]);
  });

  it("surfaces failures from async realtime refresh and profile work", async () => {
    let realtimeHandlers:
      | {
          onCommentUpsert: (comment: {
            activityId: string;
            authorId: string;
            body: string;
            createdAt: string;
            id: string;
          }) => void;
          onReactionChanged: (change: { activityId: string }) => void;
        }
      | undefined;
    interactionMocks.subscribeToActivityInteractions.mockImplementation((...args: unknown[]) => {
      realtimeHandlers = args[1] as NonNullable<typeof realtimeHandlers>;
      return vi.fn();
    });
    activityMocks.getFriendActivityFeed.mockResolvedValue([
      {
        achievementName: null,
        createdAt: "2026-07-14T12:00:00.000Z",
        gameId: null,
        gameTitle: "Neon Runner",
        id: "activity-1",
        metadata: {},
        type: "status",
        userId: "friend-1",
        visibility: "friends_only",
      },
    ]);
    renderFeed(<ActivityFeed currentUserId="user-1" friendIds={["friend-1"]} />);
    await waitFor(() => expect(realtimeHandlers).toBeDefined());

    profileMocks.getProfilesForUsers.mockRejectedValueOnce(new Error("profile lookup unavailable"));
    act(() => {
      realtimeHandlers?.onCommentUpsert({
        activityId: "activity-1",
        authorId: "friend-2",
        body: "Live comment",
        createdAt: "2026-07-14T12:01:00.000Z",
        id: "comment-live",
      });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("profile lookup unavailable");

    interactionMocks.getActivityInteractionSummaries.mockRejectedValueOnce(
      new Error("summary refresh unavailable"),
    );
    act(() => realtimeHandlers?.onReactionChanged({ activityId: "activity-1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("summary refresh unavailable");
    expect(screen.getByRole("button", { name: /retry interaction data/i })).toBeInTheDocument();
  });
});
