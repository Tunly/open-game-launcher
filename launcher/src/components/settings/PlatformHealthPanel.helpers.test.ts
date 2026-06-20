import { describe, expect, it } from "vitest";

import type { ClientUpdateStatus, PlatformClientHealth } from "../../lib/types";
import {
  buildPlatformHealthCards,
  buildPlatformHealthSummary,
} from "./PlatformHealthPanel.helpers";

function health(overrides: Partial<PlatformClientHealth>): PlatformClientHealth {
  return {
    canLaunch: true,
    displayName: "Steam",
    installed: true,
    installPath: "/apps/steam",
    lastCheckedAt: "2026-06-10T10:00:00.000Z",
    pid: 1337,
    platformId: "steam",
    processName: "steam.exe",
    running: true,
    statusLabel: "Running",
    uptimeSeconds: 7200,
    ...overrides,
  };
}

function update(overrides: Partial<ClientUpdateStatus>): ClientUpdateStatus {
  return {
    canOpenUpdater: true,
    detail: "Current build installed.",
    displayName: "Steam",
    history: [],
    installed: true,
    installedVersion: "stable",
    lastCheckedAt: "2026-06-10T10:00:00.000Z",
    latestKnownVersion: "stable",
    localUpdaterPath: null,
    officialDownloadUri: null,
    platformId: "steam",
    running: true,
    schedulerEnabled: false,
    statusLabel: "Current",
    updateAvailable: false,
    updatePolicy: "manual",
    ...overrides,
  };
}

describe("buildPlatformHealthCards", () => {
  it("scores running current clients as healthy", () => {
    const cards = buildPlatformHealthCards(
      [
        health({
          platformId: "steam",
          windowHandle: "0x1234",
          windowTitle: "Steam Library",
        }),
      ],
      {
        steam: update({ platformId: "steam" }),
      },
      { steam: true },
    );

    expect(cards[0]).toMatchObject({
      detailLine: "steam.exe / PID 1337 / Window Steam Library (0x1234) / /apps/steam",
      id: "steam",
      score: 100,
      statusLabel: "Running",
      tone: "good",
    });
    expect(cards[0]?.badges).toEqual(["Installed", "Running", "Launchable", "Linked", "Current"]);
  });

  it("marks installed clients with updates as warning", () => {
    const cards = buildPlatformHealthCards(
      [
        health({
          platformId: "gog",
          displayName: "GOG Galaxy",
          running: false,
          pid: null,
          processName: null,
          statusLabel: "Available",
        }),
      ],
      {
        gog: update({
          platformId: "gog",
          displayName: "GOG Galaxy",
          running: false,
          statusLabel: "Update available",
          updateAvailable: true,
        }),
      },
    );
    const gog = cards.find((card) => card.id === "gog");

    expect(gog).toMatchObject({
      score: 45,
      statusLabel: "Update needed",
      tone: "warning",
    });
    expect(gog?.badges).toContain("Update available");
  });

  it("keeps missing desktop-only clients at zero", () => {
    const cards = buildPlatformHealthCards(
      [
        health({
          canLaunch: false,
          installed: false,
          installPath: null,
          pid: null,
          platformId: "epic",
          processName: null,
          running: false,
          statusLabel: "Desktop only",
        }),
      ],
      {
        epic: update({
          displayName: "Epic Games",
          installed: false,
          platformId: "epic",
          running: false,
          statusLabel: "Missing",
        }),
      },
    );
    const epic = cards.find((card) => card.id === "epic");

    expect(epic).toMatchObject({
      score: 0,
      statusLabel: "Desktop only",
      tone: "missing",
    });
    expect(epic?.badges).toEqual(["Missing"]);
  });

  it("builds an aggregate score from detection, login, and updates", () => {
    const summary = buildPlatformHealthSummary({
      healthStatuses: [
        health({ platformId: "steam" }),
        health({
          displayName: "GOG Galaxy",
          platformId: "gog",
          pid: null,
          processName: null,
          running: false,
          statusLabel: "Available",
        }),
      ],
      loginStatuses: {
        gog: true,
        steam: true,
      },
      updateStatuses: {
        gog: update({
          displayName: "GOG Galaxy",
          platformId: "gog",
          running: false,
          statusLabel: "Update available",
          updateAvailable: true,
        }),
        steam: update({ platformId: "steam" }),
      },
    });

    expect(summary).toMatchObject({
      detectedCount: 2,
      loginConnectedCount: 2,
      loginPlatformCount: 6,
      score: 36,
      tone: "missing",
      totalPlatforms: 7,
      updateCheckedCount: 2,
      updateCurrentCount: 1,
    });
  });
});
