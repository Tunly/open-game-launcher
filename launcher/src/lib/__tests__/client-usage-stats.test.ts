import { beforeEach, describe, expect, it } from "vitest";

import {
  listClientUsagePlatformStats,
  readClientUsageStats,
  recordClientUsageSample,
  resetClientUsageStats,
  setClientUsageStatsEnabled,
} from "../client-usage-stats";
import { STORAGE_KEYS } from "../storage-keys";
import type { ClientUpdateStatus } from "../types";

function status(overrides: Partial<ClientUpdateStatus>): ClientUpdateStatus {
  return {
    canOpenUpdater: false,
    detail: "ok",
    displayName: "Steam",
    history: [],
    installed: false,
    lastCheckedAt: "2026-06-10T10:00:00Z",
    latestKnownVersion: null,
    localUpdaterPath: null,
    officialDownloadUri: null,
    platformId: "steam",
    running: false,
    schedulerEnabled: true,
    statusLabel: "Current",
    updateAvailable: false,
    updatePolicy: "notifyOnly",
    ...overrides,
  };
}

describe("client usage stats", () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.CLIENT_USAGE_STATS);
  });

  it("does not record platform checks until the user opts in", () => {
    recordClientUsageSample([status({ installed: true, running: true })]);

    expect(listClientUsagePlatformStats()).toEqual([]);
  });

  it("records local per-platform check, update, install, and running counters", () => {
    setClientUsageStatsEnabled(true, "2026-06-10T09:00:00Z");

    recordClientUsageSample(
      [
        status({ installed: true, running: true, updateAvailable: true }),
        status({
          displayName: "GOG Galaxy",
          lastCheckedAt: "2026-06-10T10:01:00Z",
          platformId: "gog",
        }),
      ],
      "2026-06-10T10:02:00Z",
    );
    recordClientUsageSample([status({ installed: true })], "2026-06-10T10:03:00Z");

    expect(listClientUsagePlatformStats()).toMatchObject([
      {
        checkCount: 2,
        displayName: "Steam",
        installedSeenCount: 2,
        runningSeenCount: 1,
        updateCount: 1,
      },
      {
        checkCount: 1,
        displayName: "GOG Galaxy",
      },
    ]);
  });

  it("keeps opt-in state when counters are reset", () => {
    setClientUsageStatsEnabled(true);
    recordClientUsageSample([status({ installed: true })]);

    const reset = resetClientUsageStats("2026-06-10T11:00:00Z");

    expect(reset.enabled).toBe(true);
    expect(reset.platforms).toEqual({});
    expect(readClientUsageStats().updatedAt).toBe("2026-06-10T11:00:00Z");
  });
});
