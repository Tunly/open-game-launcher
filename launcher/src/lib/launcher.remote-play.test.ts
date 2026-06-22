import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getRemotePlayDescriptor, startRemotePlay } from "./launcher";
import type { Game } from "./types";

describe("remote play launcher delegation", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockClear();
  });

  it("describes Steam Remote Play from the external app id without native invoke", () => {
    const descriptor = getRemotePlayDescriptor(
      makeGame({
        cloudGamingUrl: "https://play.og-launcher.example/remote/portal-2",
        externalId: "620",
        launcher: "steam",
      }),
    );

    expect(descriptor).toMatchObject({
      actionLabel: "Remote Play",
      detail: "Official Steam delegation",
      providerLabel: "Steam",
      statusLabel: "Steam AppID 620",
      supported: true,
    });
    expect(descriptor.request).toMatchObject({
      cloudGamingUrl: "https://play.og-launcher.example/remote/portal-2",
      externalId: "620",
      launcher: "steam",
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("keeps Remote Play start desktop-only in browser previews", async () => {
    await expect(
      startRemotePlay(
        makeGame({
          externalId: "620",
          launcher: "steam",
        }),
      ),
    ).rejects.toThrow("desktop app");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("allows official launcher URI descriptors without launching them in tests", () => {
    const descriptor = getRemotePlayDescriptor(
      makeGame({
        launchUri: "goggalaxy://openGameView/1207664643",
        launcher: "gog",
      }),
    );

    expect(descriptor).toMatchObject({
      detail: "Official launcher URI",
      providerLabel: "Launcher",
      statusLabel: "GOG URI",
      supported: true,
    });
    expect(descriptor.request?.launchUri).toBe("goggalaxy://openGameView/1207664643");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("describes Epic/EOS launcher URIs as local review-only delegation", () => {
    const descriptor = getRemotePlayDescriptor(
      makeGame({
        launchUri: "com.epicgames.launcher://apps/Fortnite?action=launch",
        launcher: "epic",
      }),
    );

    expect(descriptor).toMatchObject({
      detail: "Official launcher URI",
      providerLabel: "Launcher",
      statusLabel: "Epic URI",
      supported: true,
    });
    expect(descriptor.request?.launchUri).toBe(
      "com.epicgames.launcher://apps/Fortnite?action=launch",
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("rejects unsafe remote delegates without building a launch request", () => {
    const descriptor = getRemotePlayDescriptor(
      makeGame({
        cloudGamingUrl: "http://stream.example/unsafe",
        launchUri: "javascript:alert(1)",
        launcher: "manual",
      }),
    );

    expect(descriptor).toMatchObject({
      detail: "No supported Remote Play URI.",
      supported: false,
    });
    expect(descriptor.request).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
});

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    description: "Remote Play local proof fixture",
    id: "remote-play-proof",
    platform: "windows",
    status: "installed",
    title: "Portal 2 Remote Proof",
    version: "1.0.0",
    ...overrides,
  };
}
