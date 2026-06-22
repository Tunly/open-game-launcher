import { isTauri } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  readRemoteDownloadAlwaysOnConfigured,
  refreshDownloadQueueForRemotePoll,
  runRemoteCompanionAlwaysOnPollOnce,
  runRemoteCompanionInstallJobPollOnce,
} from "./remote-companion-auto-poll";
import { STORAGE_KEYS } from "./storage-keys";
import { useDownloadStore } from "../stores/downloadStore";
import { getDownloadQueue, pollRemoteCompanionInstallJobsOnce } from "./launcher";

vi.mock("./launcher", () => ({
  getDownloadQueue: vi.fn(),
  pollRemoteCompanionInstallJobsOnce: vi.fn(),
}));

const emptyPollResult = {
  claimed: 0,
  configured: true,
  failed: 0,
  jobs: [],
  started: 0,
};

describe("remote companion auto poll runner", () => {
  beforeEach(() => {
    vi.mocked(isTauri).mockReturnValue(false);
    vi.mocked(getDownloadQueue).mockReset();
    vi.mocked(getDownloadQueue).mockResolvedValue([]);
    vi.mocked(pollRemoteCompanionInstallJobsOnce).mockReset();
    vi.mocked(pollRemoteCompanionInstallJobsOnce).mockResolvedValue(emptyPollResult);
    useDownloadStore.getState().setItems([]);
  });

  it("reads Always-On as false for missing, bad, or false storage values", () => {
    expect(readRemoteDownloadAlwaysOnConfigured()).toBe(false);

    window.localStorage.setItem(STORAGE_KEYS.REMOTE_DOWNLOAD_ALWAYS_ON_CONFIGURED, "not-json");
    expect(readRemoteDownloadAlwaysOnConfigured()).toBe(false);

    window.localStorage.setItem(
      STORAGE_KEYS.REMOTE_DOWNLOAD_ALWAYS_ON_CONFIGURED,
      JSON.stringify(false),
    );
    expect(readRemoteDownloadAlwaysOnConfigured()).toBe(false);
  });

  it("runs only in Tauri with Always-On enabled", async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.REMOTE_DOWNLOAD_ALWAYS_ON_CONFIGURED,
      JSON.stringify(true),
    );

    await expect(runRemoteCompanionAlwaysOnPollOnce()).resolves.toBeNull();
    expect(pollRemoteCompanionInstallJobsOnce).not.toHaveBeenCalled();

    vi.mocked(isTauri).mockReturnValue(true);
    await runRemoteCompanionAlwaysOnPollOnce();

    expect(pollRemoteCompanionInstallJobsOnce).toHaveBeenCalledWith(5);
  });

  it("deduplicates unresolved manual and auto poll calls", async () => {
    let resolvePoll!: (value: typeof emptyPollResult) => void;
    vi.mocked(pollRemoteCompanionInstallJobsOnce).mockReturnValue(
      new Promise((resolve) => {
        resolvePoll = resolve;
      }),
    );

    const first = runRemoteCompanionInstallJobPollOnce(5);
    const second = runRemoteCompanionInstallJobPollOnce(5);

    expect(pollRemoteCompanionInstallJobsOnce).toHaveBeenCalledTimes(1);
    resolvePoll(emptyPollResult);
    await expect(Promise.all([first, second])).resolves.toEqual([emptyPollResult, emptyPollResult]);
  });

  it("refreshes the queue only after claimed or started jobs", async () => {
    await refreshDownloadQueueForRemotePoll(emptyPollResult);
    expect(getDownloadQueue).not.toHaveBeenCalled();

    vi.mocked(getDownloadQueue).mockResolvedValue([
      {
        bytesDownloaded: null,
        bytesTotal: null,
        canCancel: true,
        canPause: true,
        eta: 0,
        external: false,
        gameId: "store-demo",
        id: "download-store-demo",
        lastUpdatedAt: 1,
        phase: "download",
        platform: "local",
        progress: 0,
        progressSource: "http_range",
        provider: "local",
        rawStatus: "downloading",
        speed: "Waiting...",
        status: "downloading",
        title: "Store Demo",
      },
    ]);

    await refreshDownloadQueueForRemotePoll({
      ...emptyPollResult,
      claimed: 1,
      started: 1,
    });

    expect(getDownloadQueue).toHaveBeenCalledTimes(1);
    expect(useDownloadStore.getState().items).toHaveLength(1);
  });
});
