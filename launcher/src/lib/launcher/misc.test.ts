import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => tauriMocks);

import { getCrossPlayLaunchIdentity, launchCrossPlayJoin } from "./misc";

describe("cross-play launcher helpers", () => {
  beforeEach(() => {
    tauriMocks.invoke.mockReset();
    tauriMocks.invoke.mockResolvedValue("steam://run/480");
  });

  it("prefers the provider external id over an internal id", () => {
    expect(
      getCrossPlayLaunchIdentity({
        externalId: " 480 ",
        id: "steam-owned-480",
        title: "Neon Circuit",
      }),
    ).toBe("480");
  });

  it("fails closed instead of forwarding an internal wrapper id", () => {
    expect(() =>
      getCrossPlayLaunchIdentity({
        externalId: " ",
        id: "steam-owned-480",
        title: "Neon Circuit",
      }),
    ).toThrow("exact provider launch identity");
  });

  it("passes the selected identity through the native gameSlug command argument", async () => {
    await launchCrossPlayJoin("steam", "480");

    expect(tauriMocks.invoke).toHaveBeenCalledWith("launch_cross_play_join", {
      gameSlug: "480",
      platform: "steam",
    });
  });
});
