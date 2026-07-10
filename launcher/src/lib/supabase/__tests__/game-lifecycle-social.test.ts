import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  postActivity: vi.fn(),
  setLauncherPresence: vi.fn(),
  setLauncherPresenceForSession: vi.fn(),
}));

vi.mock("../activity", () => ({ postActivity: mocks.postActivity }));
vi.mock("../presence", async (importOriginal) => {
  const original = await importOriginal<typeof import("../presence")>();
  return {
    ...original,
    setLauncherPresence: mocks.setLauncherPresence,
    setLauncherPresenceForSession: mocks.setLauncherPresenceForSession,
  };
});

import { normalizeLifecyclePlatform, syncGameLifecycleSocial } from "../game-lifecycle-social";

const startedEvent = {
  event: "game_started" as const,
  gameId: "steam-owned-440",
  launcher: "steam",
  occurredAt: "2026-07-09T12:00:00.000Z",
  running: true,
  title: "Team Fortress 2",
};

describe("game lifecycle social sync", () => {
  beforeEach(() => {
    mocks.postActivity.mockReset();
    mocks.setLauncherPresence.mockReset();
    mocks.setLauncherPresenceForSession.mockReset();
    mocks.postActivity.mockResolvedValue({ id: "activity-1" });
    mocks.setLauncherPresence.mockResolvedValue(null);
    mocks.setLauncherPresenceForSession.mockResolvedValue(null);
  });

  it("posts game start and exposes the real title and platform in presence", async () => {
    await syncGameLifecycleSocial(startedEvent, "online");

    expect(mocks.postActivity).toHaveBeenCalledWith("game_start", {
      gameId: "steam-owned-440",
      gameTitle: "Team Fortress 2",
      metadata: {
        launcher: "steam",
        platform: "steam",
        platformGameId: "steam-owned-440",
        platformSource: "launcher_lifecycle",
      },
      visibility: "friends_only",
    });
    expect(mocks.setLauncherPresence).toHaveBeenCalledWith({
      currentGameId: null,
      currentGameTitle: "Team Fortress 2",
      platform: "steam",
      platformGameId: "steam-owned-440",
      platformLastPolledAt: "2026-07-09T12:00:00.000Z",
      platformSource: "launcher_lifecycle",
      status: "online",
    });
  });

  it("posts game stop and clears stale game presence", async () => {
    await syncGameLifecycleSocial(
      { ...startedEvent, event: "game_stopped", running: false },
      "away",
    );

    expect(mocks.postActivity).toHaveBeenCalledWith(
      "game_stop",
      expect.objectContaining({ gameId: "steam-owned-440" }),
    );
    expect(mocks.setLauncherPresence).toHaveBeenCalledWith({
      currentGameId: null,
      currentGameTitle: null,
      platform: null,
      platformGameId: null,
      platformLastPolledAt: "2026-07-09T12:00:00.000Z",
      platformSource: null,
      status: "away",
    });
  });

  it("still updates presence when activity posting fails and reports the failure", async () => {
    mocks.postActivity.mockRejectedValueOnce(new Error("activity insert failed"));

    await expect(syncGameLifecycleSocial(startedEvent, "online")).rejects.toThrow(
      "activity insert failed",
    );
    expect(mocks.setLauncherPresence).toHaveBeenCalledOnce();
  });

  it("binds lifecycle presence writes to the captured account when provided", async () => {
    const expectedSession = {
      generation: "33333333-3333-4333-8333-333333333333",
      userId: "user-1",
    };
    await syncGameLifecycleSocial(startedEvent, "online", expectedSession);

    expect(mocks.setLauncherPresenceForSession).toHaveBeenCalledWith(
      expectedSession,
      expect.objectContaining({ currentGameTitle: "Team Fortress 2", status: "online" }),
    );
    expect(mocks.setLauncherPresence).not.toHaveBeenCalled();
  });

  it("normalizes legacy launcher names", () => {
    expect(normalizeLifecyclePlatform("Uplay")).toBe("ubisoft");
    expect(normalizeLifecyclePlatform("Battle.net Launcher")).toBe("battlenet");
    expect(normalizeLifecyclePlatform("manual")).toBeNull();
  });
});
