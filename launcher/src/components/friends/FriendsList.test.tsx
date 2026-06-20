import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { FriendsList } from "./FriendsList";
import type { Friendship, UserPresence } from "../../lib/types/profile";

const friendship = {
  id: "friendship-1",
  requesterId: "user-1",
  addresseeId: "friend-1",
  status: "accepted",
  requestedAt: "2026-06-17T08:00:00.000Z",
  respondedAt: "2026-06-17T08:01:00.000Z",
  createdAt: "2026-06-17T08:00:00.000Z",
  updatedAt: "2026-06-17T08:01:00.000Z",
  profile: {
    id: "friend-1",
    username: "packetghost",
    displayName: "Packet Ghost",
    avatarUrl: null,
    profileVisibility: "public",
  },
} satisfies Friendship;

const presence = {
  userId: "friend-1",
  status: "online",
  customStatus: null,
  currentGameId: "neon-drift",
  currentGameTitle: "Neon Drift",
  lastHeartbeatAt: "2026-06-17T08:05:00.000Z",
  platform: "steam",
  platformGameId: "440",
  platformLastPolledAt: "2026-06-17T08:04:00.000Z",
  platformSource: "steam",
  updatedAt: "2026-06-17T08:05:00.000Z",
} satisfies UserPresence;

describe("FriendsList", () => {
  it("exposes roster handoff actions for chat invite and smart join", () => {
    const onOpenChat = vi.fn();
    const onOpenInvite = vi.fn();
    const onJoinGame = vi.fn();

    render(
      <MemoryRouter>
        <FriendsList
          currentUserId="user-1"
          friends={[friendship]}
          presenceByUserId={{ "friend-1": presence }}
          onJoinGame={onJoinGame}
          onOpenChat={onOpenChat}
          onOpenInvite={onOpenInvite}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /chat/i }));
    fireEvent.click(screen.getByRole("button", { name: /invite/i }));
    fireEvent.click(screen.getByRole("button", { name: /smart join/i }));

    expect(onOpenChat).toHaveBeenCalledWith("friend-1");
    expect(onOpenInvite).toHaveBeenCalledWith("friend-1");
    expect(onJoinGame).toHaveBeenCalledWith("neon-drift");
  });
});
