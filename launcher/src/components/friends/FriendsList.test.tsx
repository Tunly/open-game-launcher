import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { FriendsList } from "./FriendsList";
import type { FriendLink } from "../../lib/types/friends";
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

function friendLink(
  overrides: Partial<FriendLink> & Pick<FriendLink, "id" | "platform">,
): FriendLink {
  return {
    createdAt: "2026-06-17T08:00:00.000Z",
    dismissed: false,
    matchMethod: null,
    matchedUserId: null,
    mergeGroupId: null,
    ownerId: "user-1",
    platformFriendAvatar: null,
    platformFriendId: `${overrides.platform}-${overrides.id}`,
    platformFriendName: null,
    updatedAt: "2026-06-17T08:00:00.000Z",
    ...overrides,
  };
}

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

  it("shows friends from every imported platform and merges linked accounts into OG cards", () => {
    render(
      <MemoryRouter>
        <FriendsList
          currentUserId="user-1"
          friends={[friendship]}
          friendLinks={[
            friendLink({
              id: "steam-link",
              matchedUserId: "friend-1",
              platform: "steam",
              platformFriendName: "Packet Ghost",
            }),
            friendLink({
              id: "epic-link",
              mergeGroupId: "cross-platform-1",
              platform: "epic",
              platformFriendName: "Arcade Witch",
            }),
            friendLink({
              id: "xbox-link",
              mergeGroupId: "cross-platform-1",
              platform: "xbox",
              platformFriendName: "Arcade Witch",
            }),
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("Packet Ghost")).toHaveLength(1);
    expect(screen.getByText("OG-Launcher")).toBeInTheDocument();
    expect(screen.getByText("Steam")).toBeInTheDocument();
    expect(screen.getAllByText("Arcade Witch")).toHaveLength(1);
    expect(screen.getByText("Epic Games")).toBeInTheDocument();
    expect(screen.getByText("Xbox")).toBeInTheDocument();
    expect(screen.getByText(/OG account not linked/i)).toBeInTheDocument();
  });

  it("does not expose OG-only actions for an imported platform contact", () => {
    render(
      <MemoryRouter>
        <FriendsList
          currentUserId="user-1"
          friends={[]}
          friendLinks={[
            friendLink({
              id: "gog-link",
              platform: "gog",
              platformFriendName: "Galaxy Pilot",
            }),
          ]}
          onOpenChat={vi.fn()}
          onOpenInvite={vi.fn()}
          onRemove={vi.fn()}
        />
      </MemoryRouter>,
    );

    const card = screen.getByText("Galaxy Pilot").closest("article");
    expect(card).not.toBeNull();
    expect(within(card!).queryByRole("button", { name: /chat|invite|remove/i })).toBeNull();
    expect(within(card!).queryByRole("link", { name: /profile/i })).toBeNull();
  });
});
