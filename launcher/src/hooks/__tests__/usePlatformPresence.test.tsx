import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FriendLink } from "../../lib/types/friends";
import type { UserPresence } from "../../lib/types/profile";

const mocks = vi.hoisted(() => ({
  getMyFriendLinks: vi.fn(),
  getVisiblePresence: vi.fn(),
  presenceCallbacks: [] as Array<(presence: unknown) => void>,
  subscribeToPresenceChanges: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("../../lib/supabase/friend-links", () => ({
  getMyFriendLinks: (...args: unknown[]) => mocks.getMyFriendLinks(...args),
}));

vi.mock("../../lib/supabase/presence", () => ({
  getVisiblePresence: (...args: unknown[]) => mocks.getVisiblePresence(...args),
  subscribeToPresenceChanges: (...args: unknown[]) => mocks.subscribeToPresenceChanges(...args),
}));

import { usePlatformPresence } from "../usePlatformPresence";

function makePresence(overrides: Partial<UserPresence> = {}): UserPresence {
  return {
    customStatus: null,
    currentGameId: null,
    currentGameTitle: null,
    lastHeartbeatAt: "2026-06-17T11:30:00.000Z",
    platform: "og",
    platformGameId: null,
    platformLastPolledAt: null,
    platformSource: null,
    status: "offline",
    updatedAt: "2026-06-17T11:30:00.000Z",
    userId: "friend-1",
    ...overrides,
  };
}

function makeFriendLink(overrides: Partial<FriendLink> = {}): FriendLink {
  return {
    createdAt: "2026-06-17T11:30:00.000Z",
    dismissed: false,
    id: "link-1",
    matchMethod: "linked_account",
    matchedUserId: "friend-1",
    mergeGroupId: null,
    ownerId: "user-1",
    platform: "steam",
    platformFriendAvatar: null,
    platformFriendId: "steam-friend-1",
    platformFriendName: "Steam Friend",
    updatedAt: "2026-06-17T11:30:00.000Z",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

function renderPresenceHook(friendIds: string[]) {
  return renderHook(({ friendIds: ids }: { friendIds: string[] }) => usePlatformPresence(ids), {
    initialProps: { friendIds },
  });
}

describe("usePlatformPresence", () => {
  beforeEach(() => {
    mocks.getMyFriendLinks.mockReset();
    mocks.getVisiblePresence.mockReset();
    mocks.presenceCallbacks.length = 0;
    mocks.subscribeToPresenceChanges.mockReset();
    mocks.unsubscribe.mockReset();

    mocks.getMyFriendLinks.mockResolvedValue([]);
    mocks.getVisiblePresence.mockResolvedValue([]);
    mocks.subscribeToPresenceChanges.mockImplementation(
      (_friendIds: string[], onChange: (presence: unknown) => void) => {
        mocks.presenceCallbacks.push(onChange);
        return mocks.unsubscribe;
      },
    );
  });

  it("clears aggregated presence and skips presence loading for an empty friend list", async () => {
    mocks.getVisiblePresence.mockResolvedValueOnce([
      makePresence({
        currentGameTitle: "Neon Rally",
        status: "online",
      }),
    ]);

    const { result, rerender } = renderPresenceHook(["friend-1"]);

    await waitFor(() => {
      expect(result.current["friend-1"]?.bestStatus).toBe("online");
    });

    mocks.getVisiblePresence.mockClear();
    mocks.subscribeToPresenceChanges.mockClear();

    rerender({ friendIds: [] });

    await waitFor(() => {
      expect(result.current).toEqual({});
    });
    expect(mocks.getVisiblePresence).not.toHaveBeenCalled();
    expect(mocks.subscribeToPresenceChanges).not.toHaveBeenCalled();
  });

  it("aggregates initial visible OG presence with best status and current game", async () => {
    mocks.getVisiblePresence.mockResolvedValueOnce([
      makePresence({
        currentGameTitle: "Neon Rally",
        status: "busy",
        userId: "friend-1",
      }),
      makePresence({
        currentGameTitle: null,
        status: "online",
        userId: "friend-2",
      }),
    ]);

    const { result } = renderPresenceHook(["friend-1", "friend-2"]);

    await waitFor(() => {
      expect(result.current["friend-1"]?.bestStatus).toBe("busy");
      expect(result.current["friend-2"]?.bestStatus).toBe("online");
    });

    expect(result.current).toEqual({
      "friend-1": {
        bestStatus: "busy",
        currentGame: "Neon Rally",
        platforms: [{ currentGame: "Neon Rally", platform: "og", status: "busy" }],
        userId: "friend-1",
      },
      "friend-2": {
        bestStatus: "online",
        currentGame: null,
        platforms: [{ currentGame: null, platform: "og", status: "online" }],
        userId: "friend-2",
      },
    });
    expect(mocks.getVisiblePresence).toHaveBeenCalledWith(["friend-1", "friend-2"]);
    expect(mocks.subscribeToPresenceChanges).toHaveBeenCalledWith(
      ["friend-1", "friend-2"],
      expect.any(Function),
    );
  });

  it("aggregates subscription updates into the current status", async () => {
    const { result } = renderPresenceHook(["friend-1"]);

    await waitFor(() => {
      expect(result.current["friend-1"]?.bestStatus).toBe("offline");
      expect(mocks.presenceCallbacks).toHaveLength(1);
    });

    act(() => {
      mocks.presenceCallbacks[0](
        makePresence({
          currentGameTitle: "Sky Keep",
          status: "away",
        }),
      );
    });

    await waitFor(() => {
      expect(result.current["friend-1"]).toEqual({
        bestStatus: "away",
        currentGame: "Sky Keep",
        platforms: [{ currentGame: "Sky Keep", platform: "og", status: "away" }],
        userId: "friend-1",
      });
    });

    act(() => {
      mocks.presenceCallbacks[0](
        makePresence({
          currentGameTitle: "Rocket Chef",
          status: "online",
        }),
      );
    });

    await waitFor(() => {
      expect(result.current["friend-1"]?.bestStatus).toBe("online");
      expect(result.current["friend-1"]?.currentGame).toBe("Rocket Chef");
    });
  });

  it("adds unknown platform lanes from matched friend links", async () => {
    mocks.getMyFriendLinks.mockResolvedValueOnce([
      makeFriendLink({
        id: "link-steam",
        platform: "steam",
        platformFriendId: "steam-friend-1",
        platformFriendName: "Steam Friend",
      }),
      makeFriendLink({
        id: "link-epic",
        platform: "epic",
        platformFriendId: "epic-friend-1",
        platformFriendName: "Epic Friend",
      }),
      makeFriendLink({
        id: "link-other-user",
        matchedUserId: "friend-2",
        platform: "gog",
        platformFriendId: "gog-friend-2",
      }),
      makeFriendLink({
        id: "link-unmatched",
        matchedUserId: null,
        platform: "xbox",
        platformFriendId: "xbox-friend",
      }),
    ]);

    const { result } = renderPresenceHook(["friend-1"]);

    await waitFor(() => {
      expect(result.current["friend-1"]?.platforms).toHaveLength(2);
    });

    expect(result.current["friend-1"]).toEqual({
      bestStatus: "offline",
      currentGame: null,
      platforms: [
        { currentGame: null, platform: "steam", status: "unknown" },
        { currentGame: null, platform: "epic", status: "unknown" },
      ],
      userId: "friend-1",
    });
  });

  it("ignores getMyFriendLinks errors while keeping OG presence", async () => {
    mocks.getVisiblePresence.mockResolvedValueOnce([
      makePresence({
        currentGameTitle: "Tactical Bloom",
        status: "away",
      }),
    ]);
    mocks.getMyFriendLinks.mockRejectedValueOnce(new Error("friend links unavailable"));

    const { result } = renderPresenceHook(["friend-1"]);

    await waitFor(() => {
      expect(result.current["friend-1"]).toEqual({
        bestStatus: "away",
        currentGame: "Tactical Bloom",
        platforms: [{ currentGame: "Tactical Bloom", platform: "og", status: "away" }],
        userId: "friend-1",
      });
    });
    expect(mocks.getMyFriendLinks).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes on unmount while a visible presence load is pending", async () => {
    const pendingRequest = deferred<UserPresence[]>();
    const unsubscribe = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getVisiblePresence.mockReturnValueOnce(pendingRequest.promise);
    mocks.subscribeToPresenceChanges.mockImplementationOnce(
      (_friendIds: string[], onChange: (presence: unknown) => void) => {
        mocks.presenceCallbacks.push(onChange);
        return unsubscribe;
      },
    );

    const { unmount } = renderPresenceHook(["friend-1"]);

    await waitFor(() => {
      expect(mocks.subscribeToPresenceChanges).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingRequest.resolve([
        makePresence({
          currentGameTitle: "After Unmount",
          status: "online",
        }),
      ]);
      await pendingRequest.promise;
    });

    expect(consoleError).not.toHaveBeenCalled();
  });

  it("unsubscribes during cleanup and ignores stale visible presence loads", async () => {
    const staleRequest = deferred<UserPresence[]>();
    const friendOneUnsubscribe = vi.fn();
    const friendTwoUnsubscribe = vi.fn();
    mocks.getVisiblePresence.mockReturnValueOnce(staleRequest.promise).mockResolvedValueOnce([
      makePresence({
        currentGameTitle: "Sky Keep",
        status: "online",
        userId: "friend-2",
      }),
    ]);
    mocks.subscribeToPresenceChanges
      .mockImplementationOnce((_friendIds: string[], onChange: (presence: unknown) => void) => {
        mocks.presenceCallbacks.push(onChange);
        return friendOneUnsubscribe;
      })
      .mockImplementationOnce((_friendIds: string[], onChange: (presence: unknown) => void) => {
        mocks.presenceCallbacks.push(onChange);
        return friendTwoUnsubscribe;
      });

    const { result, rerender, unmount } = renderPresenceHook(["friend-1"]);

    await waitFor(() => {
      expect(mocks.subscribeToPresenceChanges).toHaveBeenCalledTimes(1);
    });

    rerender({ friendIds: ["friend-2"] });

    await waitFor(() => {
      expect(friendOneUnsubscribe).toHaveBeenCalledTimes(1);
      expect(result.current["friend-2"]?.bestStatus).toBe("online");
    });

    await act(async () => {
      staleRequest.resolve([
        makePresence({
          currentGameTitle: "Stale Arcade",
          status: "busy",
          userId: "friend-1",
        }),
      ]);
      await staleRequest.promise;
    });

    expect(result.current).toEqual({
      "friend-2": {
        bestStatus: "online",
        currentGame: "Sky Keep",
        platforms: [{ currentGame: "Sky Keep", platform: "og", status: "online" }],
        userId: "friend-2",
      },
    });

    unmount();

    expect(friendTwoUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
