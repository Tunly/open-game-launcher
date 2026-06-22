import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FriendsPage } from "./FriendsPage";

const useCurrentUserMock = vi.hoisted(() => vi.fn());
const profileMocks = vi.hoisted(() => ({
  acceptFriendRequest: vi.fn(),
  blockUser: vi.fn(),
  cancelFriendRequest: vi.fn(),
  declineFriendRequest: vi.fn(),
  getFriends: vi.fn(),
  getMyBlocks: vi.fn(),
  getMyFriendRequests: vi.fn(),
  getProfilesForUsers: vi.fn(),
  removeFriend: vi.fn(),
  searchProfiles: vi.fn(),
  sendFriendRequest: vi.fn(),
  unblockUser: vi.fn(),
}));
const presenceMocks = vi.hoisted(() => ({
  getPresenceGameLine: vi.fn((presence: { currentGameTitle?: string | null }) =>
    presence.currentGameTitle ? `Playing ${presence.currentGameTitle}` : null,
  ),
  getPresencePlatformLabel: vi.fn(() => "Steam"),
  getVisiblePresence: vi.fn(),
  subscribeToPresenceChanges: vi.fn(() => vi.fn()),
}));
const platformMocks = vi.hoisted(() => ({
  getMyPlatformAccounts: vi.fn(),
}));
const socialMocks = vi.hoisted(() => ({
  checkInviteFeasibility: vi.fn(),
  createGameInviteShareToken: vi.fn(),
  getDirectThread: vi.fn(),
  getMyGameInvites: vi.fn(),
  sendCrossplatformInvite: vi.fn(),
  sendDirectMessage: vi.fn(),
  sendGameInvite: vi.fn(),
  subscribeToGameInvites: vi.fn(() => vi.fn()),
  subscribeToRoomMessages: vi.fn(() => vi.fn()),
  updateGameInviteStatus: vi.fn(),
}));
const crossplayMocks = vi.hoisted(() => ({
  getCrossPlayPlatforms: vi.fn(),
}));
const launcherMocks = vi.hoisted(() => ({
  launchCrossPlayJoin: vi.fn(),
}));

vi.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: useCurrentUserMock,
}));
vi.mock("../lib/supabase/profile", () => profileMocks);
vi.mock("../lib/supabase/presence", () => presenceMocks);
vi.mock("../lib/supabase/platform-accounts", () => platformMocks);
vi.mock("../lib/supabase/social", () => socialMocks);
vi.mock("../lib/supabase/crossplay", () => crossplayMocks);
vi.mock("../lib/launcher", () => launcherMocks);

function renderFriendsPage(initialEntry = "/friends") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <FriendsPage />
    </MemoryRouter>,
  );
}

function localFriendCard(name: string) {
  const card = screen.getByText(name).closest("article");
  if (!card) throw new Error(`Card for ${name} not found.`);
  return within(card);
}

describe("FriendsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCurrentUserMock.mockReturnValue({
      isConfigured: false,
      isLoading: false,
      user: null,
    });
    profileMocks.getFriends.mockResolvedValue([]);
    profileMocks.getMyFriendRequests.mockResolvedValue([]);
    profileMocks.getMyBlocks.mockResolvedValue([]);
    profileMocks.getProfilesForUsers.mockResolvedValue(new Map());
    profileMocks.searchProfiles.mockResolvedValue([]);
    presenceMocks.getVisiblePresence.mockResolvedValue([]);
    platformMocks.getMyPlatformAccounts.mockResolvedValue([]);
    socialMocks.getMyGameInvites.mockResolvedValue([]);
    socialMocks.getDirectThread.mockResolvedValue({
      messages: [],
      room: { id: "room-1" },
    });
  });

  it("routes local roster chat handoff into the selected direct-message tab", () => {
    renderFriendsPage();

    fireEvent.click(localFriendCard("Packet Ghost").getByRole("button", { name: /chat/i }));

    expect(screen.getByRole("heading", { name: /direct messages/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("packet-ghost");
    expect(screen.getByText(/Chat handoff staged for Packet Ghost/i)).toBeInTheDocument();
  });

  it("stages local smart join and invite handoffs from the roster", () => {
    renderFriendsPage();

    const packetGhost = localFriendCard("Packet Ghost");
    fireEvent.click(packetGhost.getByRole("button", { name: /smart join/i }));
    expect(
      screen.getByText(/Smart Join staged for Packet Ghost on Neon Drift/i),
    ).toBeInTheDocument();

    fireEvent.click(packetGhost.getByRole("button", { name: /invite/i }));

    expect(screen.getByRole("heading", { name: /cross-platform invites/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Neon Drift")).toBeInTheDocument();
    expect(screen.getByText(/Invite handoff staged for Packet Ghost/i)).toBeInTheDocument();
  });

  it("clears stale configured invite titles when the next friend has no active game", async () => {
    useCurrentUserMock.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      user: { id: "user-1" },
    });
    profileMocks.getFriends.mockResolvedValue([
      {
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
      },
      {
        id: "friendship-2",
        requesterId: "user-1",
        addresseeId: "friend-2",
        status: "accepted",
        requestedAt: "2026-06-17T08:02:00.000Z",
        respondedAt: "2026-06-17T08:03:00.000Z",
        createdAt: "2026-06-17T08:02:00.000Z",
        updatedAt: "2026-06-17T08:03:00.000Z",
        profile: {
          id: "friend-2",
          username: "silentnode",
          displayName: "Silent Node",
          avatarUrl: null,
          profileVisibility: "public",
        },
      },
    ]);
    presenceMocks.getVisiblePresence.mockResolvedValue([
      {
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
      },
      {
        userId: "friend-2",
        status: "online",
        customStatus: null,
        currentGameId: null,
        currentGameTitle: null,
        lastHeartbeatAt: "2026-06-17T08:05:00.000Z",
        platform: null,
        platformGameId: null,
        platformLastPolledAt: null,
        platformSource: null,
        updatedAt: "2026-06-17T08:05:00.000Z",
      },
    ]);
    socialMocks.getDirectThread.mockReturnValue(new Promise(() => {}));

    renderFriendsPage();

    await screen.findByText("Packet Ghost");
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /^invite$/i })).toHaveLength(2),
    );
    await screen.findByText(/Playing Neon Drift/i);

    fireEvent.click(screen.getAllByRole("button", { name: /^invite$/i })[0]);
    expect(screen.getByPlaceholderText(/quick invite/i)).toHaveValue("Neon Drift");

    fireEvent.click(screen.getByRole("button", { name: /^friends$/i }));
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /^invite$/i })).toHaveLength(2),
    );

    fireEvent.click(screen.getAllByRole("button", { name: /^invite$/i })[1]);
    expect(screen.getByPlaceholderText(/quick invite/i)).toHaveValue("");
  });
});
