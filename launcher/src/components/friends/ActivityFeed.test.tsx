import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityFeed } from "./ActivityFeed";

const activityMocks = vi.hoisted(() => ({
  getFriendActivityFeed: vi.fn(),
  subscribeToFriendActivity: vi.fn(() => vi.fn()),
}));

vi.mock("../../lib/supabase/activity", () => activityMocks);
vi.mock("../../lib/supabase/presence", () => ({
  getActivityPlatformLabel: (metadata: Record<string, unknown>) =>
    metadata.platform === "steam" ? "Steam" : null,
}));

describe("ActivityFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    ]);

    render(<ActivityFeed friendIds={["friend-12345678", "friend-87654321"]} />);

    expect(await screen.findByText("Neon Runner")).toBeInTheDocument();
    expect(activityMocks.getFriendActivityFeed).toHaveBeenCalledWith(
      ["friend-12345678", "friend-87654321"],
      30,
    );
    expect(screen.getByText(/Started playing Neon Runner on Steam/i)).toBeInTheDocument();
    expect(screen.getByText("Mecha Shift")).toBeInTheDocument();
    expect(screen.getByText(/Unlocked "Hard Reset" in Mecha Shift on Steam/i)).toBeInTheDocument();
    expect(screen.getByText("Queue is clear. Ready for co-op.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /rate up/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /comment/i })).not.toBeInTheDocument();
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
});
