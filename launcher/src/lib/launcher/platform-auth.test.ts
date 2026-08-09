import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => tauriMocks);

import { normalizeSteamOwnedGames } from "./platform-auth";

describe("normalizeSteamOwnedGames", () => {
  beforeEach(() => {
    tauriMocks.invoke.mockReset();
  });

  it("keeps real games", () => {
    const games = normalizeSteamOwnedGames([
      {
        appid: 4000,
        name: "Garry's Mod",
        playtime_forever: 360,
      },
      {
        appid: 2734790,
        name: "Call of Duty: Black Ops 7",
      },
    ]);

    expect(games.map((game) => game.title)).toEqual(["Garry's Mod", "Call of Duty: Black Ops 7"]);
  });

  it("filters Call of Duty hub DLC placeholders", () => {
    const games = normalizeSteamOwnedGames([
      {
        appid: 4000,
        name: "Garry's Mod",
      },
      {
        appid: 3123456,
        name: "BO7 DLC01 Game Stub 01",
      },
      {
        appid: 3123457,
        name: "BO7 DLC17 Standard Launch Tracker",
      },
      {
        appid: 3123458,
        name: "BO7 DLC19 Game Pass Launch Tracker",
      },
      {
        appid: 3123459,
        name: "BO7 DLC56 Game Pass Pack 03",
      },
    ]);

    expect(games.map((game) => game.title)).toEqual(["Garry's Mod"]);
  });
});
