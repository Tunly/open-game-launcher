import { act, render } from "@testing-library/react";
import { isTauri } from "@tauri-apps/api/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RemoteCompanionAutoPollHost } from "./RemoteCompanionAutoPollHost";
import {
  REMOTE_COMPANION_AUTO_POLL_INTERVAL_MS,
  runRemoteCompanionAlwaysOnPollOnce,
} from "../../lib/remote-companion-auto-poll";

const autoPollMocks = vi.hoisted(() => ({
  runRemoteCompanionAlwaysOnPollOnce: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("../../lib/remote-companion-auto-poll", () => ({
  REMOTE_COMPANION_AUTO_POLL_INTERVAL_MS: 60_000,
  runRemoteCompanionAlwaysOnPollOnce: autoPollMocks.runRemoteCompanionAlwaysOnPollOnce,
}));

describe("RemoteCompanionAutoPollHost", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(isTauri).mockReturnValue(false);
    vi.mocked(runRemoteCompanionAlwaysOnPollOnce).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not poll in browser fallback", () => {
    render(<RemoteCompanionAutoPollHost />);

    expect(runRemoteCompanionAlwaysOnPollOnce).not.toHaveBeenCalled();
  });

  it("polls immediately, repeats on interval, and clears the interval on unmount", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const { unmount } = render(<RemoteCompanionAutoPollHost />);

    expect(runRemoteCompanionAlwaysOnPollOnce).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(REMOTE_COMPANION_AUTO_POLL_INTERVAL_MS);
    });
    expect(runRemoteCompanionAlwaysOnPollOnce).toHaveBeenCalledTimes(2);

    unmount();
    await act(async () => {
      vi.advanceTimersByTime(REMOTE_COMPANION_AUTO_POLL_INTERVAL_MS);
    });
    expect(runRemoteCompanionAlwaysOnPollOnce).toHaveBeenCalledTimes(2);
  });
});
