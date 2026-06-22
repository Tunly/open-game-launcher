import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CloudSaveSet, Game, UploadGameSavesToCloudResponse } from "../../lib/types";

const mocks = vi.hoisted(() => ({
  getCloudSaveSetByGameKey: vi.fn(),
  markCloudSaveSetSynced: vi.fn(),
  uploadGameSavesToCloud: vi.fn(),
  useCurrentUser: vi.fn(),
}));

vi.mock("../useCurrentUser", () => ({
  useCurrentUser: (...args: unknown[]) => mocks.useCurrentUser(...args),
}));

vi.mock("../../lib/supabase/cloud-saves", () => ({
  getCloudSaveSetByGameKey: (...args: unknown[]) => mocks.getCloudSaveSetByGameKey(...args),
  markCloudSaveSetSynced: (...args: unknown[]) => mocks.markCloudSaveSetSynced(...args),
}));

vi.mock("../../lib/launcher", () => ({
  uploadGameSavesToCloud: (...args: unknown[]) => mocks.uploadGameSavesToCloud(...args),
}));

import { useCloudAutoSync } from "../useCloudAutoSync";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "game-1",
    title: "Neon Runner",
    description: "",
    version: "1.0.0",
    launcher: "steam",
    status: "installed",
    platform: "windows",
    achievements: [],
    saveFiles: [],
    friendsPlaying: [],
    ...overrides,
  };
}

function makeCloudSaveSet(overrides: Partial<CloudSaveSet> = {}): CloudSaveSet {
  return {
    id: "set-1",
    userId: "user-1",
    localGameKey: "steam:game-1",
    launcher: "steam",
    externalId: null,
    title: "Neon Runner",
    platform: "windows",
    syncMode: "on_launch",
    lastSyncedAt: null,
    metadata: {},
    createdAt: "2026-06-17T11:00:00.000Z",
    updatedAt: "2026-06-17T11:00:00.000Z",
    ...overrides,
  };
}

function makeUploadResponse(
  overrides: Partial<UploadGameSavesToCloudResponse> = {},
): UploadGameSavesToCloudResponse {
  const game = makeGame();

  return {
    gameId: game.id,
    success: true,
    game,
    uploadedFiles: ["save-1.sav"],
    deletedCloudFiles: [],
    missingFiles: [],
    failedFiles: [],
    message: "1 file uploaded",
    ...overrides,
  };
}

function makeCurrentUser({
  accessToken = "token-1",
  userId = "user-1",
}: {
  accessToken?: string | null;
  userId?: string | null;
} = {}) {
  const user = userId ? { id: userId } : null;

  return {
    error: null,
    isConfigured: true,
    isLoading: false,
    session: user
      ? {
          access_token: accessToken,
          user,
        }
      : null,
    signOut: vi.fn(),
    user,
  };
}

describe("useCloudAutoSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-17T12:00:00.000Z"));

    mocks.getCloudSaveSetByGameKey.mockReset();
    mocks.markCloudSaveSetSynced.mockReset();
    mocks.uploadGameSavesToCloud.mockReset();
    mocks.useCurrentUser.mockReset();

    mocks.getCloudSaveSetByGameKey.mockResolvedValue(makeCloudSaveSet());
    mocks.markCloudSaveSetSynced.mockResolvedValue(undefined);
    mocks.uploadGameSavesToCloud.mockResolvedValue(makeUploadResponse());
    mocks.useCurrentUser.mockReturnValue(makeCurrentUser());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("no-ops without a game or signed-in access token", async () => {
    const onMessage = vi.fn();
    const noGame = renderHook(() => useCloudAutoSync({ game: null, onMessage }));

    await act(async () => {
      await noGame.result.current.maybeSyncOnLaunch();
    });

    noGame.unmount();
    mocks.useCurrentUser.mockReturnValue(makeCurrentUser({ accessToken: null }));

    const noToken = renderHook(() => useCloudAutoSync({ game: makeGame(), onMessage }));

    await act(async () => {
      await noToken.result.current.maybeSyncOnLaunch();
    });

    expect(mocks.getCloudSaveSetByGameKey).not.toHaveBeenCalled();
    expect(mocks.uploadGameSavesToCloud).not.toHaveBeenCalled();
    expect(mocks.markCloudSaveSetSynced).not.toHaveBeenCalled();
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("uploads on launch and marks the cloud save set synced on success", async () => {
    const game = makeGame({ id: "steam-42", title: "Sky Keep" });
    const onMessage = vi.fn();
    mocks.getCloudSaveSetByGameKey.mockResolvedValue(
      makeCloudSaveSet({
        id: "set-42",
        localGameKey: "steam:steam-42",
        title: "Sky Keep",
        syncMode: "on_launch",
      }),
    );
    mocks.uploadGameSavesToCloud.mockResolvedValue(
      makeUploadResponse({
        game,
        gameId: game.id,
        message: "2 files uploaded",
        uploadedFiles: ["slot1.sav", "slot2.sav"],
      }),
    );

    const { result } = renderHook(() => useCloudAutoSync({ game, onMessage }));

    await act(async () => {
      await result.current.maybeSyncOnLaunch();
    });

    expect(mocks.getCloudSaveSetByGameKey).toHaveBeenCalledWith("steam:steam-42");
    expect(mocks.uploadGameSavesToCloud).toHaveBeenCalledWith("steam-42", {
      accessToken: "token-1",
      userId: "user-1",
    });
    expect(mocks.markCloudSaveSetSynced).toHaveBeenCalledWith("set-42");
    expect(onMessage.mock.calls.map(([message]) => message)).toEqual([
      "Auto-syncing save to cloud\u2026",
      "Auto-sync complete: 2 files uploaded",
    ]);
  });

  it("does not upload when the cloud save set is not configured for on-launch sync", async () => {
    const onMessage = vi.fn();
    mocks.getCloudSaveSetByGameKey.mockResolvedValue(
      makeCloudSaveSet({
        syncMode: "manual",
      }),
    );

    const { result } = renderHook(() => useCloudAutoSync({ game: makeGame(), onMessage }));

    await act(async () => {
      await result.current.maybeSyncOnLaunch();
    });

    expect(mocks.getCloudSaveSetByGameKey).toHaveBeenCalledWith("steam:game-1");
    expect(mocks.uploadGameSavesToCloud).not.toHaveBeenCalled();
    expect(mocks.markCloudSaveSetSynced).not.toHaveBeenCalled();
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("surfaces partial and failed upload messages", async () => {
    const onMessage = vi.fn();
    mocks.uploadGameSavesToCloud.mockResolvedValueOnce(
      makeUploadResponse({
        success: false,
        failedFiles: ["slot1.sav", "slot2.sav"],
        message: "2 files failed",
      }),
    );

    const partial = renderHook(() => useCloudAutoSync({ game: makeGame(), onMessage }));

    await act(async () => {
      await partial.result.current.maybeSyncOnLaunch();
    });

    expect(onMessage.mock.calls.map(([message]) => message)).toEqual([
      "Auto-syncing save to cloud\u2026",
      "Auto-sync partial: 2 files failed.",
    ]);
    expect(mocks.markCloudSaveSetSynced).not.toHaveBeenCalled();

    partial.unmount();
    onMessage.mockClear();
    mocks.uploadGameSavesToCloud.mockResolvedValueOnce(
      makeUploadResponse({
        success: false,
        failedFiles: [],
        message: "native upload failed",
      }),
    );

    const failed = renderHook(() =>
      useCloudAutoSync({ game: makeGame({ id: "game-2" }), onMessage }),
    );

    await act(async () => {
      await failed.result.current.maybeSyncOnLaunch();
    });

    expect(onMessage.mock.calls.map(([message]) => message)).toEqual([
      "Auto-syncing save to cloud\u2026",
      "Auto-sync failed: native upload failed",
    ]);
    expect(mocks.markCloudSaveSetSynced).not.toHaveBeenCalled();
  });

  it("surfaces thrown errors as skipped messages", async () => {
    const onMessage = vi.fn();
    mocks.uploadGameSavesToCloud.mockRejectedValue(new Error("desktop upload unavailable"));

    const { result } = renderHook(() => useCloudAutoSync({ game: makeGame(), onMessage }));

    await act(async () => {
      await result.current.maybeSyncOnLaunch();
    });

    expect(mocks.markCloudSaveSetSynced).not.toHaveBeenCalled();
    expect(onMessage.mock.calls.map(([message]) => message)).toEqual([
      "Auto-syncing save to cloud\u2026",
      "Cloud auto-sync skipped: desktop upload unavailable",
    ]);
  });

  it("uses a 60s per-game lock to prevent duplicate uploads", async () => {
    const { result } = renderHook(() => useCloudAutoSync({ game: makeGame() }));

    await act(async () => {
      await result.current.maybeSyncOnLaunch();
    });

    vi.setSystemTime(new Date("2026-06-17T12:00:59.999Z"));

    await act(async () => {
      await result.current.maybeSyncOnLaunch();
    });

    expect(mocks.getCloudSaveSetByGameKey).toHaveBeenCalledTimes(1);
    expect(mocks.uploadGameSavesToCloud).toHaveBeenCalledTimes(1);
    expect(mocks.markCloudSaveSetSynced).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-06-17T12:01:00.000Z"));

    await act(async () => {
      await result.current.maybeSyncOnLaunch();
    });

    expect(mocks.getCloudSaveSetByGameKey).toHaveBeenCalledTimes(2);
    expect(mocks.uploadGameSavesToCloud).toHaveBeenCalledTimes(2);
    expect(mocks.markCloudSaveSetSynced).toHaveBeenCalledTimes(2);
  });
});
