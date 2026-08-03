import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FriendsChatPopup } from "./FriendsChatPopup";

const useCurrentUserMock = vi.hoisted(() => vi.fn());
const profileMocks = vi.hoisted(() => ({
  getFriends: vi.fn(),
}));
const presenceMocks = vi.hoisted(() => ({
  getPresencePlatformLabel: vi.fn(() => "Steam"),
  getVisiblePresence: vi.fn(),
  subscribeToPresenceChanges: vi.fn(() => vi.fn()),
}));
const socialMocks = vi.hoisted(() => ({
  getMyGroupChats: vi.fn(),
}));

vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: useCurrentUserMock,
}));
vi.mock("../../lib/supabase/profile", () => profileMocks);
vi.mock("../../lib/supabase/presence", () => presenceMocks);
vi.mock("../../lib/supabase/social", () => socialMocks);

describe("FriendsChatPopup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCurrentUserMock.mockReturnValue({
      isConfigured: false,
      isLoading: false,
      user: null,
    });
    profileMocks.getFriends.mockResolvedValue([]);
    presenceMocks.getVisiblePresence.mockResolvedValue([]);
    socialMocks.getMyGroupChats.mockResolvedValue([]);
  });

  it("shows the local preview roster and filters it", () => {
    render(<FriendsChatPopup onClose={vi.fn()} onOpenSocial={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: /friends and chat/i })).toBeVisible();
    expect(screen.getByText("Packet Ghost")).toBeVisible();
    expect(screen.getByText(/local preview/i)).toBeVisible();

    fireEvent.change(screen.getByRole("searchbox", { name: /search friends/i }), {
      target: { value: "Arcade" },
    });

    expect(screen.getByText("Arcade Witch")).toBeVisible();
    expect(screen.queryByText("Packet Ghost")).not.toBeInTheDocument();
  });

  it("loads hosted friends and hands the selected friend to the full chat page", async () => {
    useCurrentUserMock.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      user: {
        email: "daniel@example.com",
        id: "user-1",
        user_metadata: { display_name: "Daniel" },
      },
    });
    profileMocks.getFriends.mockResolvedValue([
      {
        addresseeId: "friend-1",
        createdAt: "2026-07-16T10:00:00.000Z",
        id: "friendship-1",
        profile: {
          avatarUrl: null,
          displayName: "Packet Ghost",
          id: "friend-1",
          profileVisibility: "public",
          username: "packetghost",
        },
        requesterId: "user-1",
        requestedAt: "2026-07-16T10:00:00.000Z",
        respondedAt: "2026-07-16T10:01:00.000Z",
        status: "accepted",
        updatedAt: "2026-07-16T10:01:00.000Z",
      },
    ]);
    presenceMocks.getVisiblePresence.mockResolvedValue([
      {
        customStatus: "Ranked queue open",
        currentGameId: "neon-drift",
        currentGameTitle: "Neon Drift",
        lastHeartbeatAt: "2026-07-16T12:00:00.000Z",
        platform: "steam",
        platformGameId: "480",
        platformLastPolledAt: "2026-07-16T12:00:00.000Z",
        platformSource: "steam",
        status: "online",
        updatedAt: "2026-07-16T12:00:00.000Z",
        userId: "friend-1",
      },
    ]);
    socialMocks.getMyGroupChats.mockResolvedValue([]);
    const onClose = vi.fn();
    const onOpenSocial = vi.fn();

    render(<FriendsChatPopup onClose={onClose} onOpenSocial={onOpenSocial} />);

    expect(await screen.findByText("Packet Ghost")).toBeVisible();
    expect(screen.getByText("Playing Neon Drift")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /packet ghost/i }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpenSocial).toHaveBeenCalledWith("chat", "friend-1");
  });

  it("closes with Escape", async () => {
    const onClose = vi.fn();
    render(<FriendsChatPopup onClose={onClose} onOpenSocial={vi.fn()} />);

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});
