import { act, render, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlaySession } from "../../../lib/types";

const mocks = vi.hoisted(() => ({
  getUnsyncedPlaySessions: vi.fn(),
  isTauri: vi.fn(),
  listen: vi.fn(),
  markPlaySessionsSynced: vi.fn(),
  syncGameSessions: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => mocks.isTauri(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => mocks.listen(...args),
}));

vi.mock("../../../lib/launcher", () => ({
  getUnsyncedPlaySessions: (...args: unknown[]) => mocks.getUnsyncedPlaySessions(...args),
  markPlaySessionsSynced: (...args: unknown[]) => mocks.markPlaySessionsSynced(...args),
}));

vi.mock("../../../lib/supabase/playtime", () => ({
  syncGameSessions: (...args: unknown[]) => mocks.syncGameSessions(...args),
}));

import { PlaySessionSyncHost, usePlaySessionSync } from "../usePlaySessionSync";

function makeSession(id = "session-1"): PlaySession {
  return {
    id,
    gameId: "steam-owned-440",
    startedAt: 1_782_000_000_000,
    endedAt: 1_782_000_600_000,
    durationMinutes: 10,
    platform: "windows",
    launcherDeviceId: "device-1",
    syncedAt: null,
  };
}

function outcome(
  overrides: Partial<{
    failed: number;
    pushed: number;
    pushedIds: string[];
    skipped: number;
  }> = {},
) {
  return {
    failed: 0,
    pushed: 0,
    pushedIds: [],
    skipped: 0,
    ...overrides,
  };
}

describe("usePlaySessionSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUnsyncedPlaySessions.mockResolvedValue([]);
    mocks.isTauri.mockReturnValue(true);
    mocks.listen.mockResolvedValue(() => undefined);
    mocks.markPlaySessionsSynced.mockResolvedValue(0);
    mocks.syncGameSessions.mockResolvedValue(outcome());
  });

  it("leaves an empty startup queue untouched and supports the host component", async () => {
    const view = render(<PlaySessionSyncHost />);

    await waitFor(() => {
      expect(mocks.getUnsyncedPlaySessions).toHaveBeenCalledTimes(1);
    });
    expect(mocks.syncGameSessions).not.toHaveBeenCalled();
    expect(mocks.markPlaySessionsSynced).not.toHaveBeenCalled();
    expect(mocks.listen).toHaveBeenCalledWith("play_session_recorded", expect.any(Function));

    view.unmount();
  });

  it("does not touch native play-session storage in a browser preview", async () => {
    mocks.isTauri.mockReturnValue(false);

    const view = render(<PlaySessionSyncHost />);
    await act(async () => Promise.resolve());

    expect(mocks.getUnsyncedPlaySessions).not.toHaveBeenCalled();
    expect(mocks.listen).not.toHaveBeenCalled();
    view.unmount();
  });

  it("drains queued sessions, marks only pushed ids, and logs a useful summary", async () => {
    const sessions = [makeSession("session-1"), makeSession("session-2")];
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.getUnsyncedPlaySessions.mockResolvedValue(sessions);
    mocks.syncGameSessions.mockResolvedValue(
      outcome({ pushed: 1, pushedIds: ["session-1"], skipped: 1 }),
    );

    const hook = renderHook(() => usePlaySessionSync());

    await waitFor(() => {
      expect(mocks.syncGameSessions).toHaveBeenCalledWith(sessions);
      expect(mocks.markPlaySessionsSynced).toHaveBeenCalledWith(["session-1"]);
    });
    expect(info).toHaveBeenCalledWith("[usePlaySessionSync] pushed=1 skipped=1 failed=0");

    hook.unmount();
  });

  it("logs failed drain outcomes without marking any local session as synced", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.getUnsyncedPlaySessions.mockResolvedValue([makeSession()]);
    mocks.syncGameSessions.mockResolvedValue(outcome({ failed: 1 }));

    const hook = renderHook(() => usePlaySessionSync());

    await waitFor(() => {
      expect(info).toHaveBeenCalledWith("[usePlaySessionSync] pushed=0 skipped=0 failed=1");
    });
    expect(mocks.markPlaySessionsSynced).not.toHaveBeenCalled();

    hook.unmount();
  });

  it("does not log a summary when every queued session is merely skipped", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.getUnsyncedPlaySessions.mockResolvedValue([makeSession()]);
    mocks.syncGameSessions.mockResolvedValue(outcome({ skipped: 1 }));

    const hook = renderHook(() => usePlaySessionSync());

    await waitFor(() => {
      expect(mocks.syncGameSessions).toHaveBeenCalledTimes(1);
    });
    expect(info).not.toHaveBeenCalled();
    expect(mocks.markPlaySessionsSynced).not.toHaveBeenCalled();

    hook.unmount();
  });

  it("logs startup drain errors and keeps the session eligible for a retry", async () => {
    const error = new Error("local database unavailable");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.getUnsyncedPlaySessions.mockRejectedValue(error);

    const hook = renderHook(() => usePlaySessionSync());

    await waitFor(() => {
      expect(warn).toHaveBeenCalledWith("[usePlaySessionSync] drain failed:", error);
    });
    expect(mocks.syncGameSessions).not.toHaveBeenCalled();
    expect(mocks.markPlaySessionsSynced).not.toHaveBeenCalled();

    hook.unmount();
  });

  it("prevents overlapping interval drains and retries after the first drain settles", async () => {
    let intervalCallback: (() => void) | undefined;
    let resolveSessions: ((sessions: PlaySession[]) => void) | undefined;
    const setIntervalSpy = vi
      .spyOn(window, "setInterval")
      .mockImplementation((callback: TimerHandler, delay?: number) => {
        if (delay === 60_000) {
          intervalCallback = callback as () => void;
        }
        return 73 as unknown as ReturnType<typeof window.setInterval>;
      });
    const clearIntervalSpy = vi.spyOn(window, "clearInterval").mockImplementation(() => undefined);
    mocks.getUnsyncedPlaySessions.mockImplementationOnce(
      () =>
        new Promise<PlaySession[]>((resolve) => {
          resolveSessions = resolve;
        }),
    );

    const hook = renderHook(() => usePlaySessionSync());
    await waitFor(() => expect(mocks.getUnsyncedPlaySessions).toHaveBeenCalledTimes(1));

    act(() => intervalCallback?.());
    expect(mocks.getUnsyncedPlaySessions).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSessions?.([makeSession()]);
    });
    await waitFor(() => expect(mocks.syncGameSessions).toHaveBeenCalledTimes(1));
    act(() => intervalCallback?.());
    await waitFor(() => expect(mocks.getUnsyncedPlaySessions).toHaveBeenCalledTimes(2));

    hook.unmount();
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
    expect(clearIntervalSpy).toHaveBeenCalledWith(73);
  });

  it("pauses interval drains while hidden and catches up when the window becomes visible", async () => {
    let intervalCallback: (() => void) | undefined;
    let visibilityState: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibilityState);
    vi.spyOn(window, "setInterval").mockImplementation((callback: TimerHandler) => {
      intervalCallback = callback as () => void;
      return 91 as unknown as ReturnType<typeof window.setInterval>;
    });

    const hook = renderHook(() => usePlaySessionSync());
    await waitFor(() => expect(mocks.getUnsyncedPlaySessions).toHaveBeenCalledTimes(1));

    visibilityState = "hidden";
    act(() => intervalCallback?.());
    expect(mocks.getUnsyncedPlaySessions).toHaveBeenCalledTimes(1);

    visibilityState = "visible";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(mocks.getUnsyncedPlaySessions).toHaveBeenCalledTimes(2));

    hook.unmount();
  });

  it("stops a pending startup drain from pushing after unmount", async () => {
    let resolveSessions: ((sessions: PlaySession[]) => void) | undefined;
    mocks.getUnsyncedPlaySessions.mockImplementation(
      () =>
        new Promise<PlaySession[]>((resolve) => {
          resolveSessions = resolve;
        }),
    );
    const hook = renderHook(() => usePlaySessionSync());
    await waitFor(() => expect(mocks.getUnsyncedPlaySessions).toHaveBeenCalledTimes(1));

    hook.unmount();
    await act(async () => {
      resolveSessions?.([makeSession()]);
      await Promise.resolve();
    });

    expect(mocks.syncGameSessions).not.toHaveBeenCalled();
  });

  it("pushes Tauri session events, handles skips and errors, and unregisters on cleanup", async () => {
    type SessionEventHandler = (event: { payload: PlaySession }) => Promise<void>;
    let eventHandler: SessionEventHandler | undefined;
    const unlisten = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.isTauri.mockReturnValue(true);
    mocks.listen.mockImplementation((_eventName: string, handler: SessionEventHandler) => {
      eventHandler = handler;
      return Promise.resolve(unlisten);
    });

    const hook = renderHook(() => usePlaySessionSync());
    await waitFor(() => {
      expect(mocks.listen).toHaveBeenCalledWith("play_session_recorded", expect.any(Function));
      expect(mocks.getUnsyncedPlaySessions).toHaveBeenCalledTimes(1);
    });

    const pushed = makeSession("event-pushed");
    mocks.syncGameSessions.mockResolvedValueOnce(outcome({ pushed: 1, pushedIds: [pushed.id] }));
    await act(async () => {
      await eventHandler?.({ payload: pushed });
    });
    expect(mocks.markPlaySessionsSynced).toHaveBeenCalledWith([pushed.id]);

    const skipped = makeSession("event-skipped");
    mocks.syncGameSessions.mockResolvedValueOnce(outcome({ skipped: 1 }));
    await act(async () => {
      await eventHandler?.({ payload: skipped });
    });
    expect(mocks.markPlaySessionsSynced).toHaveBeenCalledTimes(1);

    const failed = makeSession("event-failed");
    const failure = new Error("network offline");
    mocks.syncGameSessions.mockRejectedValueOnce(failure);
    await act(async () => {
      await eventHandler?.({ payload: failed });
    });
    expect(warn).toHaveBeenCalledWith("[usePlaySessionSync] event push failed:", failure);

    hook.unmount();
    await waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1));

    await act(async () => {
      await eventHandler?.({ payload: makeSession("event-after-unmount") });
    });
    expect(mocks.syncGameSessions).toHaveBeenCalledTimes(3);
  });
});
