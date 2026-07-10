import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserPlaySession } from "../../lib/supabase/playtime";

const mocks = vi.hoisted(() => ({
  getUserPlaySessionYears: vi.fn(),
  getUserPlaySessions: vi.fn(),
  useCurrentUser: vi.fn(),
}));

vi.mock("../useCurrentUser", () => ({
  useCurrentUser: (...args: unknown[]) => mocks.useCurrentUser(...args),
}));

vi.mock("../../lib/supabase/playtime", () => ({
  getUserPlaySessionYears: (...args: unknown[]) => mocks.getUserPlaySessionYears(...args),
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
  isLoading = false,
  userId = "user-1",
}: {
  isConfigured?: boolean;
  isLoading?: boolean;
  userId?: string | null;
} = {}): MockCurrentUser {
  const user = userId ? { id: userId } : null;

  return {
    isConfigured,
    isLoading,
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
    mocks.getUserPlaySessionYears.mockReset();
    mocks.getUserPlaySessions.mockReset();
    mocks.useCurrentUser.mockReset();
    mocks.useCurrentUser.mockReturnValue(makeCurrentUser());
    mocks.getUserPlaySessionYears.mockResolvedValue([]);
    mocks.getUserPlaySessions.mockResolvedValue([]);
  });

  it("does not load sessions when Supabase is unconfigured", () => {
    mocks.useCurrentUser.mockReturnValue(makeCurrentUser({ isConfigured: false, userId: null }));

    const { result } = renderHook(() => useUserPlaySessions());

    expect(result.current).toMatchObject({
      availableYears: [],
      error: null,
      isAuthenticated: false,
      isConfigured: false,
      isLoading: false,
      sessions: [],
    });
    expect(mocks.getUserPlaySessionYears).not.toHaveBeenCalled();
    expect(mocks.getUserPlaySessions).not.toHaveBeenCalled();
  });

  it("does not load sessions when no user is signed in", async () => {
    mocks.useCurrentUser.mockReturnValue(makeCurrentUser({ userId: null }));

    const { result } = renderHook(() => useUserPlaySessions());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current).toMatchObject({
      availableYears: [],
      error: null,
      isAuthenticated: false,
      isConfigured: true,
      sessions: [],
    });
    expect(mocks.getUserPlaySessionYears).not.toHaveBeenCalled();
    expect(mocks.getUserPlaySessions).not.toHaveBeenCalled();
  });

  it("stays loading while configured authentication is still hydrating", () => {
    mocks.useCurrentUser.mockReturnValue(makeCurrentUser({ isLoading: true, userId: null }));

    const { result } = renderHook(() => useUserPlaySessions());

    expect(result.current).toMatchObject({
      availableYears: [],
      error: null,
      isAuthenticated: false,
      isConfigured: true,
      isLoading: true,
      sessions: [],
    });
    expect(mocks.getUserPlaySessionYears).not.toHaveBeenCalled();
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
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.availableYears).toEqual([]);
    expect(mocks.getUserPlaySessionYears).not.toHaveBeenCalled();
    expect(mocks.getUserPlaySessions).toHaveBeenCalledTimes(1);
    expect(mocks.getUserPlaySessions).toHaveBeenCalledWith();
  });

  it("forwards stable calendar range values without refetching equivalent dates", async () => {
    const since = new Date("2025-01-01T00:00:00.000Z");
    const until = new Date("2026-01-01T00:00:00.000Z");
    const { rerender } = renderHook(({ range }) => useUserPlaySessions(range), {
      initialProps: {
        range: { since, until } as { since?: Date | string; until?: Date | string },
      },
    });

    await waitFor(() => {
      expect(mocks.getUserPlaySessions).toHaveBeenCalledTimes(1);
    });
    expect(mocks.getUserPlaySessions).toHaveBeenLastCalledWith({ since, until });

    rerender({
      range: {
        since: "2025-01-01T00:00:00.000Z",
        until: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.getUserPlaySessions).toHaveBeenCalledTimes(1);
  });

  it("optionally loads the user's available activity years", async () => {
    mocks.getUserPlaySessionYears.mockResolvedValue([2026, 2024]);

    const { result } = renderHook(() => useUserPlaySessions({ includeAvailableYears: true }));

    await waitFor(() => {
      expect(result.current.availableYears).toEqual([2026, 2024]);
      expect(result.current.isLoading).toBe(false);
    });

    expect(mocks.getUserPlaySessions).toHaveBeenCalledTimes(1);
    expect(mocks.getUserPlaySessionYears).toHaveBeenCalledTimes(1);
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
    mocks.getUserPlaySessionYears.mockResolvedValueOnce([2026]).mockResolvedValueOnce([2026, 2025]);
    mocks.getUserPlaySessions
      .mockResolvedValueOnce(firstSessions)
      .mockReturnValueOnce(refetchRequest.promise);

    const { result } = renderHook(() => useUserPlaySessions({ includeAvailableYears: true }));

    await waitFor(() => {
      expect(result.current.sessions).toEqual(firstSessions);
      expect(result.current.availableYears).toEqual([2026]);
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(mocks.getUserPlaySessions).toHaveBeenCalledTimes(2);
      expect(mocks.getUserPlaySessionYears).toHaveBeenCalledTimes(2);
      expect(result.current.isLoading).toBe(true);
    });
    expect(result.current.sessions).toEqual(firstSessions);

    await act(async () => {
      refetchRequest.resolve(secondSessions);
      await refetchRequest.promise;
    });

    await waitFor(() => {
      expect(result.current.sessions).toEqual(secondSessions);
      expect(result.current.availableYears).toEqual([2026, 2025]);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it("propagates an available-year load error", async () => {
    mocks.getUserPlaySessionYears.mockRejectedValue(new Error("year index unavailable"));

    const { result } = renderHook(() => useUserPlaySessions({ includeAvailableYears: true }));

    await waitFor(() => {
      expect(result.current.error).toBe("year index unavailable");
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.sessions).toEqual([]);
    expect(result.current.availableYears).toEqual([]);
  });

  it("ignores stale session and year results after a calendar range change", async () => {
    const staleSessionsRequest = deferred<UserPlaySession[]>();
    const staleYearsRequest = deferred<number[]>();
    const currentSessions = [makeSession({ id: "current-session" })];
    mocks.getUserPlaySessions
      .mockReturnValueOnce(staleSessionsRequest.promise)
      .mockResolvedValueOnce(currentSessions);
    mocks.getUserPlaySessionYears
      .mockReturnValueOnce(staleYearsRequest.promise)
      .mockResolvedValueOnce([2026]);

    const { result, rerender } = renderHook(
      ({ since, until }) => useUserPlaySessions({ since, until, includeAvailableYears: true }),
      {
        initialProps: {
          since: "2025-01-01T00:00:00.000Z",
          until: "2026-01-01T00:00:00.000Z",
        },
      },
    );

    await waitFor(() => {
      expect(mocks.getUserPlaySessions).toHaveBeenCalledTimes(1);
      expect(mocks.getUserPlaySessionYears).toHaveBeenCalledTimes(1);
    });

    rerender({
      since: "2026-01-01T00:00:00.000Z",
      until: "2027-01-01T00:00:00.000Z",
    });

    await waitFor(() => {
      expect(result.current.sessions).toEqual(currentSessions);
      expect(result.current.availableYears).toEqual([2026]);
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      staleSessionsRequest.resolve([makeSession({ id: "stale-session" })]);
      staleYearsRequest.resolve([2025]);
      await Promise.all([staleSessionsRequest.promise, staleYearsRequest.promise]);
    });

    expect(result.current.sessions).toEqual(currentSessions);
    expect(result.current.availableYears).toEqual([2026]);
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

  it("clears committed activity when the authenticated user changes and the new load fails", async () => {
    const userOneSessions = [makeSession({ id: "user-one-session" })];
    let currentUser = makeCurrentUser({ userId: "user-1" });
    mocks.useCurrentUser.mockImplementation(() => currentUser);
    mocks.getUserPlaySessions
      .mockResolvedValueOnce(userOneSessions)
      .mockRejectedValueOnce(new Error("user two unavailable"));
    mocks.getUserPlaySessionYears.mockResolvedValueOnce([2026]).mockResolvedValueOnce([2025]);

    const { result, rerender } = renderHook(() =>
      useUserPlaySessions({ includeAvailableYears: true }),
    );

    await waitFor(() => {
      expect(result.current.sessions).toEqual(userOneSessions);
      expect(result.current.availableYears).toEqual([2026]);
      expect(result.current.isLoading).toBe(false);
    });

    currentUser = makeCurrentUser({ userId: "user-2" });
    rerender();

    await waitFor(() => {
      expect(result.current.error).toBe("user two unavailable");
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.sessions).toEqual([]);
    expect(result.current.availableYears).toEqual([]);
  });
});
