import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  postActivity: vi.fn(),
}));

vi.mock("../../lib/supabase/activity", () => ({
  postActivity: (...args: unknown[]) => mocks.postActivity(...args),
}));

import { useActivityLogger } from "../useActivityLogger";

type ActivityLogger = ReturnType<typeof useActivityLogger>;

describe("useActivityLogger", () => {
  beforeEach(() => {
    mocks.postActivity.mockReset();
    mocks.postActivity.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    {
      name: "logGameStart",
      call: (logger: ActivityLogger) =>
        logger.logGameStart("game-1", "Neon Rally", { launchSource: "library" }),
      expected: [
        "game_start",
        {
          gameId: "game-1",
          gameTitle: "Neon Rally",
          metadata: { launchSource: "library" },
          visibility: "friends_only",
        },
      ],
    },
    {
      name: "logGameStop",
      call: (logger: ActivityLogger) =>
        logger.logGameStop("game-1", "Neon Rally", { elapsedMinutes: 42 }),
      expected: [
        "game_stop",
        {
          gameId: "game-1",
          gameTitle: "Neon Rally",
          metadata: { elapsedMinutes: 42 },
          visibility: "friends_only",
        },
      ],
    },
    {
      name: "logAchievement",
      call: (logger: ActivityLogger) =>
        logger.logAchievement("game-2", "Sky Keep", "First Clear", { rarity: "rare" }),
      expected: [
        "achievement_unlocked",
        {
          achievementName: "First Clear",
          gameId: "game-2",
          gameTitle: "Sky Keep",
          metadata: { rarity: "rare" },
          visibility: "friends_only",
        },
      ],
    },
    {
      name: "logScreenshot",
      call: (logger: ActivityLogger) =>
        logger.logScreenshot(null, null, "https://cdn.example/screenshot.jpg", {
          source: "overlay",
        }),
      expected: [
        "screenshot_taken",
        {
          gameId: null,
          gameTitle: null,
          metadata: { source: "overlay" },
          screenshotUrl: "https://cdn.example/screenshot.jpg",
          visibility: "friends_only",
        },
      ],
    },
  ])("posts the $name payload", async ({ call, expected }) => {
    const { result } = renderHook(() => useActivityLogger());

    await act(async () => {
      await call(result.current);
    });

    expect(mocks.postActivity.mock.calls).toEqual([expected]);
  });

  it("does not throw when postActivity rejects", async () => {
    const error = new Error("activity insert failed");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.postActivity.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useActivityLogger());

    await expect(result.current.logGameStart("game-1", "Neon Rally")).resolves.toBeUndefined();

    expect(mocks.postActivity).toHaveBeenCalledWith("game_start", {
      gameId: "game-1",
      gameTitle: "Neon Rally",
      metadata: undefined,
      visibility: "friends_only",
    });
    expect(warn).toHaveBeenCalledWith("[ActivityLogger] Failed to post game_start:", error);
  });
});
