import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserPlaySession } from "../../lib/supabase/playtime";

const mocks = vi.hoisted(() => ({
  getUserPlaySessions: vi.fn(),
  useCurrentUser: vi.fn(),
}));

vi.mock("../useCurrentUser", () => ({
  useCurrentUser: (...args: unknown[]) => mocks.useCurrentUser(...args),
}));

vi.mock("../../lib/supabase/playtime", () => ({
  getUserPlaySessions: (...args: unknown[]) => mocks.getUserPlaySessions(...args),
}));

import { useUserPlaySessions } from "../useUserPlaySessions";

type MockCurrentUser = {
  isConfigured: boolean;
  isLoading: boolean;
  session: { user: { id: string } } | null;
  user: { id: string } | null;
};

function makeCurrentUser({
  isConfigured = true,
  userId = "user-1",
}: {
  isConfigured?: boolean;
  userId?: string | null;
} = {}): MockCurrentUser {
  const user = userId ? { id: userId } : null;

  return {
    isConfigured,
    isLoading: false,
    session: user ? { user } : null,
    user,
  };
}

function makeSession(overrides: Partial<UserPlaySession> = {}): UserPlaySession {
  return {
    catalogGameId: "game-1",
    durationMinutes: 42,
    endedAt: "2026-06-17T11:42:00.000Z",
    gameCoverUrl: null,
    gameId: "game-1",
    gameTitle: "Neon Runner",
    id: "session-1",
    launcherDeviceId: "device-1",
    platform: "windows",
    startedAt: "2026-06-17T11:00:00.000Z",
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

describe("useUserPlaySessions", () => {
  beforeEach(() => {
    mocks.getUserPlaySessions.mockReset();
    mocks.useCurrentUser.mockReset();
    mocks.useCurrentUser.mockReturnValue(makeCurrentUser());
    mocks.getUserPlaySessions.mockResolvedValue([]);
  });

  it("does not load sessions when Supabase is unconfigured", () => {
    mocks.useCurrentUser.mockReturnValue(makeCurrentUser({ isConfigured: false, userId: null }));

    const { result } = renderHook(() => useUserPlaySessions());

    expect(result.current).toMatchObject({
      error: null,
      isConfigured: false,
      isLoading: false,
      sessions: [],
    });
    expect(mocks.getUserPlaySessions).not.toHaveBeenCalled();
  });

  it("does not load sessions when no user is signed in", async () => {
    mocks.useCurrentUser.mockReturnValue(makeCurrentUser({ userId: null }));

    const { result } = renderHook(() => useUserPlaySessions());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current).toMatchObject({
      error: null,
      isConfigured: true,
      sessions: [],
    });
    expect(mocks.getUserPlaySessions).not.toHaveBeenCalled();
  });

  it("loads the signed-in user's play sessions", async () => {
    const sessions = [makeSession()];
    mocks.getUserPlaySessions.mockResolvedValue(sessions);

    const { result } = renderHook(() => useUserPlaySessions());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.sessions).toEqual(sessions);
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(mocks.getUserPlaySessions).toHaveBeenCalledTimes(1);
    expect(mocks.getUserPlaySessions).toHaveBeenCalledWith();
  });

  it("exposes load errors and stops loading", async () => {
    mocks.getUserPlaySessions.mockRejectedValue(new Error("playtime unavailable"));

    const { result } = renderHook(() => useUserPlaySessions());

    await waitFor(() => {
      expect(result.current.error).toBe("playtime unavailable");
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.sessions).toEqual([]);
  });

  it("refetches sessions on demand", async () => {
    const firstSessions = [makeSession({ id: "session-1" })];
    const secondSessions = [makeSession({ id: "session-2", durationMinutes: 9 })];
    const refetchRequest = deferred<UserPlaySession[]>();
    mocks.getUserPlaySessions
      .mockResolvedValueOnce(firstSessions)
      .mockReturnValueOnce(refetchRequest.promise);

    const { result } = renderHook(() => useUserPlaySessions());

    await waitFor(() => {
      expect(result.current.sessions).toEqual(firstSessions);
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(mocks.getUserPlaySessions).toHaveBeenCalledTimes(2);
      expect(result.current.isLoading).toBe(true);
    });
    expect(result.current.sessions).toEqual(firstSessions);

    await act(async () => {
      refetchRequest.resolve(secondSessions);
      await refetchRequest.promise;
    });

    await waitFor(() => {
      expect(result.current.sessions).toEqual(secondSessions);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it("ignores pending load results after cleanup and unmount", async () => {
    const firstRequest = deferred<UserPlaySession[]>();
    const secondSessions = [makeSession({ id: "session-2", gameId: "game-2" })];
    let currentUser = makeCurrentUser({ userId: "user-1" });
    mocks.useCurrentUser.mockImplementation(() => currentUser);
    mocks.getUserPlaySessions
      .mockReturnValueOnce(firstRequest.promise)
      .mockResolvedValueOnce(secondSessions);

    const { result, rerender, unmount } = renderHook(() => useUserPlaySessions());

    await waitFor(() => {
      expect(mocks.getUserPlaySessions).toHaveBeenCalledTimes(1);
    });

    currentUser = makeCurrentUser({ userId: "user-2" });
    rerender();

    await waitFor(() => {
      expect(result.current.sessions).toEqual(secondSessions);
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      firstRequest.resolve([makeSession({ id: "stale-session" })]);
      await firstRequest.promise;
    });

    expect(result.current.sessions).toEqual(secondSessions);

    const unmountRequest = deferred<UserPlaySession[]>();
    mocks.getUserPlaySessions.mockReturnValueOnce(unmountRequest.promise);

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(mocks.getUserPlaySessions).toHaveBeenCalledTimes(3);
    });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    unmount();

    await act(async () => {
      unmountRequest.resolve([makeSession({ id: "after-unmount" })]);
      await unmountRequest.promise;
    });

    expect(consoleError).not.toHaveBeenCalled();
  });
});
