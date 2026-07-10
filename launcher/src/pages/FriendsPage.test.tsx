import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FriendsPage } from "./FriendsPage";
import type { ChatMessage } from "../lib/types/profile";

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
  getPlatformAccountsForUser: vi.fn(),
}));
const activityMocks = vi.hoisted(() => ({
  getFriendActivityFeed: vi.fn(),
  postActivity: vi.fn(),
  subscribeToFriendActivity: vi.fn(() => vi.fn()),
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
  subscribeToRoomMessages: vi.fn<
    (roomId: string, onMessage: (message: ChatMessage) => void) => () => void
  >(() => vi.fn()),
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
vi.mock("../lib/supabase/activity", () => activityMocks);
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

function configuredFriendships() {
  return [
    {
      addresseeId: "friend-1",
      createdAt: "2026-06-17T08:00:00.000Z",
      id: "friendship-1",
      profile: {
        avatarUrl: null,
        displayName: "Packet Ghost",
        id: "friend-1",
        profileVisibility: "public",
        username: "packetghost",
      },
      requesterId: "user-1",
      requestedAt: "2026-06-17T08:00:00.000Z",
      respondedAt: "2026-06-17T08:01:00.000Z",
      status: "accepted",
      updatedAt: "2026-06-17T08:01:00.000Z",
    },
    {
      addresseeId: "friend-2",
      createdAt: "2026-06-17T08:02:00.000Z",
      id: "friendship-2",
      profile: {
        avatarUrl: null,
        displayName: "Silent Node",
        id: "friend-2",
        profileVisibility: "public",
        username: "silentnode",
      },
      requesterId: "user-1",
      requestedAt: "2026-06-17T08:02:00.000Z",
      respondedAt: "2026-06-17T08:03:00.000Z",
      status: "accepted",
      updatedAt: "2026-06-17T08:03:00.000Z",
    },
  ];
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
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
    platformMocks.getPlatformAccountsForUser.mockResolvedValue([]);
    activityMocks.getFriendActivityFeed.mockResolvedValue([]);
    activityMocks.postActivity.mockResolvedValue({ id: "status-1" });
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

  it("renders the local activity tab with Steam-like feed regions", () => {
    renderFriendsPage("/friends?tab=activity");

    expect(screen.getByRole("region", { name: /friend activity tab/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /friend activity/i })).toBeInTheDocument();
    expect(screen.queryByText("Friend Activity Settings")).not.toBeInTheDocument();
    expect(screen.queryByText("My Activity")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/post a status to your friends/i)).not.toBeInTheDocument();
    expect(screen.getByText(/local preview entries are read-only/i)).toBeInTheDocument();
    expect(screen.getAllByText("Packet Ghost").length).toBeGreaterThan(0);
    expect(screen.getByText(/shared a new session/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /friends online/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /upcoming events/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /rate up/i })).not.toBeInTheDocument();
  });

  it("persists a configured activity status through the real activity API", async () => {
    useCurrentUserMock.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      user: { id: "user-1" },
    });
    profileMocks.getFriends.mockResolvedValue([]);
    renderFriendsPage("/friends?tab=activity");

    const composer = await screen.findByPlaceholderText(/post a status to your friends/i);
    fireEvent.change(composer, { target: { value: "Ready for co-op" } });
    fireEvent.click(screen.getByRole("button", { name: /post status/i }));

    await waitFor(() => {
      expect(activityMocks.postActivity).toHaveBeenCalledWith("status", {
        gameId: null,
        gameTitle: null,
        metadata: { text: "Ready for co-op" },
        visibility: "friends_only",
      });
    });
    expect(await screen.findByText("Status posted to friend activity.")).toBeVisible();
  });

  it("loads the selected friend's real platforms for invite feasibility", async () => {
    useCurrentUserMock.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      user: { id: "user-1" },
    });
    profileMocks.getFriends.mockResolvedValue([
      {
        addresseeId: "friend-1",
        createdAt: "2026-06-17T08:00:00.000Z",
        id: "friendship-1",
        profile: {
          avatarUrl: null,
          displayName: "Packet Ghost",
          id: "friend-1",
          profileVisibility: "public",
          username: "packetghost",
        },
        requesterId: "user-1",
        requestedAt: "2026-06-17T08:00:00.000Z",
        respondedAt: "2026-06-17T08:01:00.000Z",
        status: "accepted",
        updatedAt: "2026-06-17T08:01:00.000Z",
      },
    ]);
    platformMocks.getMyPlatformAccounts.mockResolvedValue([{ platform: "steam" }]);
    platformMocks.getPlatformAccountsForUser.mockResolvedValue([{ platform: "xbox" }]);
    socialMocks.checkInviteFeasibility.mockResolvedValue("possible");
    renderFriendsPage("/friends?tab=invites");

    await waitFor(() => {
      expect(platformMocks.getPlatformAccountsForUser).toHaveBeenCalledWith("friend-1");
    });
    fireEvent.change(screen.getByPlaceholderText("Game title..."), {
      target: { value: "Steel Battalion X" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check feasibility/i }));

    await waitFor(() => {
      expect(socialMocks.checkInviteFeasibility).toHaveBeenCalledWith(
        "Steel Battalion X",
        ["steam"],
        ["xbox"],
      );
    });
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
    await waitFor(() => {
      expect(platformMocks.getPlatformAccountsForUser).toHaveBeenCalledWith("friend-2");
    });
  });

  it("clears the old direct-message thread immediately when the next thread fails", async () => {
    useCurrentUserMock.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      user: { id: "user-1" },
    });
    profileMocks.getFriends.mockResolvedValue(configuredFriendships());
    const nextThread = deferred<never>();
    socialMocks.getDirectThread.mockImplementation((friendId: string) => {
      if (friendId === "friend-1") {
        return Promise.resolve({
          messages: [
            {
              content: "Private message for Packet Ghost",
              createdAt: "2026-06-17T08:04:00.000Z",
              deletedAt: null,
              id: "message-1",
              roomId: "room-1",
              senderId: "friend-1",
              updatedAt: "2026-06-17T08:04:00.000Z",
            },
          ],
          room: { id: "room-1" },
        });
      }
      return nextThread.promise;
    });

    renderFriendsPage("/friends?tab=chat");

    expect(await screen.findByText("Private message for Packet Ghost")).toBeVisible();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "friend-2" } });

    expect(screen.getByRole("combobox")).toHaveValue("friend-2");
    expect(screen.queryByText("Private message for Packet Ghost")).not.toBeInTheDocument();

    await act(async () => {
      nextThread.reject(new Error("Silent Node thread unavailable"));
      await nextThread.promise.catch(() => undefined);
    });

    expect(screen.queryByText("Private message for Packet Ghost")).not.toBeInTheDocument();
  });

  it("isolates delayed refresh results when the signed-in account changes", async () => {
    useCurrentUserMock.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      user: { id: "user-1" },
    });
    const delayedUserOneFriends = deferred<ReturnType<typeof configuredFriendships>>();
    profileMocks.getFriends.mockImplementation((userId: string) =>
      userId === "user-1"
        ? delayedUserOneFriends.promise
        : Promise.resolve([
            {
              addresseeId: "friend-3",
              createdAt: "2026-06-17T09:00:00.000Z",
              id: "friendship-3",
              profile: {
                avatarUrl: null,
                displayName: "Second Account Friend",
                id: "friend-3",
                profileVisibility: "public",
                username: "secondfriend",
              },
              requesterId: "user-2",
              requestedAt: "2026-06-17T09:00:00.000Z",
              respondedAt: "2026-06-17T09:01:00.000Z",
              status: "accepted",
              updatedAt: "2026-06-17T09:01:00.000Z",
            },
          ]),
    );
    const view = renderFriendsPage();

    await waitFor(() => expect(profileMocks.getFriends).toHaveBeenCalledWith("user-1"));
    useCurrentUserMock.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      user: { id: "user-2" },
    });
    view.rerender(
      <MemoryRouter initialEntries={["/friends"]}>
        <FriendsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Second Account Friend")).toBeVisible();

    await act(async () => {
      delayedUserOneFriends.resolve(configuredFriendships());
      await delayedUserOneFriends.promise;
    });

    expect(screen.getByText("Second Account Friend")).toBeVisible();
    expect(screen.queryByText("Packet Ghost")).not.toBeInTheDocument();
    expect(screen.queryByText("Silent Node")).not.toBeInTheDocument();
  });

  it("keeps the current account epoch active through StrictMode effect replay", async () => {
    useCurrentUserMock.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      user: { id: "user-1" },
    });
    profileMocks.getFriends.mockResolvedValue(configuredFriendships());

    render(
      <StrictMode>
        <MemoryRouter initialEntries={["/friends"]}>
          <FriendsPage />
        </MemoryRouter>
      </StrictMode>,
    );

    expect(await screen.findByText("Packet Ghost")).toBeVisible();
    expect(screen.getByText("Silent Node")).toBeVisible();
    expect(profileMocks.getFriends).toHaveBeenCalledWith("user-1");
  });

  it("clears account-owned chat state and detaches old subscriptions on account switch", async () => {
    useCurrentUserMock.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      user: { id: "user-1" },
    });
    profileMocks.getFriends.mockResolvedValue(configuredFriendships());
    socialMocks.getDirectThread.mockResolvedValue({
      messages: [
        {
          content: "Only visible to the first account",
          createdAt: "2026-06-17T08:04:00.000Z",
          deletedAt: null,
          id: "message-account-1",
          roomId: "room-account-1",
          senderId: "friend-1",
          updatedAt: "2026-06-17T08:04:00.000Z",
        },
      ],
      room: { id: "room-account-1" },
    });
    const unsubscribeMessages = vi.fn();
    let oldMessageCallback: ((message: ChatMessage) => void) | null = null;
    socialMocks.subscribeToRoomMessages.mockImplementation(
      (_roomId: string, onMessage: (message: ChatMessage) => void) => {
        oldMessageCallback = onMessage;
        return unsubscribeMessages;
      },
    );
    const unsubscribeInvites = vi.fn();
    socialMocks.subscribeToGameInvites.mockReturnValue(unsubscribeInvites);
    const view = renderFriendsPage("/friends?tab=chat");

    expect(await screen.findByText("Only visible to the first account")).toBeVisible();

    useCurrentUserMock.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      user: { id: "user-2" },
    });
    profileMocks.getFriends.mockResolvedValue([]);
    view.rerender(
      <MemoryRouter initialEntries={["/friends?tab=chat"]}>
        <FriendsPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText("Only visible to the first account")).not.toBeInTheDocument();
    expect(unsubscribeMessages).toHaveBeenCalledOnce();
    expect(unsubscribeInvites).toHaveBeenCalledOnce();

    act(() => {
      oldMessageCallback?.({
        content: "Late message from the first account",
        createdAt: "2026-06-17T08:10:00.000Z",
        deletedAt: null,
        id: "late-account-1",
        roomId: "room-account-1",
        senderId: "friend-1",
        updatedAt: "2026-06-17T08:10:00.000Z",
      });
    });

    expect(screen.queryByText("Late message from the first account")).not.toBeInTheDocument();
  });

  it("does not append a delayed send result to a newly selected friend's thread", async () => {
    useCurrentUserMock.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      user: { id: "user-1" },
    });
    profileMocks.getFriends.mockResolvedValue(configuredFriendships());
    socialMocks.getDirectThread.mockImplementation((friendId: string) =>
      Promise.resolve(
        friendId === "friend-1"
          ? { messages: [], room: { id: "room-1" } }
          : {
              messages: [
                {
                  content: "Silent Node thread only",
                  createdAt: "2026-06-17T08:06:00.000Z",
                  deletedAt: null,
                  id: "message-2",
                  roomId: "room-2",
                  senderId: "friend-2",
                  updatedAt: "2026-06-17T08:06:00.000Z",
                },
              ],
              room: { id: "room-2" },
            },
      ),
    );
    const pendingSend = deferred<{
      content: string;
      createdAt: string;
      deletedAt: null;
      id: string;
      roomId: string;
      senderId: string;
      updatedAt: string;
    }>();
    socialMocks.sendDirectMessage.mockReturnValue(pendingSend.promise);

    renderFriendsPage("/friends?tab=chat");

    await waitFor(() => {
      expect(socialMocks.getDirectThread).toHaveBeenCalledWith("friend-1");
    });
    fireEvent.change(screen.getByPlaceholderText("Write message..."), {
      target: { value: "Message meant for Packet Ghost" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));
    expect(socialMocks.sendDirectMessage).toHaveBeenCalledWith(
      "friend-1",
      "Message meant for Packet Ghost",
    );

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "friend-2" } });
    expect(await screen.findByText("Silent Node thread only")).toBeVisible();

    await act(async () => {
      pendingSend.resolve({
        content: "Message meant for Packet Ghost",
        createdAt: "2026-06-17T08:07:00.000Z",
        deletedAt: null,
        id: "sent-message-1",
        roomId: "room-1",
        senderId: "user-1",
        updatedAt: "2026-06-17T08:07:00.000Z",
      });
      await pendingSend.promise;
    });

    expect(screen.getByText("Silent Node thread only")).toBeVisible();
    expect(screen.queryByText("Message meant for Packet Ghost")).not.toBeInTheDocument();
  });
});
